# Thunderbird WebExtension typings

TypeScript declarations for Thunderbird's WebExtension APIs (`messenger.*` and `browser.*`), generated
from Thunderbird's annotated API schemas by [webext-typings-generator](https://github.com/thunderbird/webext-typings-generator).

The typings work for add-ons written in JavaScript or in TypeScript. Plain JavaScript projects get autocomplete,
parameter hints and return information in editors such as VS Code, without any build step. TypeScript projects
get full type checking.

## Use

```sh
npm install @thunderbirdops/webext-types
```

Add a `jsconfig.json` to the root of your add-on:

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "checkJs": false,
    "lib": ["es2022", "dom"],
    "types": ["@thunderbirdops/webext-types"]
  },
  "include": ["**/*.js"]
}
```

Then close and re-open VS Code. Typing `messenger.messages.`
now lists the available APIs.

- `checkJs: false` gives completion and hover information without error squiggles. Set it to `true`, or put
  `// @ts-check` at the top of a file, to also get type errors.
- Manifest V2 add-ons use `"types": ["@thunderbirdops/webext-types/mv2"]` instead.
- Do not combine these typings with another package that declares `browser` or `messenger`, such as
  `@types/firefox-webext-browser` or `@types/thunderbird-webext-browser`.

## Versions

The major version is the Thunderbird major version the typings were generated from. Further releases within
a major only change the patch number.
`metadata.json` records the exact schema commits used.
