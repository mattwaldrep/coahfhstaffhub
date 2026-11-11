import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";

async function assertCoreOrMeeting(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role")
    .eq("user_id", userId).in("role", ["core", "meeting"]);
  if (!data?.length) throw new Error("Core or meeting staff access required.");
}

export const getSpotifyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCoreOrMeeting(context.supabase, context.userId);
    const sp = await import("@/server/spotify.server");
    return { connected: await sp.spotifyConnected() };
  });

export const getSpotifyAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCoreOrMeeting(context.supabase, context.userId);
    const sp = await import("@/server/spotify.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id } = sp.spotifyEnv();
    const state = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const { error } = await supabaseAdmin.from("oauth_states").insert({ state, user_id: context.userId, provider: sp.SPOTIFY_PROVIDER });
    if (error) throw new Error("Could not start Spotify sign-in.");
    const url = new URL("https://accounts.spotify.com/authorize");
    url.searchParams.set("client_id", id);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", sp.SPOTIFY_REDIRECT_URI);
    url.searchParams.set("scope", sp.SPOTIFY_SCOPE);
    url.searchParams.set("state", state);
    return { url: url.toString() };
  });

export type SpotifyPreviewSong = {
  title: string; author: string | null; arrangement: string | null;
  matches: Array<{ uri: string; name: string; artists: string; album: string; url: string }>;
};

export const previewSpotifySync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sundayIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string; planTitle?: string; playlist?: string; songs?: SpotifyPreviewSong[] }> => {
    await assertCoreOrMeeting(context.supabase, context.userId);
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: cfg } = await supabaseAdmin.from("pco_services_config").select("sunday_service_type_id").eq("id", true).maybeSingle();
      const serviceTypeId = cfg?.sunday_service_type_id;
      if (!serviceTypeId) return { ok: false, error: "No Sunday service is set in Settings → Planning Center Services." };
      const pco = await import("@/server/pco-services.server");
      const plan = await pco.findNextUpcomingPlan(serviceTypeId, data.sundayIso);
      if (!plan) return { ok: false, error: `No Sunday plan found on or after ${data.sundayIso}.` };
      const songs = await pco.listPlanSongs(serviceTypeId, plan.id);
      if (!songs.length) return { ok: false, error: "That Sunday plan has no songs yet." };
      const sp = await import("@/server/spotify.server");
      const playlist = await sp.playlistName();
      const out: SpotifyPreviewSong[] = [];
      for (const s of songs) out.push({ ...s, matches: await sp.searchTracks(s.title, s.author) });
      return { ok: true, planTitle: `${plan.sort_date.slice(0, 10)}${plan.title ? ` · ${plan.title}` : ""}`, playlist, songs: out };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Spotify preview failed." };
    }
  });

export const replaceSpotifyPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ uris: z.array(z.string().regex(/^spotify:track:[A-Za-z0-9]+$/)).min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCoreOrMeeting(context.supabase, context.userId);
    const sp = await import("@/server/spotify.server");
    try {
      await sp.replacePlaylist(data.uris);
      return { ok: true as const, count: data.uris.length };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Spotify update failed." };
    }
  });
