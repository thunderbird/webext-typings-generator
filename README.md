# webext-typings-generator

Generates a TypeScript typings file (`.d.ts`) from Thunderbird's annotated API schema files, as provided in [thunderbird/webext-annotated-schemas](https://github.com/thunderbird/webext-annotated-schemas)

## Usage

The generator fetches the schemas itself; pick a channel branch or a version tag:

```sh
npm install && npm run build
node dist/cli.js --ref release-mv3 --outfile .out/messenger.d.ts --force
```

```
Wrote .out/messenger.d.ts
  Thunderbird version: 153.0.3
  Package version:     153.0.0
  Manifest version:    3
  Channel:             release
  Namespaces:          66
```

Run `node dist/cli.js --help` for the full option list.

See [USAGE.md](USAGE.md) for setup, schema refs and development notes, and
[RELEASING.md](RELEASING.md) for the version convention used for generated typings.

## Acknowledgements

This project is a fork of [web-extension-typings-generator](https://github.com/arndissler/web-extension-typings-generator) by Arnd Issler, who did most of the work. The Thunderbird team is continuing his great effort, adjusting it to be compatible with Thunderbird's annotated schema files.

## License

`webext-typings-generator` is licensed under MPL 2.0.
