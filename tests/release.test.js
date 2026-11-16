import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PACKAGE_PATHS, releaseManifest } from "../tools/release/manifest.js";
import { changelogSection } from "../tools/release/notes.js";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("module.json", root), "utf8"));

describe("module.json", () => {
  it("points every file it loads at something that exists", () => {
    const files = [
      ...manifest.esmodules,
      ...manifest.styles,
      ...manifest.languages.map((/** @type {any} */ l) => l.path),
    ];
    for (const file of files) expect(existsSync(new URL(file, root)), file).toBe(true);
  });

  it("is installable from GitHub releases", () => {
    expect(manifest.url).toBe("https://github.com/ebrownewell/fate-dice");
    expect(manifest.manifest).toBe(
      "https://github.com/ebrownewell/fate-dice/releases/latest/download/module.json",
    );
    expect(manifest.download).toBe(
      `https://github.com/ebrownewell/fate-dice/releases/download/v${manifest.version}/module.zip`,
    );
  });

  it("declares the MIT license, which exists", () => {
    expect(manifest.license).toBe("LICENSE");
    expect(readFileSync(new URL("LICENSE", root), "utf8")).toMatch(/^MIT License/);
  });

  it("matches package.json's version", () => {
    const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
    expect(pkg.version).toBe(manifest.version);
  });
});

describe("the release package", () => {
  it("includes everything module.json loads", () => {
    const files = [
      ...manifest.esmodules,
      ...manifest.styles,
      ...manifest.languages.map((/** @type {any} */ l) => l.path),
    ];
    for (const file of files) {
      expect(
        PACKAGE_PATHS.some((p) => file === p || file.startsWith(`${p}/`)),
        file,
      ).toBe(true);
    }
  });

  it("includes the templates, example shop, license and docs", () => {
    for (const path of [
      "templates",
      "examples",
      "LICENSE",
      "README.md",
      "CHANGELOG.md",
      "module.json",
    ]) {
      expect(PACKAGE_PATHS).toContain(path);
    }
  });

  it("leaves out tests, dev tooling and dependencies", () => {
    for (const path of [
      "tests",
      "tests-foundry",
      "tools",
      "node_modules",
      "types",
      "package.json",
    ]) {
      expect(PACKAGE_PATHS).not.toContain(path);
    }
  });

  it("only lists paths that exist", () => {
    for (const path of PACKAGE_PATHS) expect(existsSync(new URL(path, root)), path).toBe(true);
  });
});

describe("releaseManifest", () => {
  it("stamps the release version and its download URL", () => {
    const released = releaseManifest(manifest, "v1.2.3");
    expect(released.version).toBe("1.2.3");
    expect(released.download).toBe(
      "https://github.com/ebrownewell/fate-dice/releases/download/v1.2.3/module.zip",
    );
    expect(released.manifest).toBe(manifest.manifest);
  });

  it("refuses a tag that isn't a version", () => {
    expect(() => releaseManifest(manifest, "latest")).toThrow(/version/);
  });

  it("refuses a tag that doesn't match module.json, so versions can't drift", () => {
    expect(() => releaseManifest(manifest, "v9.9.9", { requireMatch: true })).toThrow(
      /module.json/,
    );
    expect(releaseManifest(manifest, `v${manifest.version}`, { requireMatch: true }).version).toBe(
      manifest.version,
    );
  });
});

describe("changelogSection", () => {
  const changelog = `# Changelog

## [Unreleased]

- Not yet.

## [0.2.0] - 2026-12-01

### Added

- Thing two.

## [0.1.0] - 2026-11-15

- Thing one.
`;

  it("returns one version's notes, without its heading", () => {
    expect(changelogSection(changelog, "0.2.0")).toBe("### Added\n\n- Thing two.");
    expect(changelogSection(changelog, "0.1.0")).toBe("- Thing one.");
  });

  it("refuses a version with no notes, so releases always say what changed", () => {
    expect(() => changelogSection(changelog, "0.3.0")).toThrow(/0.3.0/);
  });

  it("finds the current version's notes in the real changelog", () => {
    const real = readFileSync(new URL("CHANGELOG.md", root), "utf8");
    expect(changelogSection(real, manifest.version).length).toBeGreaterThan(0);
  });
});
