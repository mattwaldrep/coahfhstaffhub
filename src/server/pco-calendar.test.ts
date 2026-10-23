import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEventInstances, fetchFeeds, fetchTagGroups, fetchRoomCatalog } from "./pco-calendar.server";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('PCO room catalog', () => {
  it('includes rooms from every page but excludes other resources', async () => {
    vi.stubEnv('PCO_APP_ID', 'fixture-app');
    vi.stubEnv('PCO_SECRET', 'fixture-secret');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: [
        { id: '1', attributes: { name: 'Sanctuary', kind: 'Room' } },
        { id: '2', attributes: { name: 'Projector', kind: 'Resource' } },
      ], links: { next: 'https://api.planningcenteronline.com/calendar/v2/resources?offset=100' } }))
      .mockResolvedValueOnce(Response.json({ data: [
        { id: '3', attributes: { name: 'Classroom', kind: 'Room' } },
        { id: '1', attributes: { name: 'Sanctuary', kind: 'Room' } },
      ], links: {} }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchRoomCatalog()).toEqual([{ id: '3', name: 'Classroom' }, { id: '1', name: 'Sanctuary' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('reports a catalog failure instead of returning no rooms', async () => {
    vi.stubEnv('PCO_APP_ID', 'fixture-app'); vi.stubEnv('PCO_SECRET', 'fixture-secret');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(fetchRoomCatalog()).rejects.toThrow('PCO 503');
  });
});

describe("PCO feed catalog", () => {
  it("lists feeds with their type and follows pagination", async () => {
    vi.stubEnv("PCO_APP_ID", "fixture-app");
    vi.stubEnv("PCO_SECRET", "fixture-secret");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        data: [
          { type: "Feed", id: "calendar", attributes: { name: "Calendar", feed_type: "calendar" } },
          { type: "Feed", id: "12629", attributes: { name: "Community Groups", feed_type: "groups" } },
        ],
        links: { next: "https://api.planningcenteronline.com/calendar/v2/feeds?offset=100" },
      }))
      .mockResolvedValueOnce(Response.json({
        data: [{ type: "Feed", id: "8351", attributes: { name: "Registrations", feed_type: "registrations" } }],
        links: {},
      }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchFeeds()).toEqual([
      { id: "calendar", name: "Calendar", feed_type: "calendar" },
      { id: "12629", name: "Community Groups", feed_type: "groups" },
      { id: "8351", name: "Registrations", feed_type: "registrations" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("PCO feed-filtered instances", () => {
  const instance = (id: string, eventId: string, starts: string) => ({
    type: "EventInstance", id,
    attributes: { name: `Event ${id}`, starts_at: starts, all_day_event: false },
    relationships: { event: { data: { type: "Event", id: eventId } } },
  });
  const feedEvent = (id: string) => ({ type: "Event", id, attributes: { name: `Event ${id}` } });

  it("keeps only instances whose event belongs to a selected feed", async () => {
    vi.stubEnv("PCO_APP_ID", "fixture-app");
    vi.stubEnv("PCO_SECRET", "fixture-secret");
    const fetchMock = vi.fn()
      // instances page
      .mockResolvedValueOnce(Response.json({
        data: [instance("1", "e1", "2026-11-02T15:00:00Z"), instance("2", "e2", "2026-11-05T15:00:00Z"), instance("3", "e3", "2026-11-01T15:00:00Z")],
        included: [], links: {},
      }))
      // feed 12629 events (paginated)
      .mockResolvedValueOnce(Response.json({ data: [feedEvent("e1")], links: { next: "https://api.planningcenteronline.com/calendar/v2/events?offset=100" } }))
      .mockResolvedValueOnce(Response.json({ data: [feedEvent("e3")], links: {} }))
      // feed 8351 events
      .mockResolvedValueOnce(Response.json({ data: [feedEvent("e2")], links: {} }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchEventInstances("2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z", ["12629", "8351"]);
    expect(out.map((i) => i.id)).toEqual(["1", "2", "3"]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("where[feed_id]=12629");
    expect(fetchMock.mock.calls[3]?.[0]).toContain("where[feed_id]=8351");
  });

  it("drops instances outside the selected feeds", async () => {
    vi.stubEnv("PCO_APP_ID", "fixture-app");
    vi.stubEnv("PCO_SECRET", "fixture-secret");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        data: [instance("1", "e1", "2026-11-02T15:00:00Z"), instance("2", "e2", "2026-11-05T15:00:00Z")],
        included: [], links: {},
      }))
      .mockResolvedValueOnce(Response.json({ data: [feedEvent("e2")], links: {} }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchEventInstances("2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z", ["12629"]);
    expect(out.map((i) => i.id)).toEqual(["2"]);
  });

  it("ignores invalid feed ids and returns the unfiltered list", async () => {
    vi.stubEnv("PCO_APP_ID", "fixture-app");
    vi.stubEnv("PCO_SECRET", "fixture-secret");
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ data: [instance("9", "e9", "2026-11-02T15:00:00Z")], included: [], links: {} }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchEventInstances("2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z", ["bad id!"]);
    expect(out.map((i) => i.id)).toEqual(["9"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("feed_id");
  });
});

describe("PCO calendar tag catalog", () => {
  it("includes individual tags alongside grouped tags and follows pagination", async () => {
    vi.stubEnv("PCO_APP_ID", "fixture-app");
    vi.stubEnv("PCO_SECRET", "fixture-secret");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        data: [{ type: "Tag", id: "1", attributes: { name: "Youth" }, relationships: { tag_group: { data: { type: "TagGroup", id: "10" } } } }],
        included: [{ type: "TagGroup", id: "10", attributes: { name: "Ministry" } }],
        links: { next: "https://api.planningcenteronline.com/calendar/v2/tags?offset=100" },
      }))
      .mockResolvedValueOnce(Response.json({
        data: [
          { type: "Tag", id: "2", attributes: { name: "Churchwide" }, relationships: { tag_group: { data: null } } },
          { type: "Tag", id: "3", attributes: { name: "Special event" }, relationships: {} },
        ], links: { next: null },
      }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchTagGroups()).toEqual([
      { id: "10", name: "Ministry", tags: [{ id: "1", name: "Youth", color: null }] },
      { id: "individual-tags", name: "Individual Tags", tags: [
        { id: "2", name: "Churchwide", color: null },
        { id: "3", name: "Special event", color: null },
      ] },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.planningcenteronline.com/calendar/v2/tags?include=tag_group&per_page=100");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.planningcenteronline.com/calendar/v2/tags?offset=100");
  });
});