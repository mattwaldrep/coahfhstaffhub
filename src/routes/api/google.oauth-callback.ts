import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/google/oauth-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const oauthError = url.searchParams.get("error");

        if (oauthError) {
          console.error("Google OAuth provider error:", oauthError);
          return redirect(`/settings?google=error&code=provider_denied`);
        }
        if (!code || !state) return redirect(`/settings?google=error&code=missing_params`);

        // Verify state nonce against server-side store
        const { data: stateRow, error: stateErr } = await supabaseAdmin
          .from("oauth_states")
          .select("user_id, expires_at, provider")
          .eq("state", state)
          .eq("provider", "google_tasks")
          .maybeSingle();

        if (stateErr || !stateRow) {
          console.error("OAuth state lookup failed:", stateErr);
          return redirect(`/settings?google=error&code=invalid_state`);
        }
        if (new Date(stateRow.expires_at).getTime() < Date.now()) {
          await supabaseAdmin.from("oauth_states").delete().eq("state", state);
          return redirect(`/settings?google=error&code=expired_state`);
        }
        const userId = stateRow.user_id;
        // One-time use
        await supabaseAdmin.from("oauth_states").delete().eq("state", state);

        const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
        const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
        if (!id || !secret) return redirect(`/settings?google=error&code=server_config`);

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
          console.error("Google token exchange failed:", tok);
          return redirect(`/settings?google=error&code=token_exchange_failed`);
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
        if (dbErr) {
          console.error("OAuth token storage failed:", dbErr);
          return redirect(`/settings?google=error&code=storage_failed`);
        }
        return redirect(`/settings?google=connected`);
      },
    },
  },
});

function redirect(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } });
}
