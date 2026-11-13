// Turns the generator output in .out/ into the publishable package in typings/.
//
// Expects (written by the generator, see .github/workflows/update-typings.yml):
//   .out/mv3.d.ts  .out/mv3.meta.json
//   .out/mv2.d.ts  .out/mv2.meta.json
//
// Writes typings/mv3.d.ts, typings/mv2.d.ts and typings/metadata.json. The package
// version is the Thunderbird version of the schemas. Only if a minor or patch part
// is missing, ".0" is appended for it, because npm needs three parts. Anything
// else (beta, esr, daily) is an error: the workflow only handles releases.
// docs/ (GitHub Pages) links to the files in typings/ on the main branch, so
// nothing is copied there.
// It also rewrites the example output in README.md (between the latest-run
// markers) with the values of this run.
// If the declarations (everything below the header comment) are identical to
// the committed ones, nothing is touched: no commit, no release.
// Reports `changed`, `publish`, `version` and `application_version` to
// $GITHUB_OUTPUT. `publish` is true when the declarations changed and the
// Thunderbird version is new, because npm refuses to publish a version twice.

import fs from "node:fs";
import path from "node:path";

const OUT = ".out";
const PKG_DIR = "typings";
const MANIFEST_VERSIONS = ["mv3", "mv2"];

const read = (file) => fs.readFileSync(file, "utf8");
const readIfExists = (file) => (fs.existsSync(file) ? read(file) : null);

const toPackageVersion = (applicationVersion) => {
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(applicationVersion);
  if (!match) {
    throw new Error(
      `Unsupported Thunderbird version "${applicationVersion}": this workflow ` +
        `only handles release versions (X, X.Y or X.Y.Z).`
    );
  }
  return `${match[1]}.${match[2] ?? 0}.${match[3] ?? 0}`;
};

const isOlder = (a, b) => {
  const [pa, pb] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i];
  }
  return false;
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

const pkgFile = path.join(PKG_DIR, "package.json");
const pkg = JSON.parse(read(pkgFile));
const applicationVersion = meta.mv3.applicationVersion;
const version = toPackageVersion(applicationVersion);
if (isOlder(version, pkg.version)) {
  throw new Error(
    `The schemas are from Thunderbird ${applicationVersion}, older than the ` +
      `current package version ${pkg.version}. Refusing to go back.`
  );
}

// The header names the Thunderbird version and the schema commit, so it differs
// on every new release. Only the declarations below it decide if anything changed.
const declarations = (text) => {
  if (text === null) return null;
  const end = text.indexOf("*/");
  return end === -1 ? text : text.slice(end + 2);
};
const noNewDeclarations = MANIFEST_VERSIONS.every(
  (mv) =>
    declarations(read(path.join(OUT, `${mv}.d.ts`))) ===
    declarations(readIfExists(path.join(PKG_DIR, `${mv}.d.ts`)))
);

const report = (result) => {
  console.log(result);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(result).map(([k, v]) => `${k}=${v}\n`).join("")
    );
  }
};

if (noNewDeclarations) {
  // Nothing to commit and nothing to release, even if Thunderbird has a new
  // version. The next release with changed declarations carries its version.
  report({
    changed: "false",
    publish: "false",
    version: pkg.version,
    application_version: applicationVersion,
    changed_files: "",
  });
  process.exit(0);
}

let changed = false;

const changedFiles = MANIFEST_VERSIONS.filter(
  (mv) => read(path.join(OUT, `${mv}.d.ts`)) !== readIfExists(path.join(PKG_DIR, `${mv}.d.ts`))
);
for (const mv of changedFiles) {
  fs.copyFileSync(path.join(OUT, `${mv}.d.ts`), path.join(PKG_DIR, `${mv}.d.ts`));
  changed = true;
}

// The declarations changed, so a new Thunderbird version is released. Within the
// same version npm refuses a second publish, so only the commit happens then.
const publish = version !== pkg.version;
if (publish) {
  pkg.version = version;
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + "\n");
  changed = true;
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

const changedWhat = [
  ...changedFiles,
  ...(publish ? ["version"] : []),
];
const result = {
  changed: String(changed),
  publish: String(publish),
  version,
  application_version: meta.mv3.applicationVersion,
  changed_files: changedWhat.join(",") || "metadata only",
};
report(result);
