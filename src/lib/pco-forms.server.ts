// Server-only Planning Center Forms wrapper.
// Reuses the existing PCO_APP_ID / PCO_SECRET basic auth credentials.

const PCO_PEOPLE_BASE = "https://api.planningcenteronline.com/people/v2";

function authHeader() {
  const id = process.env.PCO_APP_ID;
  const secret = process.env.PCO_SECRET;
  if (!id || !secret) {
    throw new Error("Planning Center is not configured (missing PCO_APP_ID / PCO_SECRET).");
  }
  const token = Buffer.from(`${id}:${secret}`).toString("base64");
  return `Basic ${token}`;
}

async function pcoFetch(path: string) {
  const url = path.startsWith("http") ? path : `${PCO_PEOPLE_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PCO ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export type FormSubmissionField = {
  label: string;
  value: string;
  sequence: number;
};

export type FormSubmission = {
  id: string;
  created_at: string;
  person: { id: string; name: string } | null;
  fields: FormSubmissionField[];
};

type IncludedMap = Map<string, any>; // key: `${type}:${id}`

function indexIncluded(included: any[]): IncludedMap {
  const m: IncludedMap = new Map();
  for (const inc of included ?? []) {
    if (inc?.type && inc?.id) m.set(`${inc.type}:${inc.id}`, inc);
  }
  return m;
}

function personName(p: any): string | null {
  if (!p) return null;
  const a = p.attributes ?? {};
  const name =
    a.name ||
    [a.first_name, a.last_name].filter(Boolean).join(" ").trim() ||
    null;
  return name || null;
}

function buildFields(
  submission: any,
  included: IncludedMap,
): FormSubmissionField[] {
  const valueRels = submission.relationships?.form_submission_values?.data ?? [];
  // Group by form_field id since multi-select questions can produce multiple value rows
  const grouped = new Map<string, { label: string; sequence: number; values: string[] }>();
  for (const ref of valueRels) {
    const valNode = included.get(`${ref.type}:${ref.id}`);
    if (!valNode) continue;
    const fieldRef = valNode.relationships?.form_field?.data;
    const fieldNode = fieldRef ? included.get(`${fieldRef.type}:${fieldRef.id}`) : null;
    const label = fieldNode?.attributes?.label ?? fieldNode?.attributes?.description ?? "Field";
    const sequence = Number(fieldNode?.attributes?.sequence ?? 0);
    const attrs = valNode.attributes ?? {};
    const display =
      attrs.display_value ??
      attrs.response ??
      attrs.value ??
      "";
    const fieldId = fieldRef?.id ?? `_v:${ref.id}`;
    const cur = grouped.get(fieldId) ?? { label, sequence, values: [] as string[] };
    if (display !== null && display !== undefined && String(display).length > 0) {
      cur.values.push(String(display));
    }
    grouped.set(fieldId, cur);
  }
  return Array.from(grouped.values())
    .map((g) => ({
      label: g.label,
      sequence: g.sequence,
      value: g.values.join(", "),
    }))
    .sort((a, b) => a.sequence - b.sequence);
}

export async function listFormSubmissions(
  formId: string,
  sinceIso: string,
): Promise<FormSubmission[]> {
  // PCO's `where[created_at][gte]` filter is unreliable on form_submissions in
  // some accounts (returns 0 even when submissions exist). Fetch newest first
  // and filter client-side, stopping once we cross the cutoff.
  const sinceMs = Date.parse(sinceIso);
  const out: FormSubmission[] = [];
  const params = new URLSearchParams({
    include: "person,form_submission_values.form_field",
    order: "-created_at",
    per_page: "50",
  });
  let next: string | null = `/forms/${formId}/form_submissions?${params.toString()}`;
  let pages = 0;
  outer: while (next && pages < 10) {
    pages += 1;
    const json: any = await pcoFetch(next);
    const included = indexIncluded(json.included ?? []);
    for (const sub of json.data ?? []) {
      const createdAt: string = sub.attributes?.created_at ?? "";
      const createdMs = createdAt ? Date.parse(createdAt) : NaN;
      if (!isNaN(createdMs) && !isNaN(sinceMs) && createdMs < sinceMs) {
        // Results are ordered newest-first; once we drop below the cutoff we are done.
        next = null;
        break outer;
      }
      const personRef = sub.relationships?.person?.data;
      const personNode = personRef ? included.get(`${personRef.type}:${personRef.id}`) : null;
      out.push({
        id: String(sub.id),
        created_at: createdAt,
        person: personNode
          ? { id: String(personNode.id), name: personName(personNode) ?? "Unknown" }
          : null,
        fields: buildFields(sub, included),
      });
    }
    next = json.links?.next ?? null;
  }
  return out;
}

// ---- helpers used by pco-forms.functions.ts handlers ----
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const FIRST_STEP_FORM_ID = "161115";
export const NEXT_STEP_FORM_ID = "433638";

export async function assertMeetingRole(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["core", "meeting"]);
  if (!data || data.length === 0) throw new Error("Forbidden: meeting role required");
}

export async function resolveSince(meetingId: string): Promise<{ since: string; sinceLabel: string }> {
  const { data: cur } = await supabaseAdmin
    .from("meetings")
    .select("meeting_date")
    .eq("id", meetingId)
    .maybeSingle();
  const currentDate = (cur?.meeting_date as string) ?? new Date().toISOString().slice(0, 10);
  const { data: prev } = await supabaseAdmin
    .from("meetings")
    .select("meeting_date")
    .lt("meeting_date", currentDate)
    .order("meeting_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (prev?.meeting_date) {
    const iso = new Date(`${prev.meeting_date as string}T00:00:00Z`).toISOString();
    return { since: iso, sinceLabel: prev.meeting_date as string };
  }
  const d = new Date(`${currentDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return { since: d.toISOString(), sinceLabel: d.toISOString().slice(0, 10) };
}
