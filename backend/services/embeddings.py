"""Thin wrapper around the Gemini v1beta `embedContent` endpoint.

We use this instead of `langchain_google_genai.GoogleGenerativeAIEmbeddings`
for two reasons:

1. On the current project's API key, only `gemini-embedding-001` /
   `gemini-embedding-2` are exposed. Those models support `embedContent` and
   `asyncBatchEmbedContent`, but NOT `batchEmbedContents` — which is the
   endpoint langchain-google-genai 2.x calls under the hood. The library
   currently 404s.

2. The above models default to 3072-dim output. We want 768-dim to match the
   existing `policy_chunks.embedding vector(768)` column. Gemini supports
   Matryoshka truncation via `outputDimensionality` on `embedContent`.

The class implements the minimal subset of langchain's `Embeddings` interface
(`embed_documents`, `embed_query`) so it slots into existing code unchanged.
"""

import asyncio
import logging
import urllib.parse
from typing import List

import httpx

from core.config import Config

logger = logging.getLogger(__name__)


class GeminiHTTPEmbeddings:
    """768-dim Gemini embeddings via direct HTTP. Sequential calls — Gemini
    rate-limits ~60 RPM on the free tier, and the policy-chunking flow already
    batches at the caller level."""

    def __init__(
        self,
        model: str = "gemini-embedding-001",
        output_dimensionality: int = 768,
        api_key: str | None = None,
    ):
        self.model = model
        self.output_dimensionality = output_dimensionality
        self.api_key = api_key or Config.GEMINI_API_KEY
        self.endpoint = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:embedContent"
        )

    def _embed_one(self, text: str, task_type: str) -> List[float]:
        params = {"key": self.api_key}
        url = f"{self.endpoint}?{urllib.parse.urlencode(params)}"
        body = {
            "model": f"models/{self.model}",
            "content": {"parts": [{"text": text}]},
            "taskType": task_type,
            "outputDimensionality": self.output_dimensionality,
        }
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(url, json=body)
        if resp.status_code != 200:
            raise RuntimeError(
                f"Gemini embedContent failed ({resp.status_code}): {resp.text}"
            )
        data = resp.json()
        values = (data.get("embedding") or {}).get("values")
        if not values:
            raise RuntimeError(f"Gemini embedContent returned no values: {data}")
        return values

    # ---- langchain Embeddings protocol ----
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        out: List[List[float]] = []
        for i, t in enumerate(texts):
            out.append(self._embed_one(t, task_type="RETRIEVAL_DOCUMENT"))
        return out

    def embed_query(self, text: str) -> List[float]:
        return self._embed_one(text, task_type="RETRIEVAL_QUERY")

    # async variants for symmetry with langchain interface (used by some chains)
    async def aembed_documents(self, texts: List[str]) -> List[List[float]]:
        return await asyncio.to_thread(self.embed_documents, texts)

    async def aembed_query(self, text: str) -> List[float]:
        return await asyncio.to_thread(self.embed_query, text)
