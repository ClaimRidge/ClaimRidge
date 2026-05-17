"use client";

import { createClient } from "@/lib/supabase/client";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "";

/**
 * Records that the current user opened a record containing patient-identifying
 * data. Call this from record-detail pages. The `purpose` is auto-captured from
 * the page context (e.g. "claim adjudication") — the user is never prompted.
 *
 * Best-effort and non-blocking: a logging failure must never break the page.
 */
export async function logPiiAccess(opts: {
  subjectType: "claim" | "pre_auth";
  subjectId: string;
  subjectLabel?: string;
  purpose: string;
  fields?: string[];
}): Promise<void> {
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`${BACKEND}/api/audit/pii-access`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        subject_type: opts.subjectType,
        subject_id: opts.subjectId,
        subject_label: opts.subjectLabel,
        purpose: opts.purpose,
        fields: opts.fields,
      }),
    });
  } catch {
    /* non-critical — auditing must not break the page */
  }
}
