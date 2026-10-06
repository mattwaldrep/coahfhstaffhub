import { getRequest } from "@tanstack/react-start/server";

// Pastoral/member data must never reach the AI-assisted build workspace
// (church AI policy). Any request not coming from the published site is redacted.
const DEV_HOST = /(^localhost|^127\.|id-preview--|^preview--|-dev\.lovable\.app|lovableproject\.com|sandbox)/i;

export function isDevRequest(): boolean {
  try {
    const req = getRequest();
    if (!req) return false;
    const host =
      req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host;
    const origin = req.headers.get("origin") || req.headers.get("referer") || "";
    return DEV_HOST.test(host) || DEV_HOST.test(origin.replace(/^https?:\/\//, ""));
  } catch {
    return false; // no request context (cron jobs) — production behaviour
  }
}

export const REDACTED_NOTE = "[Note content redacted for development]";

function num(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 100 + (h % 900);
}
export const fakeName = (id: string) => `Member #${num(id)}`;
export const fakePhone = (id: string) => `(555) 010-0${num(id)}`;
