// Browser-side parser for the Church Metrics PDF report.
// Extracts headline numbers, key ratios, period comparison, weekly rows, milestones, and goals.

import * as pdfjs from "pdfjs-dist";
// @ts-expect-error - vite worker import
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker&url";

pdfjs.GlobalWorkerOptions.workerSrc = PdfWorker;

export type ParsedMetrics = {
  generated_at?: string;
  range?: string;
  headline: {
    avg_total_attendance?: number;
    avg_sanctuary?: number;
    avg_kids?: number;
    avg_weekly_giving?: number;
    avg_community_groups?: number;
    prayer_interactions?: number;
    first_step_cards?: number;
    next_step_cards?: number;
    qr_scans?: number;
    volunteers_added?: number;
  };
  ratios: { label: string; value: string }[];
  period_comparison: { metric: string; current: string; previous: string; change: string }[];
  weekly: { week: string; total: string; sanctuary: string; kids: string; giving: string; cg: string; prayer: string }[];
  milestones: { label: string; count: string }[];
  goals: { goal: string; target: string; actual: string; progress: string; trajectory: string }[];
  insights: string[];
  raw_text: string;
};

export async function parseMetricsPdf(file: File | Blob): Promise<ParsedMetrics> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;

  // Build a text representation per page, grouping items by Y coordinate so rows stay together.
  const pageLines: string[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as any[]) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      const arr = rows.get(y) ?? [];
      arr.push({ x, str: item.str });
      rows.set(y, arr);
    }
    const sortedY = Array.from(rows.keys()).sort((a, b) => b - a);
    const lines = sortedY.map((y) =>
      rows
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    ).filter(Boolean);
    pageLines.push(lines);
  }
  const allLines = pageLines.flat();
  const raw = allLines.join("\n");

  const out: ParsedMetrics = {
    headline: {},
    ratios: [],
    period_comparison: [],
    weekly: [],
    milestones: [],
    goals: [],
    insights: [],
    raw_text: raw,
  };

  // Generated date and range
  const genMatch = raw.match(/Generated\s+([A-Za-z]+\s+\d+,\s*\d{4}\s+at\s+\d+:\d+\s*[AP]M)/i);
  if (genMatch) out.generated_at = genMatch[1];
  const rangeMatch = raw.match(/Last\s+\d+\s+Weeks[^\n]*/i);
  if (rangeMatch) out.range = rangeMatch[0].replace(/•/g, "·");

  // Headline tiles: find a line that contains 5 numeric tokens including a $ value, then the next line has 5 labels.
  const moneyRe = /\$[\d,]+(?:\.\d+)?/;
  for (let i = 0; i < allLines.length - 1; i++) {
    const line = allLines[i];
    if (!moneyRe.test(line)) continue;
    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length < 5) continue;
    const next = allLines[i + 1] ?? "";
    if (/Avg\s+Total\s+Attendance/i.test(next)) {
      const nums = tokens.slice(0, 5);
      out.headline.avg_total_attendance = num(nums[0]);
      out.headline.avg_sanctuary = num(nums[1]);
      out.headline.avg_kids = num(nums[2]);
      out.headline.avg_weekly_giving = money(nums[3]);
      out.headline.avg_community_groups = num(nums[4]);
    }
  }
  // Second tile row (Prayer / First Step / Next Step / QR / Volunteers)
  for (let i = 0; i < allLines.length - 1; i++) {
    const next = allLines[i + 1] ?? "";
    if (/Prayer\s+Interactions/i.test(next) && /First\s+Step\s+Cards/i.test(next)) {
      const tokens = allLines[i].split(/\s+/).filter((t) => /^\d+$/.test(t));
      if (tokens.length >= 5) {
        out.headline.prayer_interactions = num(tokens[0]);
        out.headline.first_step_cards = num(tokens[1]);
        out.headline.next_step_cards = num(tokens[2]);
        out.headline.qr_scans = num(tokens[3]);
        out.headline.volunteers_added = num(tokens[4]);
      }
    }
  }

  // Ratios block — lines like "Kids % of Total 14.6%"
  const ratioLabels = [
    "Kids % of Total",
    "CG Participation Rate",
    "Giving per Attendee",
    "Prayer per 100 Attendees",
    "First Steps per 100 Attendees",
  ];
  for (const label of ratioLabels) {
    const re = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+([\\$\\d.,%]+)", "i");
    const m = raw.match(re);
    if (m) out.ratios.push({ label, value: m[1] });
  }

  // Period comparison — match each known metric line
  const cmpMetrics = [
    "Total Attendance (avg)",
    "Sanctuary Attendance (avg)",
    "Kids Attendance (avg)",
    "Weekly Giving (avg)",
    "Community Groups (avg)",
    "Prayer Interactions (sum)",
    "First Step Cards (sum)",
    "Next Step Cards (sum)",
    "QR Scans (sum)",
    "Volunteers Added (sum)",
  ];
  for (const metric of cmpMetrics) {
    const escaped = metric.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped + "\\s+(\\$?[\\d,.]+|—)\\s+(\\$?[\\d,.]+|—)\\s+([+-]?[\\d.]+%|0%|—)", "i");
    const m = raw.match(re);
    if (m) {
      out.period_comparison.push({ metric, current: m[1], previous: m[2], change: m[3] });
    }
  }

  // Weekly rows — a date like "Mar 15" followed by 6 numbers (one with $)
  const weekRe = /([A-Z][a-z]{2}\s+\d{1,2})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\$[\d,.]+|—)\s+(\d+|—)\s+(\d+|—)/g;
  let wm: RegExpExecArray | null;
  while ((wm = weekRe.exec(raw)) !== null) {
    out.weekly.push({
      week: wm[1],
      total: wm[2],
      sanctuary: wm[3],
      kids: wm[4],
      giving: wm[5],
      cg: wm[6],
      prayer: wm[7],
    });
  }

  // Milestones — under "Milestones" header until next blank/section
  const mIdx = allLines.findIndex((l) => /^Milestones/i.test(l));
  if (mIdx !== -1) {
    for (let i = mIdx + 1; i < allLines.length; i++) {
      const l = allLines[i];
      if (/^(Goal Progress|Church Metrics|Page \d)/i.test(l)) break;
      const m = l.match(/^([A-Za-z][A-Za-z ]+?)\s+(\d+)$/);
      if (m && !/^Milestone$/i.test(m[1]) && !/^Count$/i.test(m[1])) {
        out.milestones.push({ label: m[1].trim(), count: m[2] });
      }
    }
  }

  // Goals — under "Goal Progress"
  const gIdx = allLines.findIndex((l) => /^Goal Progress/i.test(l));
  if (gIdx !== -1) {
    for (let i = gIdx + 1; i < allLines.length; i++) {
      const l = allLines[i];
      if (/^(Church Metrics|Page \d)/i.test(l)) break;
      // e.g. "total attendance 212 123 58% Declining"
      const m = l.match(/^([a-z][a-z ]+?)\s+(\$?[\d,.]+|—)\s+(\$?[\d,.]+|—)\s+(\d+%|—)\s+(.+)$/i);
      if (m && !/^Goal$/i.test(m[1])) {
        out.goals.push({
          goal: m[1].trim(),
          target: m[2],
          actual: m[3],
          progress: m[4],
          trajectory: m[5].trim(),
        });
      }
    }
  }

  // Insights — italic-ish bullet sentences. Capture lines under "Leadership Insights" until next H1.
  const iIdx = allLines.findIndex((l) => /Leadership Insights/i.test(l));
  if (iIdx !== -1) {
    for (let i = iIdx + 1; i < allLines.length; i++) {
      const l = allLines[i];
      if (/^(Recent Weekly Data|Milestones|Goal Progress|Church Metrics|Page \d)/i.test(l)) break;
      if (l.length < 8) continue;
      if (/^(GROWTH|RATIOS|RECORDS|FORECASTING)/.test(l)) continue;
      out.insights.push(l);
    }
  }

  return out;
}

function num(s: string): number | undefined {
  const n = Number(String(s).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}
function money(s: string): number | undefined {
  const n = Number(String(s).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}
