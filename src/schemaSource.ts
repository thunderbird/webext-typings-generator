/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const run = promisify(execFile);

export const DEFAULT_SCHEMA_REPO =
  "https://github.com/thunderbird/webext-annotated-schemas.git";

const SCHEMA_SUBDIR = "schema-files";

export type SchemaSource = {
  schemaDir: string;
  ref: string | null;
  repo: string | null;
  commit: string | null;
  manifestVersion: number | null;
  channel: string | null;
};

const directoryExists = async (dir: string) => {
  try {
    const stat = await fs.stat(dir);
    return stat.isDirectory();
  } catch {
    return false;
  }
};

// every branch and tag encodes the manifest version, e.g. release-mv3, 154.0b4-mv2
export const manifestVersionFromRef = (ref: string): number | null => {
  const match = /-mv(\d+)$/.exec(ref);
  return match ? Number(match[1]) : null;
};

// only branches name a channel, tags name a version
export const channelFromRef = (ref: string): string | null => {
  const match = /^(release|beta|esr|daily)-mv\d+$/.exec(ref);
  return match ? match[1] : null;
};

const gitDirOf = async (dir: string) => {
  try {
    const { stdout } = await run("git", ["rev-parse", "--show-toplevel"], {
      cwd: dir,
    });
    return stdout.trim();
  } catch {
    return null;
  }
};

const commitOf = async (dir: string) => {
  try {
    const { stdout } = await run("git", ["rev-parse", "HEAD"], { cwd: dir });
    return stdout.trim();
  } catch {
    return null;
  }
};

export const fetchSchemas = async (
  ref: string,
  options: {
    repo?: string;
    cacheDir?: string;
    refresh?: boolean;
  } = {}
): Promise<SchemaSource> => {
  const repo = options.repo || DEFAULT_SCHEMA_REPO;
  const cacheRoot = options.cacheDir || ".schemas";
  const checkout = path.join(cacheRoot, ref.replace(/[^A-Za-z0-9._-]/g, "_"));

  const alreadyCloned = await directoryExists(path.join(checkout, ".git"));

  if (alreadyCloned && options.refresh) {
    await fs.rm(checkout, { recursive: true, force: true });
  }

  if (!alreadyCloned || options.refresh) {
    await fs.mkdir(cacheRoot, { recursive: true });
    console.error(`Fetching schemas: ${repo} at ${ref}`);
    try {
      await run("git", [
        "clone",
        "--quiet",
        "--depth",
        "1",
        "--branch",
        ref,
        repo,
        checkout,
      ]);
    } catch (error: any) {
      throw new Error(
        `Could not fetch schemas for ref '${ref}' from ${repo}. ` +
          `Check that the branch or tag exists. ${error.message}`
      );
    }
  } else {
    console.error(`Using cached schemas for ${ref} in ${checkout}`);
  }

  // fall back to the checkout root so a differently shaped mirror still works
  const subdir = path.join(checkout, SCHEMA_SUBDIR);
  const schemaDir = (await directoryExists(subdir)) ? subdir : checkout;

  return {
    schemaDir,
    ref,
    repo,
    commit: await commitOf(checkout),
    manifestVersion: manifestVersionFromRef(ref),
    channel: channelFromRef(ref),
  };
};

export const describeLocalSchemas = async (
  schemaDir: string
): Promise<SchemaSource> => {
  const toplevel = await gitDirOf(schemaDir);

  return {
    schemaDir,
    ref: null,
    repo: null,
    commit: toplevel ? await commitOf(schemaDir) : null,
    manifestVersion: null,
    channel: null,
  };
};

// read the version from the schemas themselves, so a branch checkout is stamped
// as precisely as a tag
export const detectApplicationVersion = (
  schemas: Array<{ applicationVersion?: string }>
): string | null => {
  const versions = new Set(
    schemas
      .map((schema) => schema.applicationVersion)
      .filter((version): version is string => typeof version === "string")
  );

  if (versions.size === 1) {
    return [...versions][0];
  }

  if (versions.size > 1) {
    console.warn(
      `Warning: schemas declare conflicting applicationVersion values: ${[
        ...versions,
      ].join(", ")}`
    );
  }

  return null;
};

export const packageVersionFor = (
  applicationVersion: string | null
): string | null => {
  if (!applicationVersion) {
    return null;
  }

  // one format per channel: 153.0.3 release, 153.0.3esr esr, 154.0b4 beta,
  // 155.0a1 daily
  const parsed = /^(\d+)\.(\d+)(?:\.(\d+))?(?:([ab])(\d+))?(esr)?$/.exec(
    applicationVersion
  );

  if (!parsed) {
    console.warn(
      `Warning: unrecognised applicationVersion '${applicationVersion}', ` +
        `cannot derive a package version`
    );
    return null;
  }

  const [, major, , , prereleaseKind, prereleaseNumber] = parsed;

  // only the major maps into semver: release 153.0.3 and esr 153.0.3esr would
  // otherwise collide, as would the mv2 and mv3 builds of either
  return prereleaseKind
    ? `${major}.0.0-${prereleaseKind}${prereleaseNumber}`
    : `${major}.0.0`;
};
