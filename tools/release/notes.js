// @ts-check
// Release notes for a version, taken from CHANGELOG.md.
//   node tools/release/notes.js v0.1.0 > notes.md

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The notes under "## [version]" in a changelog, up to the next version heading.
 * @param {string} changelog
 * @param {string} version e.g. "0.1.0"
 */
export function changelogSection(changelog, version) {
  const lines = changelog.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  if (start < 0) throw new Error(`CHANGELOG.md has no section for ${version}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## ["));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = (process.argv[2] ?? "").replace(/^v/, "");
  const changelog = readFileSync(new URL("../../CHANGELOG.md", import.meta.url), "utf8");
  process.stdout.write(`${changelogSection(changelog, version)}\n`);
}
