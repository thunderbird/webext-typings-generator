# Releasing generated typings

## Version convention

Generated typings track Thunderbird, not this generator, so the **application major
version becomes the semver major**. This matches the convention used by the
DefinitelyTyped WebExtension packages (`@types/firefox-webext-browser` is `143.0.0`).

| Ref | Schema `applicationVersion` | Package version |
| --- | --- | --- |
| `release-mv3` | `153.0.3` | `153.0.0` |
| `esr-mv3` | `153.0.3esr` | `153.0.0` |
| `beta-mv3` | `154.0b4` | `154.0.0-b4` |
| `daily-mv3` | `155.0a1` | `155.0.0-a1` |

Only the application **major** maps into semver. Channel and manifest version deliberately
do not — see below for why.

The generator derives this for you and reports it as `packageVersion`. It reads the
`applicationVersion` field carried inside every annotated schema file, so the value comes
from the schemas themselves rather than being inferred from a branch or tag name.

Note the deliberate asymmetry: the **generator's** own version (`package.json` here) is
independent and stays on ordinary semver. Only the published *typings* track Thunderbird.

## Regenerating for a release

```sh
npm run build
node dist/cli.js \
  --ref release-mv3 \
  --outfile .out/messenger.d.ts \
  --metaFile .out/metadata.json \
  --refresh \
  --force
```

Then verify and read the version back out:

```sh
./node_modules/.bin/tsc --noEmit --lib es2016,dom --skipLibCheck .out/messenger.d.ts
node -e "console.log(require('./.out/metadata.json').packageVersion)"
```

`--refresh` matters here: without it a cached checkout of a moving branch such as
`release-mv3` will be reused, and you may regenerate stale schemas.

Because the output carries no timestamp, regenerating from unchanged schemas produces a
byte-identical file. If a regeneration produces no diff, nothing in the API surface
changed.

## Open decisions

These are not settled and the tooling deliberately does not assume an answer.

### Manifest version is the only real axis

Four refs currently map to package version `153.0.0` — `release-mv2`, `release-mv3`,
`esr-mv2`, `esr-mv3` — so semver alone cannot identify an artifact. Comparing the
generated output shows which of those distinctions actually matter:

| Comparison | Result |
| --- | --- |
| `release-mv3` vs `esr-mv3` | **identical** API surface |
| `release-mv2` vs `esr-mv2` | **identical** API surface |
| `release-mv2` vs `release-mv3` | **709 lines differ** |

So **channel is not a real axis for typings**. While release and ESR share a major they
generate the same declarations, and once release moves to the next major, `153.x` *is* the
ESR line — an ESR consumer simply pins `^153`. No separate ESR artifact is needed.

**Manifest version is a real axis**: V2 has 68 namespaces including
`browserAction`/`contentScripts`/`spacesToolbar` and flat `contacts`/`mailingLists`, while
V3 has 66 including `action`/`scripting` and nested `addressBooks.contacts`.

Both manifest versions are actively supported: all seven schema branches were last updated
within fifteen minutes of each other, so V2 cannot simply be dropped. There is no
`daily-mv2` branch, which indicates V3 is the direction of travel.

**Recommended shape** — one package, one version, one entry point per manifest version:

```
@thunderbirdops/webext-types   version 153.0.0
  ├── mv3.d.ts                 (default, referenced by the "types" field)
  └── mv2.d.ts
```

```ts
/// <reference types="@thunderbirdops/webext-types/mv3" />
```

This dissolves the collision, because manifest version becomes a path rather than a
version component. It also guarantees the V2 and V3 declarations were generated from the
same Thunderbird version, which two separately published packages could not — they would
be free to drift. Migrating an add-on from V2 to V3 then means changing one reference
path, not swapping a dependency.

Generate both in one pass:

```sh
node dist/cli.js --ref release-mv3 --outfile dist-types/mv3.d.ts --metaFile dist-types/metadata.json --refresh --force
node dist/cli.js --ref release-mv2 --outfile dist-types/mv2.d.ts --refresh --force
```

Beta and daily should not go to the registry as ordinary versions. If they need
publishing, use npm dist-tags (`npm publish --tag beta`), which are orthogonal to the
version number.

### Where this publishes

Not decided. `@types/thunderbird-webext-browser` already exists on DefinitelyTyped but is
stale — pinned at Thunderbird 127, last published 2025-08-03, still Manifest V2 era and
missing `scripting`. A first-party package avoids DefinitelyTyped's review latency and
makes Thunderbird the authoritative source; DefinitelyTyped's advantage is that
TypeScript resolves `@types/*` with no consumer configuration.

### Package name

`package.json` is named `webext-typings-generator`, matching the repository, and the CLI
binary is `generate-webext-typings`. Upstream called the binary
`generate-web-extension-typings`; it was renamed for consistency with the fork.

Nothing has been published to npm yet, so both names are still free to change.

## Automation

`.github/workflows/update-typings.yml` runs weekly (and on demand) and does the following:

1. builds the generator and generates `mv3` and `mv2` from the `release-mv3` / `release-mv2` branches,
2. `scripts/prepare-typings.mjs` writes the result to `typings/` (the npm package), only if something changed.
   The GitHub Page (`docs/index.html`) links to these files on the `main` branch.
3. `scripts/verify-typings.mjs` checks that the files compile and that API typos are reported,
4. commits the result to the branch the workflow runs on and pushes it.

5. if a declaration file changed (not for a metadata-only change, which keeps the version), a second job
   publishes `typings/` to npm as `@thunderbirdops/webext-types`.

There is no manual review step: the verification in step 3 is the gate. The first job needs
`contents: write` and fails if the branch is protected against direct pushes.

### npm publishing setup (once)

Publishing uses npm trusted publishing (OIDC), the same way as `thunderbird/services-ui`, so there is no
npm token. Required:

- a GitHub environment named `npm` in this repository (Settings, Environments),
- the package on npmjs.com (first publish by hand), with a trusted publisher configured in its settings:
  this repository, workflow file `update-typings.yml`, environment `npm`.

Until that is done, the publish job fails after a change; the commit to `typings/` is already made by then.

The package version is the Thunderbird major (`160.0.0`). Schemas change within a major as well, and npm
refuses to publish a version twice, so every further change within the same major bumps the patch
(`160.0.1`, ...).
