// Planning Center Groups API wrapper (groups/v2).
const PCO_GROUPS_BASE = "https://api.planningcenteronline.com/groups/v2";
const PCO_PEOPLE_BASE = "https://api.planningcenteronline.com/people/v2";

function authHeader() {
  const id = process.env.PCO_APP_ID;
  const secret = process.env.PCO_SECRET;
  if (!id || !secret) throw new Error("Planning Center is not configured (missing PCO_APP_ID / PCO_SECRET).");
  const token = Buffer.from(`${id}:${secret}`).toString("base64");
  return `Basic ${token}`;
}

async function pcoFetch(url: string) {
  const res = await fetch(url, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PCO ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export type PcoGroup = { id: string; name: string };
export type PcoGroupType = { id: string; name: string };
export type PcoGroupLeader = { person_id: string; name: string; phone: string | null };

// ---- Caches ----
const CACHE_MS = 60_000;
let groupsCache: { key: string; at: number; data: PcoGroup[] } | null = null;
const leadersCache = new Map<string, { at: number; data: PcoGroupLeader[] }>();

export function invalidateGroupsCache() {
  groupsCache = null;
  leadersCache.clear();
}

export async function listGroupTypes(): Promise<PcoGroupType[]> {
  const out: PcoGroupType[] = [];
  let next: string | null = `${PCO_GROUPS_BASE}/group_types?per_page=100`;
  while (next) {
    const json: any = await pcoFetch(next);
    for (const t of json.data ?? []) {
      out.push({ id: String(t.id), name: t.attributes?.name ?? "(unnamed)" });
    }
    next = json.links?.next ?? null;
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function listGroupsByType(groupTypeId: string, opts?: { bypass_cache?: boolean }): Promise<PcoGroup[]> {
  const key = groupTypeId;
  if (!opts?.bypass_cache && groupsCache && groupsCache.key === key && Date.now() - groupsCache.at < CACHE_MS) {
    return groupsCache.data;
  }
  const out: PcoGroup[] = [];
  let next: string | null = `${PCO_GROUPS_BASE}/group_types/${encodeURIComponent(groupTypeId)}/groups?per_page=100`;
  while (next) {
    const json: any = await pcoFetch(next);
    for (const g of json.data ?? []) {
      // Skip archived groups when possible
      if (g.attributes?.archived_at) continue;
      out.push({ id: String(g.id), name: g.attributes?.name ?? "(unnamed)" });
    }
    next = json.links?.next ?? null;
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  groupsCache = { key, at: Date.now(), data: out };
  return out;
}

function pickPhone(numbers: any[]): string | null {
  if (!numbers?.length) return null;
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

export async function listGroupLeaders(groupId: string, opts?: { bypass_cache?: boolean }): Promise<PcoGroupLeader[]> {
  const cached = leadersCache.get(groupId);
  if (!opts?.bypass_cache && cached && Date.now() - cached.at < CACHE_MS) return cached.data;

  // 1. Fetch memberships with role=leader; include person to get names + pco people ids.
  const leaders: { person_id: string; name: string }[] = [];
  let next: string | null = `${PCO_GROUPS_BASE}/groups/${encodeURIComponent(groupId)}/memberships?where[role]=leader&include=person&per_page=100`;
  while (next) {
    const json: any = await pcoFetch(next);
    const included: any[] = json.included ?? [];
    for (const m of json.data ?? []) {
      const personRel = m.relationships?.person?.data;
      if (!personRel) continue;
      const inc = included.find((i) => i.type === "Person" && i.id === personRel.id);
      // Groups Person has first_name, last_name, name
      const name =
        inc?.attributes?.name ??
        `${inc?.attributes?.first_name ?? ""} ${inc?.attributes?.last_name ?? ""}`.trim() ??
        "(unknown)";
      leaders.push({ person_id: String(personRel.id), name });
    }
    next = json.links?.next ?? null;
  }

  // 2. Fetch each leader's phone via People API.
  const out: PcoGroupLeader[] = [];
  for (const l of leaders) {
    try {
      const json: any = await pcoFetch(
        `${PCO_PEOPLE_BASE}/people/${encodeURIComponent(l.person_id)}?include=phone_numbers`,
      );
      const phones = (json.included ?? []).filter((i: any) => i.type === "PhoneNumber");
      out.push({ person_id: l.person_id, name: l.name, phone: pickPhone(phones) });
    } catch {
      out.push({ person_id: l.person_id, name: l.name, phone: null });
    }
  }

  leadersCache.set(groupId, { at: Date.now(), data: out });
  return out;
}
