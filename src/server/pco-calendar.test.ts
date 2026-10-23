import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTagGroups } from "./pco-calendar.server";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

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