// Sanity checks for the generated typings in typings/.
//  1. every declaration file compiles
//  2. real API calls type-check, and typos in them are reported
//     (the same example the announcement uses)

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tsc = path.resolve("node_modules", "typescript", "bin", "tsc");
const typings = path.resolve("typings");

const run = (args) =>
  spawnSync(process.execPath, [tsc, ...args], { encoding: "utf8" });

let failed = false;
const fail = (message, output = "") => {
  failed = true;
  console.error(`FAIL: ${message}\n${output}`);
};

for (const mv of ["mv3", "mv2"]) {
  const result = run([
    "--noEmit", "--lib", "es2016,dom", "--skipLibCheck",
    path.join(typings, `${mv}.d.ts`),
  ]);
  if (result.status !== 0) fail(`${mv}.d.ts does not compile`, result.stdout);
  else console.log(`ok: ${mv}.d.ts compiles`);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "typings-check-"));
  fs.writeFileSync(
    path.join(dir, "check.js"),
    [
      "// @ts-check",
      "async function check(folder) {",
      "  const page = await messenger.messages.list(folder);",
      "  const ok = page.messages.length;",
      "  const typo = page.mesages;",
      "  await messenger.messages.lisst(folder);",
      "}",
      "",
    ].join("\n")
  );
  const check = run([
    "--noEmit", "--allowJs", "--checkJs", "--lib", "es2022,dom", "--skipLibCheck",
    path.join(typings, `${mv}.d.ts`), path.join(dir, "check.js"),
  ]);
  const output = check.stdout;
  const expected = ["'mesages' does not exist", "'lisst' does not exist"];
  const missing = expected.filter((text) => !output.includes(text));
  const unexpected = output
    .split("\n")
    .filter((line) => line.includes("check.js") && !expected.some((t) => line.includes(t)));
  if (missing.length) fail(`${mv}: typos were not reported: ${missing.join(", ")}`, output);
  else if (unexpected.length) fail(`${mv}: unexpected errors`, unexpected.join("\n"));
  else console.log(`ok: ${mv} reports typos and accepts valid calls`);
  fs.rmSync(dir, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
