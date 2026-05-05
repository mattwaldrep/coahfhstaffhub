import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

function getAuthEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    const missing = [
      ...(!url ? ["SUPABASE_URL"] : []),
      ...(!key ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    throw new Error(
      `Missing backend environment variable(s): ${missing.join(", ")}. Connect Lovable Cloud.`,
    );
  }

  return { url, key };
}

function createRequestSupabase(token: string) {
  const { url, key } = getAuthEnv();

  return createClient<Database>(url, key, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export const requireSupabaseAuth = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const mergedHeaders = new Headers();

    if (!mergedHeaders.has("authorization")) {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.access_token) {
        mergedHeaders.set("authorization", `Bearer ${session.access_token}`);
      }
    }

    return next({ headers: mergedHeaders });
  })
  .server(async ({ next }) => {
    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");

    if (!authHeader) {
      throw new Error("Unauthorized: No authorization header provided");
    }

    if (!authHeader.startsWith("Bearer ")) {
      throw new Error("Unauthorized: Only Bearer tokens are supported");
    }

    const token = authHeader.slice("Bearer ".length);
    if (!token) {
      throw new Error("Unauthorized: No token provided");
    }

    const requestSupabase = createRequestSupabase(token);
    const { data, error } = await requestSupabase.auth.getClaims(token);

    if (error || !data?.claims?.sub) {
      throw new Error("Unauthorized: Invalid token");
    }

    return next({
      context: {
        supabase: requestSupabase,
        userId: data.claims.sub,
        claims: data.claims,
      },
    });
  });