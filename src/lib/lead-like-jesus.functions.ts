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
