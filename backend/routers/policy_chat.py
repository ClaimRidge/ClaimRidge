"""Medical Policy RAG chatbot for insurer users.

Endpoint: POST /api/policy-chat

The LLM is given a single tool — `search_policy_handbook(query, top_k)` — that
runs vector similarity against the caller's own `policy_chunks` (scoped by
`insurer_id`). The model decides when to call it, can call it multiple times
to triangulate, and produces a final answer with inline citation markers.

Every chunk retrieved across the conversation is returned alongside the answer
so the frontend can render source cards. Citations in the answer use `[#1]`,
`[#2]`, etc., 1-indexed in the order the sources are first seen.
"""

import json
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from pydantic import BaseModel

from core.database import supabase
from core.security import get_current_user
from services.ai_services import get_embeddings, get_llm

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/policy-chat", tags=["policy-chat"])


@router.get("/status")
async def policy_status(current_user=Depends(get_current_user)):
    """Lightweight check used by the chat page to know whether the caller's
    insurer has a policy uploaded. The browser Supabase client can't read
    `policy_chunks` directly (no RLS read policy), so we surface it here."""
    insurer_id = _resolve_insurer(current_user.id)
    chunks = supabase.table("policy_chunks").select("id", count="exact").eq(
        "insurer_id", insurer_id
    ).limit(1).execute()
    ins = supabase.table("insurers").select("config, name").eq(
        "id", insurer_id
    ).maybe_single().execute()
    config = (ins.data or {}).get("config") or {}
    return {
        "has_policy": bool(chunks.count and chunks.count > 0),
        "chunk_count": chunks.count or 0,
        "policy_file_name": config.get("policy_file_name") or "",
        "insurer_name": (ins.data or {}).get("name") or "",
    }


# --- Wire models ----------------------------------------------------------
class ChatMessage(BaseModel):
    role: str  # 'user' | 'assistant'
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []


class SourceChunk(BaseModel):
    citation: int  # 1-indexed for the user
    chunk_id: str
    content: str
    similarity: float


class ChatResponse(BaseModel):
    answer: str
    sources: List[SourceChunk]
    tool_calls: int  # how many times the LLM hit the policy index


# --- System prompt --------------------------------------------------------
SYSTEM_PROMPT = """You are ClaimRidge Policy Assistant, an expert on the insurer's medical
policy handbook. Your sole job is to answer questions about what the policy says.

## How you must work
1. For ANY question that could be answered by the policy, call the
   `search_policy_handbook` tool first. Do NOT answer from general knowledge.
2. If the first search is unclear or partial, call the tool again with a
   reformulated query (synonyms, sub-topics, specific procedure/diagnosis names).
3. You may call the tool up to 4 times per question to triangulate.
4. After your searches, write a concise, professional answer grounded in the
   retrieved excerpts. Cite each claim with `[#N]` where N is the source number
   (the order chunks were returned, 1-indexed).
5. If the retrieved excerpts do NOT contain the answer, say so plainly:
   "The policy handbook does not address this directly." — do not invent
   coverage rules, exclusions, or thresholds.

## Citation rules
- Cite every factual claim. Example: "Inpatient stays require 24h notice [#2]."
- A sentence may cite multiple sources: "...covered [#1][#3]."
- Do not cite sources you did not receive in tool output.
- Do not list a "Sources" section at the end — the UI renders source cards.

## Style
- Clear, professional, plain English suitable for a medical claims reviewer.
- Quote specific thresholds, codes, or numerical limits verbatim from the policy.
- Refuse off-topic questions politely: "I can only help with this insurer's
  medical policy."
"""


def _search_policy_tool_schema():
    """LangChain tool schema in OpenAI-style for ChatGroq.bind_tools."""
    return {
        "type": "function",
        "function": {
            "name": "search_policy_handbook",
            "description": (
                "Search the insurer's medical policy handbook by semantic similarity. "
                "Returns the top-k most relevant policy excerpts. Use this for ANY "
                "question about coverage, exclusions, prior-auth requirements, "
                "billing rules, or clinical criteria."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "A focused search query — a phrase, condition, "
                                       "procedure name, or policy topic. Reformulate "
                                       "with synonyms if a previous call was vague.",
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "How many excerpts to return (1-8). Default 5.",
                        "default": 5,
                    },
                },
                "required": ["query"],
            },
        },
    }


def _resolve_insurer(user_id: str) -> str:
    res = (
        supabase.table("profiles")
        .select("insurer_id, account_type")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    if not res.data or res.data.get("account_type") != "insurance":
        raise HTTPException(status_code=403, detail="Insurer access required.")
    insurer_id = res.data.get("insurer_id")
    if not insurer_id:
        raise HTTPException(status_code=403, detail="No insurer linked to your profile.")
    return insurer_id


def _run_policy_search(insurer_id: str, query: str, top_k: int) -> List[dict]:
    """Embeds the query, runs match_policy_rules, returns chunk rows."""
    top_k = max(1, min(int(top_k or 5), 8))
    try:
        embeddings = get_embeddings()
        vec = embeddings.embed_query(query)
    except Exception as e:
        logger.error(f"Embedding failed for policy-chat query: {e}")
        return []

    try:
        rpc = supabase.rpc("match_policy_rules", {
            "query_embedding": vec,
            "match_threshold": 0.25,
            "match_count": top_k,
            "p_insurer_id": insurer_id,
        }).execute()
        return rpc.data or []
    except Exception as e:
        logger.error(f"match_policy_rules RPC failed: {e}")
        return []


@router.post("", response_model=ChatResponse)
async def policy_chat(payload: ChatRequest, current_user=Depends(get_current_user)):
    """Tool-using chat over the insurer's policy handbook."""
    insurer_id = _resolve_insurer(current_user.id)

    # Confirm there's actually a policy uploaded — saves the user from a
    # confusing "the policy doesn't say anything" answer.
    has_chunks = supabase.table("policy_chunks").select("id").eq(
        "insurer_id", insurer_id
    ).limit(1).execute()
    if not has_chunks.data:
        return ChatResponse(
            answer=(
                "No policy handbook has been uploaded for this workspace yet. "
                "Upload one from Settings → Policy Guidelines and try again."
            ),
            sources=[],
            tool_calls=0,
        )

    # Build the message history for the LLM
    messages = [SystemMessage(content=SYSTEM_PROMPT)]
    for m in payload.history[-12:]:  # cap history to keep context tight
        if m.role == "user":
            messages.append(HumanMessage(content=m.content))
        elif m.role == "assistant":
            messages.append(AIMessage(content=m.content))
    messages.append(HumanMessage(content=payload.message))

    llm = get_llm().bind_tools([_search_policy_tool_schema()])

    # Track every chunk surfaced across all tool calls — dedup by chunk id,
    # numbered 1-based in first-seen order so the LLM can cite [#N].
    seen_chunks: dict[str, dict] = {}  # chunk_id -> {citation, content, similarity}

    tool_calls_used = 0
    MAX_TOOL_HOPS = 4

    for _ in range(MAX_TOOL_HOPS):
        response = await llm.ainvoke(messages)
        tool_calls = getattr(response, "tool_calls", None) or []

        if not tool_calls:
            # LLM produced its final answer — done.
            messages.append(response)
            break

        # Execute every tool call the LLM requested in this round
        messages.append(response)
        for call in tool_calls:
            tool_calls_used += 1
            name = call.get("name") or (call.get("function") or {}).get("name")
            raw_args = call.get("args") or (call.get("function") or {}).get("arguments") or {}
            if isinstance(raw_args, str):
                try:
                    args = json.loads(raw_args)
                except Exception:
                    args = {}
            else:
                args = dict(raw_args)

            tool_call_id = call.get("id") or call.get("tool_call_id") or ""

            if name != "search_policy_handbook":
                messages.append(ToolMessage(
                    content=json.dumps({"error": f"Unknown tool: {name}"}),
                    tool_call_id=tool_call_id,
                ))
                continue

            query = str(args.get("query") or "").strip()
            top_k = args.get("top_k", 5)
            if not query:
                messages.append(ToolMessage(
                    content=json.dumps({"error": "query is required"}),
                    tool_call_id=tool_call_id,
                ))
                continue

            rows = _run_policy_search(insurer_id, query, top_k)

            # Assign / reuse citation numbers, build the tool payload
            tool_payload = []
            for row in rows:
                cid = str(row["id"])
                if cid not in seen_chunks:
                    seen_chunks[cid] = {
                        "citation": len(seen_chunks) + 1,
                        "chunk_id": cid,
                        "content": row["content"],
                        "similarity": float(row.get("similarity") or 0.0),
                    }
                entry = seen_chunks[cid]
                tool_payload.append({
                    "citation": entry["citation"],
                    "content": entry["content"],
                    "similarity": round(entry["similarity"], 3),
                })

            messages.append(ToolMessage(
                content=json.dumps({
                    "query": query,
                    "results": tool_payload,
                    "instructions": (
                        "Cite these by their `citation` number using [#N]. If results "
                        "are empty or off-topic, call the tool again with a "
                        "reformulated query or tell the user the handbook does "
                        "not address this."
                    ),
                }),
                tool_call_id=tool_call_id,
            ))
    else:
        # Hit the tool-hop ceiling — force a final answer with no more tools
        final = await get_llm().ainvoke(messages + [HumanMessage(
            content="Wrap up: write your final answer now using only the excerpts "
                    "already retrieved. Cite with [#N] markers."
        )])
        messages.append(final)

    # The last AI message is the final answer
    answer = ""
    for m in reversed(messages):
        if isinstance(m, AIMessage) and (m.content or "").strip():
            answer = m.content if isinstance(m.content, str) else str(m.content)
            break

    sources = [
        SourceChunk(
            citation=v["citation"],
            chunk_id=v["chunk_id"],
            content=v["content"],
            similarity=v["similarity"],
        )
        for v in sorted(seen_chunks.values(), key=lambda x: x["citation"])
    ]

    return ChatResponse(answer=answer or "(no answer produced)", sources=sources, tool_calls=tool_calls_used)
