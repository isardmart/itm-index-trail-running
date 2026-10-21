#!/usr/bin/env node
// Installs the package into an empty temporary project, the way a user would, and checks that it works from both ESM
// and CommonJS with no runtime dependencies.
//
//   node scripts/smoke-install.mjs                       # installs git+file://<this repo>#HEAD (runs "prepare")
//   node scripts/smoke-install.mjs github:OWNER/REPO#ref  # installs straight from GitHub
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const spec = process.argv[2] ?? `git+${pathToFileURL(root).href}#${head}`;
const dir = mkdtempSync(join(tmpdir(), "itm-smoke-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (cmd, args) =>
  execFileSync(cmd, args, {
    cwd: dir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    shell: process.platform === "win32",
  });

try {
  console.log(`Installing ${spec} into ${dir}`);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "itm-smoke", private: true, version: "0.0.0" }));
  run(npm, ["install", "--no-audit", "--no-fund", spec]);

  const installed = JSON.parse(readFileSync(join(dir, "node_modules/@isardtrail/itm/package.json"), "utf8"));
  if (installed.name !== "@isardtrail/itm") throw new Error(`unexpected package name ${installed.name}`);
  if (Object.keys(installed.dependencies ?? {}).length)
    throw new Error("the package must have no runtime dependencies");
  const lock = JSON.parse(readFileSync(join(dir, "package-lock.json"), "utf8"));
  const extra = Object.keys(lock.packages ?? {}).filter((p) => p && p !== "node_modules/@isardtrail/itm");
  if (extra.length) throw new Error(`unexpected packages installed: ${extra.join(", ")}`);

  const check = `
    const history = [
      { date: "2026-01-01", type: "trail_run", distance_m: 30000, elevation_gain_m: 1500 },
      { date: "2026-01-03", type: "strength", distance_m: null, elevation_gain_m: null },
    ];
    const itm = m.createItm({ locale: "ca" });
    const s = itm.simulateItm(history, "2026-01-20");
    if (s.length !== 20 || s[0].itm !== 45 || itm.levels[1].label !== "50K") throw new Error("bad result");
    if (m.kmEffort(20000, 1000) !== 30) throw new Error("bad kmEffort");
    if (itm.itmEvents(s, history)[0].label !== "Sortida de categoria 50K") throw new Error("bad label");
    console.log(KIND + " ok: ITM on 2026-01-20 = " + itm.itmOn(s, "2026-01-20"));
  `;
  writeFileSync(join(dir, "check.mjs"), `import * as m from "@isardtrail/itm"; const KIND = "ESM"; ${check}`);
  writeFileSync(join(dir, "check.cjs"), `const m = require("@isardtrail/itm"); const KIND = "CJS"; ${check}`);
  process.stdout.write(run(process.execPath, ["check.mjs"]));
  process.stdout.write(run(process.execPath, ["check.cjs"]));
  console.log("Smoke test passed.");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
