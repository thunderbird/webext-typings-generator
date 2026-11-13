# Thunderbird WebExtension typings

TypeScript declarations for Thunderbird's WebExtension APIs (`messenger.*` and `browser.*`), generated
from Thunderbird's annotated API schemas by [webext-typings-generator](https://github.com/thunderbird/webext-typings-generator).

You do not need to write your add-on in TypeScript. The typings give plain JavaScript projects autocomplete,
parameter hints and return information in editors such as VS Code.

## Use

```sh
npm install --save-dev @thunderbird/webext-types
```

Add a `jsconfig.json` (or `tsconfig.json`) to the root of your add-on:

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "checkJs": false,
    "lib": ["es2022", "dom"],
    "types": ["@thunderbird/webext-types"]
  },
  "include": ["**/*.js"]
}
```

Then restart the TypeScript server in VS Code (**TypeScript: Restart TS Server**). Typing `messenger.messages.`
now lists the available APIs.

- `checkJs: false` gives completion and hover information without error squiggles. Set it to `true`, or put
  `// @ts-check` at the top of a file, to also get type errors.
- Manifest V2 add-ons use `"types": ["@thunderbird/webext-types/mv2"]` instead.
- Custom Experiment APIs of your own add-on are not known to these typings and need a small declaration file.
- Do not combine these typings with another package that declares `browser` or `messenger`, for example
  `@types/firefox-webext-browser`.

## Versions

The major version is the Thunderbird major version the typings were generated from, so `160.x.y` matches
Thunderbird 160. Further releases within a major only change the patch number.
`metadata.json` records the exact schema commits used.
