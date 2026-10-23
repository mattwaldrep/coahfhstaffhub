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
  // The tag-groups endpoint excludes PCO's standalone "Individual Tags".
  // Read the full tag catalog and its group relationship, across every page.
  const groups = new Map<string, PcoTagGroup>();
  let next: string | null = "/tags?include=tag_group&per_page=100";
  const seenPages = new Set<string>();
  while (next) {
    if (seenPages.has(next)) throw new Error("Planning Center tag pagination repeated a page");
    seenPages.add(next);
    const j = await pcoFetch(next);
    for (const item of j.included ?? []) {
      if (item.type !== "TagGroup") continue;
      const id = String(item.id);
      if (!groups.has(id)) groups.set(id, { id, name: item.attributes.name, tags: [] });
    }
    for (const tag of j.data ?? []) {
      const groupId = tag.relationships?.tag_group?.data?.id;
      const id = groupId == null ? "individual-tags" : String(groupId);
      let group = groups.get(id);
      if (!group) {
        group = { id, name: groupId == null ? "Individual Tags" : "Other Tags", tags: [] };
        groups.set(id, group);
      }
      if (!group.tags.some((item) => item.id === String(tag.id))) {
        group.tags.push({ id: String(tag.id), name: tag.attributes.name, color: tag.attributes.color ?? null });
      }
    }
    next = j.links?.next ?? null;
  }
  return [...groups.values()].filter((group) => group.tags.length > 0);
}

export async function fetchCalendarInstance(id: string) {
  const j = await pcoFetch(`/event_instances/${encodeURIComponent(id)}?include=event`);
  const d = j.data;
  if (!d?.id || !d.attributes?.starts_at) throw new Error('Planning Center event not found');
  const event = (j.included ?? []).find((item: any) => item.type === 'Event');
  return { id: String(d.id), event_id: String(d.relationships?.event?.data?.id ?? ''), name: d.attributes.name ?? event?.attributes?.name ?? 'Untitled', starts_at: d.attributes.starts_at };
}

export type PcoEventDetails = { owner_name: string | null; rooms: string[]; resources: string[] };

/** Event owner (name only) and booked rooms/resources from PCO Calendar. */
export async function fetchEventDetails(instanceId: string, eventId: string): Promise<PcoEventDetails> {
  const [eventJson, bookingsJson] = await Promise.all([
    pcoFetch(`/events/${encodeURIComponent(eventId)}?include=owner`),
    pcoFetch(`/event_instances/${encodeURIComponent(instanceId)}/resource_bookings?include=resource&per_page=100`),
  ]);
  const owner = (eventJson.included ?? []).find((i: any) => i.type === 'Person');
  const rooms: string[] = [];
  const resources: string[] = [];
  for (const r of bookingsJson.included ?? []) {
    if (r.type !== 'Resource' || !r.attributes?.name) continue;
    (r.attributes.kind === 'Room' ? rooms : resources).push(r.attributes.name);
  }
  return { owner_name: owner?.attributes?.name ?? null, rooms: [...new Set(rooms)], resources: [...new Set(resources)] };
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
        tag_ids: [...new Set<string>([
          ...(d.relationships?.tags?.data ?? []).map((t: any) => String(t.id)),
          ...(events.get(evId)?.relationships?.tags?.data ?? []).map((t: any) => String(t.id)),
        ])],
      });
    }
    next = j.links?.next ?? null;
  }
  return out;
}
