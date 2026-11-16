// @ts-check
// What goes into a release, and the module.json that ships with it.

const REPO = "https://github.com/ebrownewell/fate-dice";

/** Files and folders that make up the installed module (everything else is dev-only). */
export const PACKAGE_PATHS = [
  "module.json",
  "LICENSE",
  "README.md",
  "CHANGELOG.md",
  "scripts",
  "styles",
  "templates",
  "lang",
  "examples",
];

/**
 * The release channel a manifest belongs to, named after the Foundry version it
 * supports (e.g. "foundry-v13"). Each channel has a release whose module.json
 * always points at that line's newest version.
 * @param {any} manifest
 */
export function releaseChannel(manifest) {
  const minimum = manifest?.compatibility?.minimum;
  if (!minimum) throw new Error("module.json needs compatibility.minimum");
  return `foundry-v${String(minimum).split(".")[0]}`;
}

/**
 * module.json for a release: the tag's version and that release's download.
 * @param {any} manifest The repository's module.json.
 * @param {string} tag e.g. "v1.2.3"
 * @param {{ requireMatch?: boolean }} [options] requireMatch: the tag must equal module.json's version.
 */
export function releaseManifest(manifest, tag, { requireMatch = false } = {}) {
  const match = /^v(\d+\.\d+\.\d+(?:-[\w.]+)?)$/.exec(tag);
  if (!match) throw new Error(`"${tag}" isn't a version tag like v1.2.3`);
  const version = match[1];
  if (requireMatch && version !== manifest.version) {
    throw new Error(`Tag ${tag} doesn't match module.json's version ${manifest.version}`);
  }
  return { ...manifest, version, download: `${REPO}/releases/download/v${version}/module.zip` };
}
