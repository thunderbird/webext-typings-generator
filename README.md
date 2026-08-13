# webext-typings-generator

Generates a TypeScript typings file (`.d.ts`) from Thunderbird's annotated API schema files, as provided in [thunderbird/webext-annotated-schemas](https://github.com/thunderbird/webext-annotated-schemas)

## Usage

```sh
Generate typings file from web extension schema files.

Usage: generate-web-extension-typings --schemaDir <dir> --outfile <file>

  --schemaDir <dir>    The directory containing the schema files (*.json)
  --outfile <file>     The output file to write the typings to
  --force              Create the directories if they does not exist
  --help               Show this help message
```

## Acknowledgements

This project is a fork of [web-extension-typings-generator](https://github.com/arndissler/web-extension-typings-generator) by Arnd Issler, who did most of the work. The Thunderbird team is continuing his great effort, adjusting it to be compatible with Thunderbird's annotated schema files.

## License

`webext-typings-generator` is licensed under MPL 2.0.
