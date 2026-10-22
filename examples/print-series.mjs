#!/usr/bin/env node
// Reads a JSON array of ITM activities and prints the weekly ITM series and readiness.
//
//   npm run build && node examples/print-series.mjs examples/activities.json [until] [--locale ca]
//
// Activities: [{ "date": "2026-06-02", "type": "trail_run", "distance_m": 16000, "elevation_gain_m": 600 }, …]
import { readFileSync } from "node:fs";
import { createItm, kmEffort, weekStart } from "@isardtrail/itm";

const args = process.argv.slice(2);
const localeAt = args.indexOf("--locale");
const locale = localeAt >= 0 ? args.splice(localeAt, 2)[1] : "en";
const [file, untilArg] = args;
if (!file) {
  console.error("Usage: node examples/print-series.mjs <activities.json> [until YYYY-MM-DD] [--locale en|ca]");
  process.exit(1);
}

const activities = JSON.parse(readFileSync(file, "utf8"));
const until =
  untilArg ??
  activities
    .map((a) => a.date)
    .sort()
    .at(-1);
const itm = createItm({ locale });
const series = itm.simulateItm(activities, until);

console.log(`ITM from ${series[0].date} to ${until}\n`);
console.log("week        ITM   level");
const byWeek = new Map();
for (const day of series) byWeek.set(weekStart(day.date), day);
for (const [week, day] of byWeek) {
  const level = day.level ? itm.levels[day.level - 1].label : "–";
  console.log(`${week}  ${day.itm.toFixed(0).padStart(5)}  ${level.padEnd(5)} ${"▇".repeat(Math.round(day.itm / 20))}`);
}

const runs = activities.filter((a) => a.type === "run" || a.type === "trail_run");
const supportWeeks = new Map();
for (const a of activities)
  if (a.type === "strength" || a.type === "mobility")
    supportWeeks.set(weekStart(a.date), (supportWeeks.get(weekStart(a.date)) ?? 0) + 1);
const input = {
  sessions: runs.map((a) => ({
    date: a.date,
    effort: kmEffort(a.distance_m, a.elevation_gain_m),
    night: false,
    sleptOut: false,
  })),
  supportWeeks: [...supportWeeks].map(([week, count]) => ({ week, count })),
  races: [],
};
const now = itm.itmOn(series, until);
const ready = itm.readyFor(until, now, input);
const next = itm.nextItmLevel(now);
console.log(`\nITM on ${until}: ${now.toFixed(1)} · zone: ${itm.zoneForItm(now).name}`);
console.log(
  `Ready for: ${ready ? ready.label : "—"}${next ? ` · next level ${next.level.label} in ${next.missing} ITM` : ""}`,
);
const target = next?.level.key ?? "utmb";
console.log(`\nRequirements for ${target.toUpperCase()}:`);
for (const r of itm.readinessFor(target, until, now, input).requirements)
  console.log(`  ${r.ok ? "✓" : "✗"} ${r.label}: ${r.have}${r.need ? ` / ${r.need}` : ""}`);
