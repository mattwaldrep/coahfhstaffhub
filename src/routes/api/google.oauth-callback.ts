import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/google/oauth-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const userId = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) return redirect(`/settings?google=error&msg=${encodeURIComponent(error)}`);
        if (!code || !userId) return redirect(`/settings?google=error&msg=missing_params`);

        const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
        const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
        if (!id || !secret) return redirect(`/settings?google=error&msg=server_config`);

        const redirectUri = `${url.origin}/api/google/oauth-callback`;
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: id,
            client_secret: secret,
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
          }),
        });
        const tok = await tokenRes.json();
        if (!tokenRes.ok || !tok.refresh_token) {
          return redirect(`/settings?google=error&msg=${encodeURIComponent(JSON.stringify(tok).slice(0, 200))}`);
        }

        const expiresAt = new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString();
        const { error: dbErr } = await supabaseAdmin
          .from("user_integrations")
          .upsert(
            {
              user_id: userId,
              provider: "google_tasks",
              refresh_token: tok.refresh_token,
              access_token: tok.access_token,
              expires_at: expiresAt,
              scope: tok.scope,
            },
            { onConflict: "user_id,provider" },
          );
        if (dbErr) return redirect(`/settings?google=error&msg=${encodeURIComponent(dbErr.message)}`);
        return redirect(`/settings?google=connected`);
      },
    },
  },
});

function redirect(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } });
}
