// Draws docs/assets/itm-history.svg — the README chart — by running the engine on the real calibration history, so
// the picture is always what the code computes.
//
//   npm run docs:chart
import { writeFileSync } from "node:fs";
import {
  DEFAULT_ITM_CONFIG,
  LEVEL_LOOK,
  addDays,
  createItm,
  daysBetween,
  kmEffort,
  type DateOnly,
  type ItmDay,
  type ReadinessInput,
} from "../src/index";
import { REAL_HISTORY } from "../test/history.fixture";

const OUT = "docs/assets/itm-history.svg";
const itm = createItm();
const until: DateOnly = "2026-10-21";
const series: ItmDay[] = itm.simulateItm(REAL_HISTORY, until, { baseline: { date: "2025-05-01", itm: 0 } });
const input: ReadinessInput = {
  sessions: REAL_HISTORY.filter((a) => a.type === "run" || a.type === "trail_run").map((a) => ({
    date: a.date,
    effort: kmEffort(a.distance_m, a.elevation_gain_m),
    night: false,
    sleptOut: false,
  })),
  supportWeeks: [],
  races: [],
};
// The calibration reference (see test/history.test.ts): the long run after which the athlete was ready for a 50K.
const reference = series.find((d) => d.date === "2026-09-05")!;
if (!itm.readinessFor("50k", reference.date, reference.itm, input).ready) throw new Error("Calibration changed.");
const peak = series.reduce((a, b) => (b.itm > a.itm ? b : a));

// Geometry.
const W = 880;
const H = 380;
const m = { top: 28, right: 92, bottom: 40, left: 48 };
const iw = W - m.left - m.right;
const ih = H - m.top - m.bottom;
const first = series[0]!.date;
const days = daysBetween(first, until);
const yMax = 350;
const x = (d: DateOnly) => m.left + (daysBetween(first, d) / days) * iw;
const y = (v: number) => m.top + ih - (Math.min(v, yMax) / yMax) * ih;
const f = (n: number) => n.toFixed(1);

const line = series.map((d, i) => `${i ? "L" : "M"}${f(x(d.date))},${f(y(d.itm))}`).join("");
const area = `${line}L${f(x(until))},${f(y(0))}L${f(x(first))},${f(y(0))}Z`;

const yTicks = [0, 50, 100, 150, 200, 250, 300, 350];
const months: DateOnly[] = [];
for (let d = first; d <= until; d = addDays(d, 1)) if (d.endsWith("-01")) months.push(d);
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (d: DateOnly) => {
  const mo = Number(d.slice(5, 7));
  return mo === 1 || d === months[0] ? `${MONTH[mo - 1]!} ${d.slice(0, 4)}` : MONTH[mo - 1]!;
};

const thresholds = (["20k", "50k"] as const).map((k) => ({
  key: k,
  label: k.toUpperCase(),
  value: DEFAULT_ITM_CONFIG.levels[k].threshold,
}));

const marker = (d: ItmDay, text: string, dx: number, anchor: "start" | "end") => `
  <circle cx="${f(x(d.date))}" cy="${f(y(d.itm))}" r="5" class="dot"/>
  <text x="${f(x(d.date) + dx)}" y="${f(y(d.itm) - 12)}" text-anchor="${anchor}" class="note">${text}</text>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
  <title id="t">ITM of a real athlete, May 2025 – October 2026</title>
  <desc id="d">Daily ITM computed by @isardtrail/itm from a real Strava history. It rises with long mountain runs, fades between blocks, crosses the 20K threshold (110) and the 50K threshold (250), peaking at ${peak.itm.toFixed(0)} on ${peak.date}.</desc>
  <style>
    .bg { fill: #fcfcfb; } .grid { stroke: #e6e5e0; } .axis { fill: #52514e; }
    .itm { stroke: #2a78d6; } .area { fill: #2a78d6; fill-opacity: .10; }
    .dot { fill: #2a78d6; stroke: #fcfcfb; stroke-width: 2; } .note { fill: #0b0b0b; font-weight: 600; }
    .th-label { fill: #0b0b0b; font-weight: 600; } .th-sub { fill: #52514e; }
    @media (prefers-color-scheme: dark) {
      .bg { fill: #1a1a19; } .grid { stroke: #33332f; } .axis { fill: #c3c2b7; }
      .itm { stroke: #3987e5; } .area { fill: #3987e5; fill-opacity: .16; }
      .dot { fill: #3987e5; stroke: #1a1a19; } .note, .th-label { fill: #f0efec; } .th-sub { fill: #c3c2b7; }
    }
    svg { font-size: 12px; } text { font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  </style>
  <rect class="bg" width="${W}" height="${H}" rx="12"/>
  ${yTicks
    .map(
      (v) => `<line class="grid" x1="${m.left}" x2="${m.left + iw}" y1="${f(y(v))}" y2="${f(y(v))}"/>
  <text class="axis" x="${m.left - 8}" y="${f(y(v) + 4)}" text-anchor="end">${v}</text>`,
    )
    .join("\n  ")}
  ${months
    .map(
      (d, i) =>
        `<text class="axis" x="${f(x(d))}" y="${H - m.bottom + 20}" text-anchor="middle">${i % 2 === 0 ? monthLabel(d) : ""}</text>`,
    )
    .join("\n  ")}
  ${thresholds
    .map(
      (
        t,
      ) => `<line x1="${m.left}" x2="${m.left + iw}" y1="${f(y(t.value))}" y2="${f(y(t.value))}" stroke="${LEVEL_LOOK[t.key].color}" stroke-width="2" stroke-dasharray="6 5"/>
  <rect x="${m.left + iw + 10}" y="${f(y(t.value) - 6)}" width="12" height="12" rx="3" fill="${LEVEL_LOOK[t.key].color}"/>
  <text class="th-label" x="${m.left + iw + 28}" y="${f(y(t.value) - 1)}">${t.label}</text>
  <text class="th-sub" x="${m.left + iw + 28}" y="${f(y(t.value) + 13)}">ITM ${t.value}</text>`,
    )
    .join("\n  ")}
  <path class="area" d="${area}"/>
  <path class="itm" d="${line}" fill="none" stroke-width="2" stroke-linejoin="round"/>
  ${marker(peak, `Peak ${peak.itm.toFixed(0)}`, 10, "start")}
  ${marker(reference, "Ready for a 50K · 5 Sep 2026", -10, "end")}
  <text class="axis" x="${m.left}" y="16">ITM</text>
</svg>
`;

writeFileSync(OUT, svg);
console.log(`${OUT}: ${series.length} days, peak ${peak.itm} on ${peak.date}, ready for 50K on ${reference.date}`);
