# webext-typings-generator

Generates a TypeScript typings file (`.d.ts`) from Thunderbird's annotated API schema files, as provided in [thunderbird/webext-annotated-schemas](https://github.com/thunderbird/webext-annotated-schemas)

## Using the typings

The generated typings are published as [`@thunderbirdops/webext-types`](https://www.npmjs.com/package/@thunderbirdops/webext-types)
and are available in [`typings/`](typings). Setup instructions for add-on developers are on
[the project page](https://thunderbird.github.io/webext-typings-generator/). A workflow
regenerates and publishes them whenever Thunderbird's schemas change.

## Running the generator

The generator fetches the schemas itself; pick a channel branch or a version tag:

```sh
npm install && npm run build
node dist/cli.js --ref release-mv3 --outfile .out/messenger.d.ts --force
```

<!-- latest-run:start -->
```
Wrote .out/messenger.d.ts
  Thunderbird version: 160.0.1
  Manifest version:    3
  Channel:             release
  Namespaces:          66
```
<!-- latest-run:end -->

The output above is rewritten by the update workflow whenever the typings change.

Run `node dist/cli.js --help` for the full option list.

See [USAGE.md](USAGE.md) for schema refs and development notes.

## Acknowledgements

This project is a fork of [web-extension-typings-generator](https://github.com/arndissler/web-extension-typings-generator) by Arnd Issler, who did most of the work. The Thunderbird team is continuing his great effort, adjusting it to be compatible with Thunderbird's annotated schema files.

## License

`webext-typings-generator` is licensed under MPL 2.0.
