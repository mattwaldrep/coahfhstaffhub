import { createServerFn } from "@tanstack/react-start";

export type PublicPcoEvent = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  summary: string | null;
  description: string | null;
  church_center_url: string | null;
  registration_url: string | null;
  tag_ids: string[];
};

export type PublicPcoTag = { id: string; name: string; color: string | null; group: string };

function stripHtml(s: string | null | undefined): string | null {
  if (!s) return null;
  const text = String(s)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

/**
 * Public (unauthenticated) read of the Planning Center calendar.
 * Only returns events marked visible in Church Center, with a limited field set.
 */
export const getPublicPcoCalendar = createServerFn({ method: "GET" })
  .inputValidator((data: { rangeStart: string; rangeEnd: string }) => data)
  .handler(async ({ data }): Promise<{ events: PublicPcoEvent[]; tags: PublicPcoTag[]; error: string | null }> => {
    try {
      const from = new Date(data.rangeStart);
      // Cap the window at ~13 months to keep requests bounded.
      const maxTo = new Date(from.getTime() + 400 * 86400000);
      const to = new Date(data.rangeEnd) > maxTo ? maxTo : new Date(data.rangeEnd);

      const { fetchEventInstances, fetchTagGroups } = await import("@/server/pco-calendar.server");
      const [instances, tagGroups] = await Promise.all([
        fetchEventInstances(from.toISOString(), to.toISOString()),
        fetchTagGroups(),
      ]);

      const events: PublicPcoEvent[] = instances
        .filter((i) => i.visible_in_church_center)
        .map((i) => ({
          id: i.id,
          name: i.name,
          starts_at: i.starts_at,
          ends_at: i.ends_at,
          all_day: i.all_day,
          location: i.location,
          summary: i.summary,
          description: stripHtml(i.description),
          church_center_url: i.church_center_url,
          registration_url: i.registration_url,
          tag_ids: i.tag_ids,
        }));

      const tags: PublicPcoTag[] = tagGroups.flatMap((g) =>
        g.tags.map((t) => ({ id: t.id, name: t.name, color: t.color, group: g.name })),
      );

      return { events, tags, error: null };
    } catch (e) {
      console.error("getPublicPcoCalendar threw:", e);
      return { events: [], tags: [], error: "Calendar service unavailable" };
    }
  });
