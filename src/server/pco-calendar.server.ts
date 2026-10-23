// Server-only Planning Center Calendar (read-only) wrapper.
// Reuses PCO_APP_ID / PCO_SECRET basic auth. PCO is the source of truth for events.

const CAL_BASE = "https://api.planningcenteronline.com/calendar/v2";

function authHeader() {
  const id = process.env.PCO_APP_ID;
  const secret = process.env.PCO_SECRET;
  if (!id || !secret) throw new Error("Planning Center is not configured (missing PCO_APP_ID / PCO_SECRET).");
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

async function pcoFetch(path: string): Promise<any> {
  const url = path.startsWith("http") ? path : `${CAL_BASE}${path}`;
  const res = await fetch(url, { headers: { Authorization: authHeader(), Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PCO ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export type PcoTagGroup = { id: string; name: string; tags: { id: string; name: string; color: string | null }[] };

export type PcoCalendarInstance = {
  id: string;
  event_id: string;
  name: string;
  summary: string | null;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  recurrence: string | null;
  church_center_url: string | null;
  registration_url: string | null;
  image_url: string | null;
  visible_in_church_center: boolean;
  tag_ids: string[];
};

export async function fetchTagGroups(): Promise<PcoTagGroup[]> {
  const j = await pcoFetch(`/tag_groups?include=tags&per_page=100`);
  const tags = new Map<string, any>();
  for (const i of j.included ?? []) if (i.type === "Tag") tags.set(i.id, i);
  return (j.data ?? []).map((g: any) => ({
    id: g.id,
    name: g.attributes.name,
    tags: (g.relationships?.tags?.data ?? [])
      .map((r: any) => tags.get(r.id))
      .filter(Boolean)
      .map((t: any) => ({ id: t.id, name: t.attributes.name, color: t.attributes.color ?? null })),
  }));
}

export async function fetchEventInstances(fromIso: string, toIso: string): Promise<PcoCalendarInstance[]> {
  const out: PcoCalendarInstance[] = [];
  let next: string | null =
    `/event_instances?where[starts_at][gte]=${encodeURIComponent(fromIso)}` +
    `&where[starts_at][lte]=${encodeURIComponent(toIso)}&order=starts_at&per_page=100&include=event,tags`;
  let guard = 0;
  while (next && guard++ < 40) {
    const j: any = await pcoFetch(next);
    const events = new Map<string, any>();
    for (const i of j.included ?? []) if (i.type === "Event") events.set(i.id, i);
    for (const d of j.data ?? []) {
      const a = d.attributes;
      const evId = d.relationships?.event?.data?.id ?? "";
      const ev = events.get(evId)?.attributes ?? {};
      out.push({
        id: d.id,
        event_id: evId,
        name: a.name ?? ev.name ?? "Untitled",
        summary: ev.summary ?? null,
        description: ev.description ?? null,
        starts_at: a.starts_at,
        ends_at: a.ends_at ?? null,
        all_day: !!a.all_day_event,
        location: a.location ?? null,
        recurrence: a.recurrence_description ?? null,
        church_center_url: a.church_center_url ?? null,
        registration_url: ev.registration_url ?? null,
        image_url: ev.image_url ?? null,
        visible_in_church_center: !!ev.visible_in_church_center,
        tag_ids: (d.relationships?.tags?.data ?? []).map((t: any) => t.id),
      });
    }
    next = j.links?.next ?? null;
  }
  return out;
}
