// Server-only Planning Center Online wrapper.
// Uses a Personal Access Token (PCO_APP_ID:PCO_SECRET) via HTTP Basic auth.

const PCO_BASE = "https://api.planningcenteronline.com/people/v2";

function authHeader() {
  const id = process.env.PCO_APP_ID;
  const secret = process.env.PCO_SECRET;
  if (!id || !secret) {
    throw new Error("Planning Center is not configured (missing PCO_APP_ID / PCO_SECRET).");
  }
  const token = Buffer.from(`${id}:${secret}`).toString("base64");
  return `Basic ${token}`;
}

async function pcoFetch(path: string, init?: RequestInit) {
  const url = path.startsWith("http") ? path : `${PCO_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PCO ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export type PcoPerson = {
  id: string;
  name: string;
  phone: string | null;
  fields: Record<string, { datum_id: string; value: string | null }>; // keyed by field_definition_id
};

function pickPhone(numbers: any[]): string | null {
  if (!numbers || numbers.length === 0) return null;
  const score = (n: any) => {
    let s = 0;
    if (n.attributes?.primary) s += 10;
    const loc = String(n.attributes?.location ?? "").toLowerCase();
    if (loc === "mobile") s += 5;
    else if (loc === "home") s += 2;
    return s;
  };
  const best = [...numbers].sort((a, b) => score(b) - score(a))[0];
  const raw = best.attributes?.e164 ?? best.attributes?.number ?? null;
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  const d = digits.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return d ? `+${d}` : null;
}

// Tiny module-level cache.
let cache: { key: string; at: number; data: PcoPerson[] } | null = null;
const CACHE_MS = 60_000;

export async function fetchCareList(opts: {
  list_id: string;
  field_ids: string[]; // field_definition_ids we want surfaced
  bypass_cache?: boolean;
}): Promise<PcoPerson[]> {
  const key = JSON.stringify({ l: opts.list_id, f: opts.field_ids.slice().sort() });
  if (!opts.bypass_cache && cache && cache.key === key && Date.now() - cache.at < CACHE_MS) {
    return cache.data;
  }

  const people: PcoPerson[] = [];
  let next: string | null = `/lists/${opts.list_id}/people?include=field_data,phone_numbers&per_page=100`;
  while (next) {
    const json: any = await pcoFetch(next);
    const included: any[] = json.included ?? [];
    const fieldData = included.filter((i) => i.type === "FieldDatum");
    const phoneData = included.filter((i) => i.type === "PhoneNumber");

    for (const p of json.data ?? []) {
      const datumIds: string[] = (p.relationships?.field_data?.data ?? []).map((d: any) => d.id);
      const fields: PcoPerson["fields"] = {};
      for (const did of datumIds) {
        const fd = fieldData.find((f) => f.id === did);
        if (!fd) continue;
        const fieldDefId = fd.relationships?.field_definition?.data?.id;
        if (!fieldDefId || !opts.field_ids.includes(String(fieldDefId))) continue;
        fields[String(fieldDefId)] = {
          datum_id: fd.id,
          value: fd.attributes?.value ?? null,
        };
      }
      const phoneIds: string[] = (p.relationships?.phone_numbers?.data ?? []).map((d: any) => d.id);
      const phones = phoneData.filter((pn) => phoneIds.includes(pn.id));
      people.push({
        id: String(p.id),
        name: p.attributes?.name ?? `${p.attributes?.first_name ?? ""} ${p.attributes?.last_name ?? ""}`.trim(),
        phone: pickPhone(phones),
        fields,
      });
    }
  while (next) {
    const json: any = await pcoFetch(next);
    const included: any[] = json.included ?? [];
    const fieldData = included.filter((i) => i.type === "FieldDatum");

    for (const p of json.data ?? []) {
      const datumIds: string[] = (p.relationships?.field_data?.data ?? []).map((d: any) => d.id);
      const fields: PcoPerson["fields"] = {};
      for (const did of datumIds) {
        const fd = fieldData.find((f) => f.id === did);
        if (!fd) continue;
        const fieldDefId = fd.relationships?.field_definition?.data?.id;
        if (!fieldDefId || !opts.field_ids.includes(String(fieldDefId))) continue;
        fields[String(fieldDefId)] = {
          datum_id: fd.id,
          value: fd.attributes?.value ?? null,
        };
      }
      people.push({
        id: String(p.id),
        name: p.attributes?.name ?? `${p.attributes?.first_name ?? ""} ${p.attributes?.last_name ?? ""}`.trim(),
        fields,
      });
    }

    const nextLink: string | undefined = json.links?.next;
    next = nextLink ?? null;
  }

  people.sort((a, b) => a.name.localeCompare(b.name));
  cache = { key, at: Date.now(), data: people };
  return people;
}

export function invalidateCareListCache() {
  cache = null;
}

export async function setFieldDatum(opts: {
  person_id: string;
  field_definition_id: string;
  datum_id?: string | null;
  value: string;
}) {
  if (opts.datum_id) {
    await pcoFetch(`/field_data/${opts.datum_id}`, {
      method: "PATCH",
      body: JSON.stringify({
        data: {
          type: "FieldDatum",
          id: opts.datum_id,
          attributes: { value: opts.value },
        },
      }),
    });
  } else {
    await pcoFetch(`/people/${opts.person_id}/field_data`, {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "FieldDatum",
          attributes: { value: opts.value },
          relationships: {
            field_definition: {
              data: { type: "FieldDefinition", id: opts.field_definition_id },
            },
          },
        },
      }),
    });
  }
  invalidateCareListCache();
}

export type PcoFieldDef = { id: string; name: string; tab: string | null; data_type: string | null };

export async function listFieldDefinitions(): Promise<PcoFieldDef[]> {
  const out: PcoFieldDef[] = [];
  let next: string | null = `/field_definitions?include=tab&per_page=100`;
  while (next) {
    const json: any = await pcoFetch(next);
    const tabs: any[] = (json.included ?? []).filter((i: any) => i.type === "Tab");
    for (const f of json.data ?? []) {
      if (f.attributes?.deleted_at) continue;
      const tabId = f.relationships?.tab?.data?.id;
      const tab = tabs.find((t) => t.id === tabId);
      out.push({
        id: String(f.id),
        name: f.attributes?.name ?? "(unnamed)",
        tab: tab?.attributes?.name ?? null,
        data_type: f.attributes?.data_type ?? null,
      });
    }
    next = json.links?.next ?? null;
  }
  out.sort((a, b) => (a.tab ?? "").localeCompare(b.tab ?? "") || a.name.localeCompare(b.name));
  return out;
}

export async function pcoPing(): Promise<{ ok: boolean; me?: string; error?: string }> {
  try {
    const json: any = await pcoFetch(`/me`);
    return { ok: true, me: json?.data?.attributes?.name ?? "Connected" };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Failed" };
  }
}
