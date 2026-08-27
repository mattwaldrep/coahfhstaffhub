// Server-only Planning Center Registrations (sign-ups) wrapper.
// Reuses the existing PCO_APP_ID / PCO_SECRET basic auth credentials.

const REG_BASE = "https://api.planningcenteronline.com/registrations/v2";

function authHeader() {
  const id = process.env.PCO_APP_ID;
  const secret = process.env.PCO_SECRET;
  if (!id || !secret) {
    throw new Error("Planning Center is not configured (missing PCO_APP_ID / PCO_SECRET).");
  }
  const token = Buffer.from(`${id}:${secret}`).toString("base64");
  return `Basic ${token}`;
}

async function pcoFetch(path: string): Promise<any> {
  const url = path.startsWith("http") ? path : `${REG_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PCO ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export type SignupSession = {
  /** SignupTime id — the stable key for one calendar occurrence. */
  signup_time_id: string;
  signup_id: string;
  name: string;
  description: string | null;
  registration_url: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  session_index: number;
  session_count: number;
};

type SignupRow = {
  id: string;
  name: string;
  description: string | null;
  registration_url: string | null;
  archived: boolean;
};

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
  return text.length ? text : null;
}

async function listSignups(maxPages = 3): Promise<SignupRow[]> {
  const out: SignupRow[] = [];
  let next: string | null = `/signups?per_page=50&order=-created_at`;
  let pages = 0;
  while (next && pages < maxPages) {
    pages += 1;
    const json: any = await pcoFetch(next);
    for (const s of json.data ?? []) {
      const a = s.attributes ?? {};
      if (a.archived) continue;
      out.push({
        id: String(s.id),
        name: a.name ?? "Untitled sign-up",
        description: stripHtml(a.description),
        registration_url: a.new_registration_url ?? null,
        archived: !!a.archived,
      });
    }
    next = json.links?.next ?? null;
  }
  return out;
}

async function signupTimes(signupId: string) {
  try {
    const json: any = await pcoFetch(`/signups/${signupId}/signup_times?per_page=100`);
    return (json.data ?? []).map((t: any) => ({
      id: String(t.id),
      starts_at: t.attributes?.starts_at as string | null,
      ends_at: (t.attributes?.ends_at as string | null) ?? null,
      all_day: !!t.attributes?.all_day,
    }));
  } catch (e: any) {
    console.error(`[pco-registrations] times(${signupId})`, e?.message);
    return [];
  }
}

async function signupLocation(signupId: string): Promise<string | null> {
  try {
    const json: any = await pcoFetch(`/signups/${signupId}/signup_location`);
    const a = json?.data?.attributes;
    if (!a) return null;
    const parts = [a.name, a.formatted_address ? String(a.formatted_address).replace(/\n/g, ", ") : null]
      .filter(Boolean);
    return parts.length ? parts.join(" — ") : null;
  } catch {
    return null;
  }
}

/**
 * All future sessions across non-archived sign-ups, one row per SignupTime.
 * Cached briefly because it fans out to several PCO endpoints.
 */
let cache: { at: number; data: SignupSession[] } | null = null;
const CACHE_MS = 60_000;

export async function fetchUpcomingSignupSessions(opts?: {
  bypass_cache?: boolean;
  horizon_days?: number;
}): Promise<SignupSession[]> {
  if (!opts?.bypass_cache && cache && Date.now() - cache.at < CACHE_MS) return cache.data;

  const signups = await listSignups();
  const now = Date.now() - 12 * 60 * 60 * 1000; // keep today's sessions visible
  const horizon = opts?.horizon_days
    ? Date.now() + opts.horizon_days * 24 * 60 * 60 * 1000
    : Infinity;

  const out: SignupSession[] = [];
  // Bounded concurrency so we don't hammer the PCO API.
  const queue = [...signups];
  const worker = async () => {
    while (queue.length) {
      const s = queue.shift();
      if (!s) break;
      const times = await signupTimes(s.id);
      const future = times
        .filter((t: any) => t.starts_at && Date.parse(t.starts_at) >= now && Date.parse(t.starts_at) <= horizon)
        .sort((a: any, b: any) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
      if (future.length === 0) continue;
      const location = await signupLocation(s.id);
      future.forEach((t: any, i: number) => {
        out.push({
          signup_time_id: String(t.id),
          signup_id: s.id,
          name: s.name,
          description: s.description,
          registration_url: s.registration_url,
          location,
          starts_at: t.starts_at,
          ends_at: t.ends_at,
          all_day: t.all_day,
          session_index: i + 1,
          session_count: future.length,
        });
      });
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));

  out.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  cache = { at: Date.now(), data: out };
  return out;
}

export function clearSignupCache() {
  cache = null;
}
