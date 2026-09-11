import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { format } from "date-fns";

export type AgendaItem = {
  section_key: string;
  title: string;
  body: string | null;
  position: number | null;
  executive_session: boolean | null;
};

export type JointItem = {
  sub_section: string;
  title: string;
  body: string | null;
  position: number | null;
  executive_session: boolean | null;
};

const STANDARD_SECTIONS: { key: string; label: string }[] = [
  { key: "opening", label: "Opening / Prayer" },
  { key: "follow_up", label: "Last Meeting Follow-up" },
  { key: "pastoral", label: "Pastoral Care" },
  { key: "new_business", label: "New Business" },
  { key: "closing", label: "Closing / Prayer" },
];

const JOINT_SUBSECTIONS: { key: string; label: string }[] = [
  { key: "need_to_know", label: "What we need to know" },
  { key: "resource", label: "How can we serve / resource" },
  { key: "upcoming", label: "Upcoming events" },
  { key: "other", label: "Other / Ad hoc" },
];

/** Convert rich-text HTML into clean plain text lines. */
export function toPlainText(input: string | null | undefined): string {
  if (!input) return "";
  let s = String(input);
  if (/<[a-z/][\s\S]*>/i.test(s)) {
    s = s
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*li[^>]*>/gi, "\n• ")
      .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "");
  }
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l, i, arr) => l !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .trim();
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

const BRAND = rgb(0.78, 0.38, 0.18);
const INK = rgb(0.14, 0.15, 0.16);
const MUTED = rgb(0.46, 0.52, 0.57);

export async function buildAgendaPdf(opts: {
  meeting: {
    title: string | null;
    meeting_date: string;
    meeting_type: string;
    location: string | null;
    start_time: string | null;
  };
  agenda: AgendaItem[];
  jointItems: JointItem[];
  note?: string | null;
}): Promise<{ base64: string; filename: string }> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const W = 612;
  const H = 792;
  const M = 54;
  const maxWidth = W - M * 2;

  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const ensure = (needed: number) => {
    if (y - needed < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };

  const draw = (
    text: string,
    o: { size?: number; font?: PDFFont; color?: any; gap?: number; indent?: number } = {},
  ) => {
    const size = o.size ?? 10.5;
    const font = o.font ?? regular;
    const indent = o.indent ?? 0;
    for (const line of wrap(text, font, size, maxWidth - indent)) {
      ensure(size + 4);
      if (line) {
        page.drawText(line, {
          x: M + indent,
          y: y - size,
          size,
          font,
          color: o.color ?? INK,
        });
      }
      y -= size + 4;
    }
    y -= o.gap ?? 0;
  };

  const rule = (color = MUTED) => {
    ensure(10);
    page.drawLine({
      start: { x: M, y },
      end: { x: W - M, y },
      thickness: 0.7,
      color,
    });
    y -= 12;
  };

  const dateLabel = format(new Date(`${opts.meeting.meeting_date}T00:00:00`), "EEEE, MMMM d, yyyy");
  const isJoint = opts.meeting.meeting_type === "joint";

  draw("CITY ON A HILL FOREST HILLS", { size: 9, font: bold, color: BRAND });
  draw(opts.meeting.title ?? (isJoint ? "Joint Elder/Deacon Meeting" : "Elder Meeting"), {
    size: 20,
    font: bold,
  });
  const meta = [dateLabel, opts.meeting.start_time ?? "", opts.meeting.location ?? ""]
    .filter(Boolean)
    .join("  ·  ");
  draw(meta, { size: 10, color: MUTED, gap: 6 });
  rule(BRAND);

  if (opts.note && opts.note.trim()) {
    draw(opts.note.trim(), { size: 10.5, color: INK, gap: 8 });
    rule();
  }

  const section = (label: string) => {
    ensure(34);
    y -= 6;
    draw(label.toUpperCase(), { size: 10, font: bold, color: BRAND, gap: 2 });
  };

  const item = (index: number, title: string, body: string | null) => {
    ensure(20);
    draw(`${index}.  ${title}`, { size: 11, font: bold });
    const text = toPlainText(body);
    if (text) draw(text, { size: 10, color: INK, indent: 16, gap: 2 });
    y -= 4;
  };

  if (isJoint) {
    const joint = opts.jointItems
      .filter((i) => !i.executive_session)
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    if (joint.length) {
      draw("JOINT SECTION", { size: 9, font: bold, color: MUTED, gap: 2 });
      for (const sub of JOINT_SUBSECTIONS) {
        const rows = joint.filter((i) => i.sub_section === sub.key);
        if (!rows.length) continue;
        section(sub.label);
        rows.forEach((r, i) => item(i + 1, r.title, r.body));
      }
      y -= 4;
      rule();
    }
  }

  const agenda = opts.agenda
    .filter((i) => !i.executive_session && i.section_key !== "executive")
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  let printed = false;
  for (const s of STANDARD_SECTIONS) {
    const rows = agenda.filter((i) => i.section_key === s.key);
    if (!rows.length) continue;
    printed = true;
    section(s.label);
    rows.forEach((r, i) => item(i + 1, r.title, r.body));
  }
  if (!printed && !isJoint) {
    draw("No agenda items have been added yet.", { size: 10.5, color: MUTED });
  }

  ensure(30);
  y -= 8;
  rule();
  draw("Prepared from the COAH Forest Hills Staff Hub. Executive Session items are not included.", {
    size: 8.5,
    color: MUTED,
  });

  const bytes = await pdf.save();
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);
  const filename = `Elder-Agenda-${format(new Date(`${opts.meeting.meeting_date}T00:00:00`), "yyyy-MM-dd")}.pdf`;
  return { base64, filename };
}
