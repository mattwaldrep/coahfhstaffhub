import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { access_token: "test-token", expires_at: "2099-01-01" } }) }) }) }) }) }) },
}));

import { searchTrackVersions } from "./spotify.server";

afterEach(() => vi.unstubAllGlobals());

describe("manual Spotify version search", () => {
  it("searches the typed song and artist without automatic-match restrictions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ tracks: { items: [{ uri: "spotify:track:version2", name: "Holy Forever (Live)", artists: [{ name: "Chris Tomlin" }], album: { name: "Live Worship" }, external_urls: { spotify: "https://open.spotify.com/track/version2" } }] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const tracks = await searchTrackVersions(" Holy Forever Chris Tomlin live ");
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("q")).toBe("Holy Forever Chris Tomlin live");
    expect(url.searchParams.get("type")).toBe("track");
    expect(tracks[0]).toEqual({ uri: "spotify:track:version2", name: "Holy Forever (Live)", artists: "Chris Tomlin", album: "Live Worship", url: "https://open.spotify.com/track/version2" });
  });

  it("returns an empty list when no version matches", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ tracks: { items: [] } }), { status: 200 })));
    expect(await searchTrackVersions("unknown version")).toEqual([]);
  });

  it("surfaces Spotify failures instead of treating them as no matches", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 })));
    await expect(searchTrackVersions("Holy Forever")).rejects.toThrow("Spotify 503");
  });
});