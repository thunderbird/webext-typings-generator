# Running the generator

The generator reads the annotated Thunderbird WebExtension API schemas and writes a `.d.ts` file
describing the `messenger.*` and `browser.*` APIs. The command is in the [README](README.md#running-the-generator).

Requirements: Node.js (`.nvmrc` pins `lts/*`) and `git` on the `PATH`, which fetches the schemas.
`node dist/cli.js --help` lists all options.

## Choosing a ref

The generator fetches the schemas from [`thunderbird/webext-annotated-schemas`](https://github.com/thunderbird/webext-annotated-schemas).
The checkout is cached under `.schemas/<ref>/`; pass `--refresh` to fetch it again.

| Ref | Meaning |
| --- | --- |
| `release-mv3` | current release, Manifest V3 |
| `beta-mv3` | current beta, Manifest V3 |
| `esr-mv3` | current ESR, Manifest V3 |
| `daily-mv3` | daily builds, Manifest V3 |
| `release-mv2`, `beta-mv2`, `esr-mv2` | the Manifest V2 equivalents |

Branches move as Thunderbird ships. Tags pin one exact version: `X.0bN-mv3` for a beta, `X.0aN-mv3` for
a daily build, and the same with `-mv2`.

Manifest V2 and V3 produce different output (V2 has `browserAction`, `contentScripts` and flat
`contacts`; V3 has `action`, `scripting` and `addressBooks.contacts`), so pick deliberately.

`--schemaDir <dir>` uses schema files you already have instead of fetching. The ref, channel and manifest
version are then not recorded in the header.

## Output

Every generated file starts with a header naming the Thunderbird version, the schema ref and the
schema commit. It has no timestamp on purpose: regenerating from the same schemas produces a
byte-identical file, so a diff only shows real schema changes. `--metaFile <file>` writes the same facts
as JSON.

## Development

Run the `.ts` files directly, without a build:

```sh
npm run start:ts -- --ref release-mv3 --outfile .out/messenger.d.ts --force
npm run typecheck
```

Relative imports inside `src/` must stay **extensionless** (`from "./index"`, not `"./index.js"`). The
project compiles to CommonJS, so `./index.js` type-checks fine but breaks `start:ts`, because no
`src/index.js` exists.

## Expected warnings

A successful run prints these to stderr. None indicate failure:

- `skipping unsupported property …`: the schema marks it `unsupported: true`, so it is excluded.
- `schema incorrect, referenced local type …`: the schema uses an unqualified `$ref` that lives in
  another namespace. The generator resolves it.
- `Skipping non-json file permissions.ftl`: the schema repository ships one non-JSON file.
