// @ts-check
// Build the release: dist/module.zip and dist/module.json.
//   node tools/release/build.js v0.1.0
// The tag must match module.json's version.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PACKAGE_PATHS, releaseManifest } from "./manifest.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const tag = process.argv[2];
if (!tag) throw new Error("Usage: node tools/release/build.js v1.2.3");

const manifest = releaseManifest(JSON.parse(readFileSync(`${root}module.json`, "utf8")), tag, {
  requireMatch: true,
});

const dist = `${root}dist/`;
const stage = `${dist}fate-dice/`;
rmSync(dist, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

// Copy the package files, then write the release's module.json over the copy.
execFileSync("cp", ["-R", ...PACKAGE_PATHS.map((p) => `${root}${p}`), stage]);
const json = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync(`${stage}module.json`, json);
writeFileSync(`${dist}module.json`, json);

// Foundry expects module.json at the top level of the zip.
execFileSync("zip", ["-qr", "-X", `${dist}module.zip`, "."], { cwd: stage });
console.log(`Built dist/module.zip and dist/module.json for ${manifest.version}`);
