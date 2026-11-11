import { createFileRoute } from "@tanstack/react-router";

function redirect(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } });
}

export const Route = createFileRoute("/api/public/spotify/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (url.searchParams.get("error") || !code || !state) return redirect("/meeting?spotify=error");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const sp = await import("@/server/spotify.server");
        // Single-use state ties this callback to the staff member who started it.
        const { data: row } = await supabaseAdmin.from("oauth_states")
          .select("user_id, expires_at").eq("state", state).eq("provider", sp.SPOTIFY_PROVIDER).maybeSingle();
        await supabaseAdmin.from("oauth_states").delete().eq("state", state);
        if (!row || new Date(row.expires_at).getTime() < Date.now()) return redirect("/meeting?spotify=error");
        const { basic } = sp.spotifyEnv();
        const res = await fetch("https://accounts.spotify.com/api/token", {
          method: "POST",
          headers: { Authorization: basic, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: sp.SPOTIFY_REDIRECT_URI }),
        });
        const tok = await res.json().catch(() => ({}));
        if (!res.ok || !tok.refresh_token) {
          console.error("Spotify token exchange failed:", res.status, tok?.error);
          return redirect("/meeting?spotify=error");
        }
        // Keep one shared church connection.
        await supabaseAdmin.from("user_integrations").delete().eq("provider", sp.SPOTIFY_PROVIDER);
        const { error } = await supabaseAdmin.from("user_integrations").insert({
          user_id: row.user_id, provider: sp.SPOTIFY_PROVIDER,
          refresh_token: tok.refresh_token, access_token: tok.access_token,
          expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(), scope: tok.scope,
        });
        if (error) return redirect("/meeting?spotify=error");
        return redirect("/meeting?spotify=connected");
      },
    },
  },
});
