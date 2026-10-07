import { createServerFn } from "@tanstack/react-start";

export type LLJPost = {
  id: number;
  title: string;
  date: string;
  link: string;
  excerptHtml: string;
  contentHtml: string;
};

function sanitizeHtml(html: string): string {
  return html
    // Drop scripts/styles/iframes entirely
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    // Strip inline event handlers (onclick=, onload=, ...)
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    // Strip javascript: URLs
    .replace(/(href|src)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"')
    .replace(/(href|src)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'");
}

export const getLatestLeadLikeJesusPost = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ post: LLJPost | null; error?: string }> => {
    try {
      const url =
        "https://leadlikejesus.com/wp-json/wp/v2/posts?per_page=1&_fields=id,date,link,title,content,excerpt";
      const res = await fetch(url, {
        headers: { "User-Agent": "COAHStaffHub/1.0 (devotional fetcher)" },
      });
      if (!res.ok) return { post: null, error: `Upstream ${res.status}` };
      const arr = (await res.json()) as Array<{
        id: number;
        date: string;
        link: string;
        title: { rendered: string };
        content: { rendered: string };
        excerpt: { rendered: string };
      }>;
      const first = arr[0];
      if (!first) return { post: null, error: "No posts found" };
      return {
        post: {
          id: first.id,
          title: decodeEntities(first.title.rendered),
          date: first.date,
          link: first.link,
          excerptHtml: sanitizeHtml(first.excerpt.rendered),
          contentHtml: sanitizeHtml(first.content.rendered),
        },
      };
    } catch (e: any) {
      return { post: null, error: e?.message ?? "Failed to fetch" };
    }
  },
);

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "’")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&hellip;/g, "…")
    .replace(/&#8230;/g, "…")
    .replace(/&#39;/g, "'");
}

export const getLatestTruthForLifeDevotional = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ post: LLJPost | null; error?: string }> => {
    try {
      const pageUrl = "https://www.truthforlife.org/daily/?tab=alistair_begg_devotional";
      const res = await fetch(pageUrl, {
        headers: { "User-Agent": "COAHStaffHub/1.0 (devotional fetcher)" },
      });
      if (!res.ok) return { post: null, error: `Upstream ${res.status}` };
      const html = await res.text();

      const tabIdx = html.indexOf("id=alistair_begg_devotional");
      if (tabIdx < 0) return { post: null, error: "Devotional section not found" };
      const tab = html.slice(tabIdx, tabIdx + 60000);

      const pick = (re: RegExp) => tab.match(re)?.[1]?.trim() ?? "";
      const title = decodeEntities(pick(/content-cluster__title>([\s\S]*?)<\/h1>/));
      const scriptureText = decodeEntities(
        pick(/devotional_scripture_text>([\s\S]*?)<\/div>/).replace(/<[^>]+>/g, ""),
      );
      const scriptureRef = decodeEntities(
        pick(/devotional_scripture_reference>([\s\S]*?)<\/div>/).replace(/<[^>]+>/g, ""),
      );
      const body = pick(/<div class=content-body[^>]*>([\s\S]*?)<\/div>\s*<div class=devotional-subhead/);
      const questionsBlock = pick(/<div class=devotional-questions>([\s\S]*?)<\/div>\s*<\/div>/);
      const questions = [...questionsBlock.matchAll(/devotional-questions__text>([\s\S]*?)<\/p>/g)]
        .map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ")).trim())
        .filter(Boolean);

      if (!title && !body) return { post: null, error: "No devotional content found" };

      const dateMatch = tab.match(/date=(\d{2})\/(\d{2})\/(\d{4})/);
      const date = dateMatch
        ? new Date(`${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}T12:00:00Z`).toISOString()
        : new Date().toISOString();

      const parts: string[] = [];
      if (scriptureText)
        parts.push(
          `<blockquote><p>${scriptureText}</p>${scriptureRef ? `<p><strong>${scriptureRef}</strong></p>` : ""}</blockquote>`,
        );
      if (body) parts.push(sanitizeHtml(body));
      if (questions.length)
        parts.push(
          `<p><strong>Questions for Thought</strong></p><ul>${questions.map((q) => `<li>${q}</li>`).join("")}</ul>`,
        );

      return {
        post: {
          id: 0,
          title: title || "Truth for Life Daily",
          date,
          link: pageUrl,
          excerptHtml: parts.join(""),
          contentHtml: parts.join(""),
        },
      };
    } catch (e: any) {
      return { post: null, error: e?.message ?? "Failed to fetch" };
    }
  },
);

export const getLatestSolidJoysPost = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ post: LLJPost | null; error?: string }> => {
    try {
      const res = await fetch("https://feed.desiringgod.org/solid-joys.rss", {
        headers: { "User-Agent": "COAHStaffHub/1.0 (devotional fetcher)" },
      });
      if (!res.ok) return { post: null, error: `Upstream ${res.status}` };
      const xml = await res.text();
      const item = xml.match(/<item>([\s\S]*?)<\/item>/)?.[1];
      if (!item) return { post: null, error: "No posts found" };
      const tag = (t: string) => {
        const m = item.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`));
        return (m?.[1] ?? "").replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").trim();
      };
      const html = sanitizeHtml(tag("content:encoded") || tag("description"));
      const pub = tag("pubDate");
      const link = tag("link") || "https://www.desiringgod.org/solid-joys";
      return {
        post: {
          id: 0,
          title: decodeEntities(tag("title")),
          date: pub ? new Date(pub).toISOString() : new Date().toISOString(),
          link,
          excerptHtml: html,
          contentHtml: html,
        },
      };
    } catch (e: any) {
      return { post: null, error: e?.message ?? "Failed to fetch" };
    }
  },
);
