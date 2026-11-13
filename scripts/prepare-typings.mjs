// Turns the generator output in .out/ into the publishable package in typings/.
//
// Expects (written by the generator, see .github/workflows/update-typings.yml):
//   .out/mv3.d.ts  .out/mv3.meta.json
//   .out/mv2.d.ts  .out/mv2.meta.json
//
// Writes typings/mv3.d.ts, typings/mv2.d.ts, typings/metadata.json and updates
// the version in typings/package.json, but only if a declaration file changed.
// docs/ (GitHub Pages) links to the files in typings/ on the main branch, so
// nothing is copied there.
// It also rewrites the example output in README.md (between the latest-run
// markers) with the values of this run.
// Reports `changed`, `publish`, `version` and `application_version` to
// $GITHUB_OUTPUT. `publish` is only true when a declaration file changed, because
// only then the package version is bumped (npm refuses to publish a version twice).

import fs from "node:fs";
import path from "node:path";

const OUT = ".out";
const PKG_DIR = "typings";
const MANIFEST_VERSIONS = ["mv3", "mv2"];

const read = (file) => fs.readFileSync(file, "utf8");
const readIfExists = (file) => (fs.existsSync(file) ? read(file) : null);

const parseVersion = (version) => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(
      `Unsupported version "${version}": only plain x.y.z releases are published ` +
        `from this workflow (beta/daily would need an npm dist-tag).`
    );
  }
  return match.slice(1).map(Number);
};

const compare = (a, b) => {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
};

const meta = {};
for (const mv of MANIFEST_VERSIONS) {
  meta[mv] = JSON.parse(read(path.join(OUT, `${mv}.meta.json`)));
}

// Both files must come from the same Thunderbird version, otherwise a single
// package version would be misleading.
const appVersions = new Set(
  MANIFEST_VERSIONS.map((mv) => meta[mv].applicationVersion)
);
if (appVersions.size !== 1) {
  throw new Error(
    `mv3 and mv2 schemas are from different Thunderbird versions ` +
      `(${[...appVersions].join(" vs ")}). Try again later, the schema branches ` +
      `are probably being updated.`
  );
}

const changedFiles = MANIFEST_VERSIONS.filter(
  (mv) => read(path.join(OUT, `${mv}.d.ts`)) !== readIfExists(path.join(PKG_DIR, `${mv}.d.ts`))
);

const pkgFile = path.join(PKG_DIR, "package.json");
const pkg = JSON.parse(read(pkgFile));
const base = meta.mv3.packageVersion;
let version = pkg.version;
let changed = changedFiles.length > 0;

if (changed) {
  // The package version follows the Thunderbird major (application version X.Y.Z -> package version X.0.0).
  // Schemas change within a major as well, and npm refuses to publish a
  // version twice, so any further change bumps the patch number.
  const baseParts = parseVersion(base);
  const currentParts = parseVersion(pkg.version);
  version =
    compare(currentParts, baseParts) < 0
      ? base
      : `${currentParts[0]}.${currentParts[1]}.${currentParts[2] + 1}`;

  for (const mv of MANIFEST_VERSIONS) {
    fs.copyFileSync(path.join(OUT, `${mv}.d.ts`), path.join(PKG_DIR, `${mv}.d.ts`));
  }
  pkg.version = version;
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + "\n");
}

// The metadata is rewritten on its own, so a changed schema commit is recorded
// when the declarations happen to be identical.
const publicMeta = {};
for (const mv of MANIFEST_VERSIONS) {
  const { outfile, ...rest } = meta[mv];
  publicMeta[mv] = rest;
}
const metadataFile = path.join(PKG_DIR, "metadata.json");
const metadataText = JSON.stringify(publicMeta, null, 2) + "\n";
if (metadataText !== readIfExists(metadataFile)) {
  fs.writeFileSync(metadataFile, metadataText);
  changed = true;
}

// README.md shows the output of a run, filled with the values of this one.
const README_FILE = "README.md";
const START = "<!-- latest-run:start -->";
const END = "<!-- latest-run:end -->";
const m = meta.mv3;
const block = [
  START,
  "```",
  "Wrote .out/messenger.d.ts",
  `  Thunderbird version: ${m.applicationVersion}`,
  `  Package version:     ${m.packageVersion}`,
  `  Manifest version:    ${m.manifestVersion}`,
  `  Channel:             ${m.channel}`,
  `  Namespaces:          ${m.namespaceCount}`,
  "```",
  END,
].join("\n");
const readme = read(README_FILE);
const startIndex = readme.indexOf(START);
const endIndex = readme.indexOf(END);
if (startIndex === -1 || endIndex === -1) {
  throw new Error(`README.md has no ${START} ... ${END} block.`);
}
const newReadme =
  readme.slice(0, startIndex) + block + readme.slice(endIndex + END.length);
if (newReadme !== readme) {
  fs.writeFileSync(README_FILE, newReadme);
  changed = true;
}

const result = {
  changed: String(changed),
  publish: String(changedFiles.length > 0),
  version,
  application_version: meta.mv3.applicationVersion,
  changed_files: changedFiles.join(",") || "metadata only",
};
console.log(result);

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(result).map(([k, v]) => `${k}=${v}\n`).join("")
  );
}
