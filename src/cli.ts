#!/usr/bin/env node

/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { createTypingsFile } from "./index";
import {
  DEFAULT_SCHEMA_REPO,
  describeLocalSchemas,
  fetchSchemas,
} from "./schemaSource";

const parseCommandLineArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    schemaDir: "",
    outfile: "",
    ref: "",
    schemaRepo: DEFAULT_SCHEMA_REPO,
    cacheDir: ".schemas",
    metaFile: "",
    refresh: false,
    help: false,
    force: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--schemaDir":
        options.schemaDir = args[i + 1] || "";
        break;
      case "--outfile":
        options.outfile = args[i + 1] || "";
        break;
      case "--ref":
        options.ref = args[i + 1] || "";
        break;
      case "--schemaRepo":
        options.schemaRepo = args[i + 1] || DEFAULT_SCHEMA_REPO;
        break;
      case "--cacheDir":
        options.cacheDir = args[i + 1] || ".schemas";
        break;
      case "--metaFile":
        options.metaFile = args[i + 1] || "";
        break;
      case "--refresh":
        options.refresh = true;
        break;
      case "--force":
        options.force = true;
        break;
      case "--help":
        options.help = true;
        break;
    }
  }

  // one schema source is required: fetch a ref, or point at a populated directory
  if (!options.outfile || (!options.schemaDir && !options.ref)) {
    options.help = true;
  }

  return options;
};

const helpText = `Generate typings file from web extension schema files.

Usage:
  generate-webext-typings --ref <git-ref> --outfile <file>
  generate-webext-typings --schemaDir <dir> --outfile <file>

Schema source (one is required):
  --ref <git-ref>      Fetch schemas from the schema repository at this branch
                       or tag, for example 'release-mv3', 'esr-mv3' or a
                       version tag. The checkout is cached and reused.
  --schemaDir <dir>    Use schema files (*.json) already present in this
                       directory.

Output:
  --outfile <file>     The output file to write the typings to. Required.
  --metaFile <file>    Also write generation metadata as JSON, for use by a
                       release process.

Other options:
  --schemaRepo <url>   Schema repository to fetch from.
                       Default: ${DEFAULT_SCHEMA_REPO}
  --cacheDir <dir>     Where to cache fetched schemas. Default: .schemas
  --refresh            Re-fetch even if the ref is already cached.
  --force              Create the directories if they don't exist.
  --help               Show this help message

Examples:
  # current release channel, Manifest V3
  generate-webext-typings --ref release-mv3 --outfile .out/messenger.d.ts --force

  # a specific version tag, recording metadata for the release process
  generate-webext-typings --ref <version-tag> --outfile .out/messenger.d.ts \\
    --metaFile .out/metadata.json --force
`;

const main = async () => {
  const args = parseCommandLineArgs();

  if (args.help) {
    console.log(helpText);
    return;
  }

  if (args.schemaDir && args.ref) {
    console.error(
      "Error: --schemaDir and --ref are mutually exclusive. Use --ref to fetch " +
        "schemas, or --schemaDir to use a directory you have already populated."
    );
    process.exitCode = 1;
    return;
  }

  try {
    const schemaSource = args.ref
      ? await fetchSchemas(args.ref, {
          repo: args.schemaRepo,
          cacheDir: args.cacheDir,
          refresh: args.refresh,
        })
      : await describeLocalSchemas(args.schemaDir);

    const metadata = await createTypingsFile(
      schemaSource.schemaDir,
      args.outfile,
      args.force,
      { schemaSource, metaFile: args.metaFile || undefined }
    );

    if (!metadata) {
      process.exitCode = 1;
      return;
    }

    console.error(
      [
        `Wrote ${metadata.outfile}`,
        `  Thunderbird version: ${metadata.applicationVersion ?? "unknown"}`,
        `  Package version:     ${metadata.packageVersion ?? "unknown"}`,
        metadata.manifestVersion
          ? `  Manifest version:    ${metadata.manifestVersion}`
          : null,
        metadata.channel ? `  Channel:             ${metadata.channel}` : null,
        `  Namespaces:          ${metadata.namespaceCount}`,
      ]
        .filter((line) => line !== null)
        .join("\n")
    );
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
};

main();
