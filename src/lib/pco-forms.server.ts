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
  fieldMap: Map<string, { label: string; sequence: number }>,
): FormSubmissionField[] {
  const valueRels = submission.relationships?.form_submission_values?.data ?? [];
  const grouped = new Map<string, { label: string; sequence: number; values: string[] }>();
  for (const ref of valueRels) {
    const valNode = included.get(`${ref.type}:${ref.id}`);
    if (!valNode) continue;
    const fieldRef = valNode.relationships?.form_field?.data;
    const fieldId = fieldRef?.id ?? `_v:${ref.id}`;
    const fromMap = fieldRef ? fieldMap.get(String(fieldRef.id)) : undefined;
    const fieldNode = fieldRef ? included.get(`${fieldRef.type}:${fieldRef.id}`) : null;
    const label =
      fromMap?.label ??
      fieldNode?.attributes?.label ??
      fieldNode?.attributes?.description ??
      "Field";
    const sequence = Number(fromMap?.sequence ?? fieldNode?.attributes?.sequence ?? 0);
    const attrs = valNode.attributes ?? {};
    const display = attrs.display_value ?? attrs.response ?? attrs.value ?? "";
    const cur = grouped.get(fieldId) ?? { label, sequence, values: [] as string[] };
    if (display !== null && display !== undefined && String(display).length > 0) {
      cur.values.push(String(display));
    }
    grouped.set(fieldId, cur);
  }
  return Array.from(grouped.values())
    .map((g) => ({ label: g.label, sequence: g.sequence, value: g.values.join(", ") }))
    .sort((a, b) => a.sequence - b.sequence);
}

async function loadFormFieldMap(
  formId: string,
): Promise<Map<string, { label: string; sequence: number }>> {
  const map = new Map<string, { label: string; sequence: number }>();
  const tryPaths = [
    `/forms/${formId}/form_fields?per_page=100`,
    `/forms/${formId}?include=form_fields`,
    `/forms/${formId}/form_submissions?include=form_submission_values.form_field&per_page=1`,
  ];
  for (const path of tryPaths) {
    try {
      const json: any = await pcoFetch(path);
      const fromIncluded = (json.included ?? []).filter((n: any) => n.type === "FormField");
      const rows: any[] = Array.isArray(json.data) && json.data[0]?.type === "FormField"
        ? json.data
        : fromIncluded;
      for (const f of rows) {
        const a = f.attributes ?? {};
        map.set(String(f.id), {
          label: a.label || a.description || "Field",
          sequence: Number(a.sequence ?? 0),
        });
      }
      console.log(`[pco-forms] loadFormFieldMap(${formId}) ${path} -> ${rows.length} fields, included types: ${Array.from(new Set((json.included ?? []).map((i: any) => i.type)))}`);
      if (map.size > 0) break;
    } catch (e: any) {
      console.error(`[pco-forms] loadFormFieldMap(${formId}) ${path} failed:`, e?.message);
    }
  }
  return map;
}

export async function listFormSubmissions(
  formId: string,
  sinceIso: string,
): Promise<FormSubmission[]> {
  const sinceMs = Date.parse(sinceIso);
  const out: FormSubmission[] = [];
  const fieldMap = await loadFormFieldMap(formId);
  console.log(`[pco-forms] form ${formId} fieldMap size=${fieldMap.size}`, Array.from(fieldMap.entries()).slice(0, 3));
  const params = new URLSearchParams({
    include: "person,form_submission_values.form_field",
    order: "-created_at",
    per_page: "50",
  });
  let next: string | null = `/forms/${formId}/form_submissions?${params.toString()}`;
  let pages = 0;
  let logged = false;
  outer: while (next && pages < 10) {
    pages += 1;
    const json: any = await pcoFetch(next);
    const included = indexIncluded(json.included ?? []);
    if (!logged && json.data?.length) {
      logged = true;
      const sample = json.data[0];
      const valueRels = sample.relationships?.form_submission_values?.data ?? [];
      const firstVal = valueRels[0] ? included.get(`${valueRels[0].type}:${valueRels[0].id}`) : null;
      console.log(`[pco-forms] form ${formId} sub ${sample.id} valueRels=${valueRels.length}`);
      console.log(`[pco-forms] firstVal rels:`, JSON.stringify(firstVal?.relationships ?? null).slice(0, 400));
      console.log(`[pco-forms] firstVal attrs:`, JSON.stringify(firstVal?.attributes ?? null).slice(0, 300));
      console.log(`[pco-forms] included types:`, Array.from(new Set((json.included ?? []).map((i: any) => i.type))));
    }
    for (const sub of json.data ?? []) {
      const createdAt: string = sub.attributes?.created_at ?? "";
      const createdMs = createdAt ? Date.parse(createdAt) : NaN;
      if (!isNaN(createdMs) && !isNaN(sinceMs) && createdMs < sinceMs) {
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
        fields: buildFields(sub, included, fieldMap),
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
