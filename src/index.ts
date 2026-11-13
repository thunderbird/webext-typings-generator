/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import ts from "typescript";

import { createSingleTyping } from "./typeFactory";
import { SingleType, WebExtensionSchemaMapping } from "./typeFactory/types";
import {
  SchemaSource,
  detectApplicationVersion,
  packageVersionFor,
} from "./schemaSource";
import {
  isArrayType,
  isBooleanType,
  isEnumStringType,
  isFunctionType,
  isIntegerType,
  isNumberType,
  isObjectType,
  isOptional,
  isReferenceType,
  isStaticValueType,
  isStringType,
  isUnsupported,
  isWithExtraParameters,
  isWithFunctionParameters,
  isWithId,
  isWithName,
} from "./typeFactory/guards";
import { reservedWords } from "./reservedWords";
import {
  addJsDocAnnotation,
  hasNonTrailingOptionalParameters,
  pascalCase,
} from "./utils";

const createTypingsForNamespace = (
  namespace: string,
  mergedSchema: WebExtensionSchemaMapping,
  factory: ts.NodeFactory
): readonly ts.Node[] => {
  const types = (mergedSchema[namespace].types || []).concat(
    mergedSchema[namespace].functions || []
  );

  const typeDeclarations: ts.Node[] = [];
  for (const type of types) {
    if (isReferenceType(type)) {
      // merge the referenced type into the current type
      console.warn(`Reference types are not supported yet: ${type.$ref}`);
    }

    if (isFunctionType(type) && isWithName(type)) {
      // check if we have any optional parameters that are not trailing
      const infixOptionalParameterPositions =
        hasNonTrailingOptionalParameters(type);
      const maxOptionalParameterCount = infixOptionalParameterPositions.length;

      const maybeOverloadedParameters = [];

      if (isWithFunctionParameters(type)) {
        let maybePatchedParameters = type.parameters;

        // extract interfaces for the function parameters (if any)
        if (type.parameters.length > 0) {
          maybePatchedParameters = type.parameters.map((param) => {
            if (isObjectType(param)) {
              const exportedTypeName = pascalCase(
                type.name,
                isWithName(param) ? param.name : param.id
              );
              const patchedParameterType = { ...param, id: exportedTypeName };
              const patchedParameter = createSingleTyping(
                patchedParameterType,
                {
                  currentNamespace: namespace,
                  knownTypes: types,
                  alreadyDefinedTypes: typeDeclarations,
                  schemaCatalog: mergedSchema,
                  factory,
                  context: "namespace",
                }
              );
              if (
                patchedParameter &&
                ts.isInterfaceDeclaration(patchedParameter)
              ) {
                typeDeclarations.push(patchedParameter);

                param = {
                  $ref: exportedTypeName,
                  description: param.description,
                  optional: isOptional(param) ? param.optional : undefined,
                  name: isWithName(param) ? param.name : undefined,
                } as unknown as SingleType;
              }
            }

            return param;
          });
        }

        // use the original parameter list as the first option, when we have no infix optional parameters
        if (maxOptionalParameterCount > 0) {
          maybeOverloadedParameters.push(
            maybePatchedParameters.map((item) =>
              isOptional(item) ? { ...item, optional: false } : item
            )
          );
        } else {
          maybeOverloadedParameters.push(maybePatchedParameters);
        }

        if (maxOptionalParameterCount > 0) {
          // if we have optional parameters, we need to create all possible permutations:
          //  1) when we have n optional parameters, we have 2^n permutations
          //  2) we need to create a counter from 0 to 2^n - 1, for each number we
          //     create a binary representation, e.g. [ 0, 1, 1, 0] for four optional parameters
          //     0 represents a parameter that should be omitted, 1 for an included parameter
          //  3) we iterate over the binary representation and take over all parameters that
          //     should be omitted
          //  4) we finally iterate over all parameters from the original parameter list and skip
          //     all parameters that should be omitted
          //  5) with the new parameter list we create a new function declaration
          //     and add it to the implementation list
          for (
            let i = 0;
            i < Number(Math.pow(2, maxOptionalParameterCount) - 1);
            i++
          ) {
            const binaryCounter = (
              Array(maxOptionalParameterCount).join("0") + i.toString(2)
            )
              .slice(-maxOptionalParameterCount)
              .split("")
              .map(Number);
            // create a binary representation (e.g. [0, 1, 1, 0]) and map it to the parameter positions
            let removeParamPositions = binaryCounter.reduce<number[]>(
              (acc, position, index) => {
                if (position === 0) {
                  acc.push(infixOptionalParameterPositions[index]);
                }
                return acc;
              },
              []
            );

            const preparedParameterList = maybePatchedParameters.reduce<
              SingleType[]
            >((acc, item, index) => {
              if (!removeParamPositions.includes(index)) {
                let isOptionalParam = isOptional(item);
                if (infixOptionalParameterPositions.includes(index)) {
                  isOptionalParam = false;
                }
                acc.push({
                  ...item,
                  optional: isOptionalParam,
                } as unknown as SingleType);
              }
              return acc;
            }, []);

            maybeOverloadedParameters.push(preparedParameterList);
          }
        }
      }

      // now iterate over all possible parameter lists and create a function declaration for each
      if (maybeOverloadedParameters.length > 0) {
        for (const parameters of maybeOverloadedParameters) {
          const preparedType = {
            ...type,
            parameters,
          };
          const functionDeclaration = createSingleTyping(preparedType, {
            currentNamespace: namespace,
            knownTypes: types,
            alreadyDefinedTypes: typeDeclarations,
            schemaCatalog: mergedSchema,
            factory,
            context: "namespace",
          });

          if (
            functionDeclaration &&
            ts.isFunctionDeclaration(functionDeclaration)
          ) {
            const functionName = functionDeclaration.name?.text;
            if (functionName && reservedWords.includes(functionName)) {
              const functionAliasName = `__${functionName}`;
              let originalFunction = factory.updateFunctionDeclaration(
                functionDeclaration,
                [],
                functionDeclaration.asteriskToken,
                factory.createIdentifier(functionAliasName),
                functionDeclaration.typeParameters,
                functionDeclaration.parameters,
                functionDeclaration.type,
                undefined
              );

              let exportedFunctionDeclaration = factory.createExportDeclaration(
                undefined,
                false,
                factory.createNamedExports([
                  factory.createExportSpecifier(
                    false,
                    factory.createIdentifier(functionAliasName),
                    factory.createIdentifier(functionName)
                  ),
                ]),
                undefined,
                undefined
              );

              typeDeclarations.push(originalFunction);
              typeDeclarations.push(exportedFunctionDeclaration);
            } else {
              typeDeclarations.push(functionDeclaration);
            }
          }
        }
      } else {
        const functionDeclaration = createSingleTyping(type, {
          currentNamespace: namespace,
          knownTypes: types,
          alreadyDefinedTypes: typeDeclarations,
          schemaCatalog: mergedSchema,
          factory,
          context: "namespace",
        });

        if (
          functionDeclaration &&
          ts.isFunctionDeclaration(functionDeclaration)
        ) {
          typeDeclarations.push(functionDeclaration);
        }
      }
    } else if (isWithId(type) && type.id) {
      // refers to a type that has an id
      const declaration = createSingleTyping(type, {
        currentNamespace: namespace,
        knownTypes: types,
        alreadyDefinedTypes: typeDeclarations,
        schemaCatalog: mergedSchema,
        factory,
        context: "interface",
      });

      if (
        declaration &&
        (ts.isTypeNode(declaration) ||
          ts.isTypeAliasDeclaration(declaration) ||
          ts.isLiteralTypeNode(declaration) ||
          ts.isInterfaceDeclaration(declaration) ||
          ts.isPropertySignature(declaration) ||
          ts.isMethodSignature(declaration))
      ) {
        typeDeclarations.push(declaration);
      } else {
        console.warn(
          `Warning: maybe error to create typing in ${namespace} for type ${isWithId(type) ? type.id : "unknown"
          }`
        );
      }
    }
  }

  for (const event of mergedSchema[namespace].events || []) {
    if (isUnsupported(event)) {
      console.warn(
        `Warning: skipping unsupported event ${[
          namespace,
          isWithName(event) ? event.name : undefined,
        ]
          .filter(Boolean)
          .join(".")}`
      );

      continue;
    }

    let eventCallbackType = createSingleTyping(event, {
      currentNamespace: namespace,
      knownTypes: types,
      alreadyDefinedTypes: typeDeclarations,
      schemaCatalog: mergedSchema,
      factory,
      context: "inline",
    });

    if (eventCallbackType && ts.isFunctionTypeNode(eventCallbackType)) {
      const paramTypes = eventCallbackType.parameters;
      const params =
        isFunctionType(event) && isWithFunctionParameters(event)
          ? event.parameters
          : [];
      const allParamsMandatory = params.every((param) => !isOptional(param));

      if (!allParamsMandatory) {
        const firstOptionalIndex = params.findIndex((param) =>
          isOptional(param)
        );
        const firstMandatoryParams = params.findIndex(
          (param) => !isOptional(param)
        );

        if (
          firstOptionalIndex > -1 &&
          firstMandatoryParams > -1 &&
          firstOptionalIndex < firstMandatoryParams
        ) {
          // function declaration has optional parameters before mandatory ones
          // this is not supported in TypeScript, so we need to build a new function type
          // and create a union type with the new function type

          const possibleCallbackTypes = [];
          for (let i = firstOptionalIndex; i <= firstMandatoryParams; i++) {
            const modifiedParams = [
              ...params
                .slice(i, firstMandatoryParams)
                .map((item) => ({ ...item, optional: false })),
              ...params.slice(firstMandatoryParams),
            ];
            const modifiedEvent = {
              ...event,
              parameters: modifiedParams,
            };

            const modifiedEventCallbackType = createSingleTyping(
              modifiedEvent,
              {
                currentNamespace: namespace,
                knownTypes: types,
                alreadyDefinedTypes: typeDeclarations,
                schemaCatalog: mergedSchema,
                factory,
                context: "inline",
              }
            );

            if (
              modifiedEventCallbackType &&
              ts.isFunctionTypeNode(modifiedEventCallbackType)
            ) {
              possibleCallbackTypes.push(modifiedEventCallbackType);
            }
          }

          // create a union type with all possible function types
          eventCallbackType = factory.createUnionTypeNode(
            possibleCallbackTypes
          );
        }
      }

      let _eventDeclaration = factory.createVariableStatement(
        [factory.createToken(ts.SyntaxKind.ExportKeyword)],
        factory.createVariableDeclarationList(
          [
            factory.createVariableDeclaration(
              factory.createIdentifier(event.name),
              undefined,
              factory.createTypeReferenceNode(
                factory.createIdentifier("WebExtEvent"),
                [eventCallbackType]
              ),
              undefined
            ),
          ],
          ts.NodeFlags.Const
        )
      );

      if (isWithExtraParameters(event)) {
        const extraParamTypes = event.extraParameters.map((param) => {
          const paramType = createSingleTyping(param, {
            currentNamespace: namespace,
            knownTypes: types,
            alreadyDefinedTypes: typeDeclarations,
            schemaCatalog: mergedSchema,
            factory,
            context: "inline",
          });

          return factory.createParameterDeclaration(
            undefined,
            undefined,
            factory.createIdentifier(isWithName(param) ? param.name : param.id),
            isOptional(param)
              ? factory.createToken(ts.SyntaxKind.QuestionToken)
              : undefined,
            paramType && ts.isTypeNode(paramType)
              ? paramType
              : factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
            undefined
          );
        });

        _eventDeclaration = factory.createVariableStatement(
          [factory.createToken(ts.SyntaxKind.ExportKeyword)],
          factory.createVariableDeclarationList(
            [
              factory.createVariableDeclaration(
                factory.createIdentifier(event.name),
                undefined,
                factory.createTypeLiteralNode([
                  factory.createPropertySignature(
                    undefined,
                    factory.createIdentifier("addListener"),
                    undefined,
                    factory.createFunctionTypeNode(
                      undefined,
                      [
                        factory.createParameterDeclaration(
                          undefined,
                          undefined,
                          factory.createIdentifier("callback"),
                          undefined,
                          eventCallbackType,
                          undefined
                        ),
                        ...extraParamTypes,
                      ],
                      factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)
                    )
                  ),
                  factory.createPropertySignature(
                    undefined,
                    factory.createIdentifier("removeListener"),
                    undefined,
                    factory.createFunctionTypeNode(
                      undefined,
                      [
                        factory.createParameterDeclaration(
                          undefined,
                          undefined,
                          factory.createIdentifier("callback"),
                          undefined,
                          eventCallbackType,
                          undefined
                        ),
                      ],
                      factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)
                    )
                  ),
                  factory.createPropertySignature(
                    undefined,
                    factory.createIdentifier("hasListener"),
                    undefined,
                    factory.createFunctionTypeNode(
                      undefined,
                      [
                        factory.createParameterDeclaration(
                          undefined,
                          undefined,
                          factory.createIdentifier("callback"),
                          undefined,
                          eventCallbackType,
                          undefined
                        ),
                      ],
                      factory.createKeywordTypeNode(
                        ts.SyntaxKind.BooleanKeyword
                      )
                    )
                  ),
                ]),
                undefined
              ),
            ],
            ts.NodeFlags.Const
          )
        );
      }

      typeDeclarations.push(addJsDocAnnotation(event, _eventDeclaration));
    } else {
      const name = [namespace, event.name].join(".");
      console.warn(`Error creating event typing for event ${name}`);
    }
  }

  if (mergedSchema[namespace].properties) {
    Object.entries(mergedSchema[namespace].properties).forEach(
      ([propName, propValue]) => {
        if (
          isArrayType(propValue) ||
          isBooleanType(propValue) ||
          isEnumStringType(propValue) ||
          isIntegerType(propValue) ||
          isNumberType(propValue) ||
          isObjectType(propValue) ||
          isReferenceType(propValue) ||
          isStaticValueType(propValue) ||
          isStringType(propValue)
        ) {
          const propContext = {
            currentNamespace: namespace,
            knownTypes: types,
            alreadyDefinedTypes: typeDeclarations,
            schemaCatalog: mergedSchema,
            factory,
          };

          const propDeclaration = createSingleTyping(
            { ...propValue, id: propName } as SingleType,
            { ...propContext, context: "namespace" as const }
          );

          if (propDeclaration && ts.isVariableStatement(propDeclaration)) {
            typeDeclarations.push(
              addJsDocAnnotation(propValue, propDeclaration)
            );
          } else {
            // a namespace property is a value, not a type, but most generators
            // return a type alias for the "namespace" context, so build the
            // export const from the inline type instead
            const propType = createSingleTyping(
              { ...propValue, id: propName } as SingleType,
              { ...propContext, context: "inline" as const }
            );

            if (propType && ts.isTypeNode(propType)) {
              typeDeclarations.push(
                addJsDocAnnotation(
                  propValue,
                  factory.createVariableStatement(
                    [factory.createToken(ts.SyntaxKind.ExportKeyword)],
                    factory.createVariableDeclarationList(
                      [
                        factory.createVariableDeclaration(
                          factory.createIdentifier(propName),
                          undefined,
                          propType,
                          undefined
                        ),
                      ],
                      ts.NodeFlags.Const
                    )
                  )
                )
              );
            }
          }
        }
      }
    );
  }

  return typeDeclarations;
};

const createNamespaceModules = (
  mergedSchema: { [key: string]: any },
  options: { ignoredNamespaces: string[] },
  factory: ts.NodeFactory
) => {
  const statements: ts.Statement[] = [];

  Object.entries(mergedSchema).forEach(([namespace, _value]) => {
    if (options.ignoredNamespaces.includes(namespace)) {
      return;
    }

    statements.push(
      factory.createModuleDeclaration(
        undefined,
        factory.createIdentifier(namespace),
        factory.createModuleBlock(
          createTypingsForNamespace(
            namespace,
            mergedSchema,
            factory
          ) as ts.Statement[]
        ),
        ts.NodeFlags.Namespace
      )
    );
  });

  const moduleBody = factory.createModuleBlock(statements);

  return moduleBody;
};

function bootstrapWindowVariables(factory: ts.NodeFactory): ts.Statement {
  return factory.createInterfaceDeclaration(
    undefined,
    factory.createIdentifier("Window"),
    undefined,
    undefined,
    [
      factory.createPropertySignature(
        undefined,
        factory.createIdentifier("messenger"),
        undefined,
        factory.createTypeReferenceNode("typeof messenger")
      ),
    ]
  );
}

function bootstrapGlobalInterfaces(factory: ts.NodeFactory): ts.Statement[] {
  return [
    factory.createInterfaceDeclaration(
      undefined,
      factory.createIdentifier("WebExtEvent"),
      [
        factory.createTypeParameterDeclaration(
          undefined,
          factory.createIdentifier("TCallback"),
          factory.createFunctionTypeNode(
            undefined,
            [
              factory.createParameterDeclaration(
                undefined,
                factory.createToken(ts.SyntaxKind.DotDotDotToken),
                factory.createIdentifier("args"),
                undefined,
                factory.createArrayTypeNode(
                  factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
                ),
                undefined
              ),
            ],
            factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
          ),
          undefined
        ),
      ],
      undefined,
      [
        factory.createMethodSignature(
          undefined,
          factory.createIdentifier("addListener"),
          undefined,
          undefined,
          [
            factory.createParameterDeclaration(
              undefined,
              undefined,
              factory.createIdentifier("cb"),
              undefined,
              factory.createTypeReferenceNode(
                factory.createIdentifier("TCallback"),
                undefined
              ),
              undefined
            ),
          ],
          factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)
        ),
        factory.createMethodSignature(
          undefined,
          factory.createIdentifier("removeListener"),
          undefined,
          undefined,
          [
            factory.createParameterDeclaration(
              undefined,
              undefined,
              factory.createIdentifier("cb"),
              undefined,
              factory.createTypeReferenceNode(
                factory.createIdentifier("TCallback"),
                undefined
              ),
              undefined
            ),
          ],
          factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)
        ),
        factory.createMethodSignature(
          undefined,
          factory.createIdentifier("hasListener"),
          undefined,
          undefined,
          [
            factory.createParameterDeclaration(
              undefined,
              undefined,
              factory.createIdentifier("cb"),
              undefined,
              factory.createTypeReferenceNode(
                factory.createIdentifier("TCallback"),
                undefined
              ),
              undefined
            ),
          ],
          factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword)
        ),
      ]
    ),
  ];
}

export type GenerationMetadata = {
  applicationVersion: string | null;
  packageVersion: string | null;
  manifestVersion: number | null;
  channel: string | null;
  schemaRepo: string | null;
  schemaRef: string | null;
  schemaCommit: string | null;
  generatorName: string;
  generatorVersion: string;
  namespaceCount: number;
  outfile: string;
};

// no timestamp on purpose: regenerating from the same schemas must produce a
// byte-identical file, so diffs only ever reflect real schema changes
const buildFileHeader = (metadata: GenerationMetadata) => {
  const field = (label: string, value: string | number | null) =>
    value === null || value === "" ? null : ` * ${label.padEnd(21)}${value}`;

  const lines = [
    "/**",
    " * Thunderbird WebExtension API typings",
    " *",
    " * Generated from the annotated WebExtension schemas. Do not edit by hand.",
    " *",
    field("Thunderbird version:", metadata.applicationVersion ?? "unknown"),
    field("Manifest version:", metadata.manifestVersion),
    field("Channel:", metadata.channel),
    field("Schema repository:", metadata.schemaRepo),
    field("Schema ref:", metadata.schemaRef),
    field("Schema commit:", metadata.schemaCommit),
    field("Namespaces:", metadata.namespaceCount),
    field(
      "Generated by:",
      `${metadata.generatorName} ${metadata.generatorVersion}`
    ),
    " */",
    "",
  ];

  return lines.filter((line) => line !== null).join("\n");
};

const readGeneratorIdentity = async () => {
  try {
    const pkg = JSON.parse(
      await fs.readFile(path.join(__dirname, "..", "package.json"), "utf8")
    );
    return {
      name:
        typeof pkg.name === "string" ? pkg.name : "webext-typings-generator",
      version: typeof pkg.version === "string" ? pkg.version : "unknown",
    };
  } catch {
    return { name: "webext-typings-generator", version: "unknown" };
  }
};

const generateTypingsFromSchema = async (
  schemaDir: string,
  outfile: string,
  schemaSource: SchemaSource
): Promise<GenerationMetadata> => {
  const schemaFiles = await fs.readdir(schemaDir, {});
  const mergedSchema: WebExtensionSchemaMapping = {};
  const allSchemas: Array<{ applicationVersion?: string }> = [];

  for (const file of schemaFiles) {
    const filePath = path.join(schemaDir, file);
    const [canRead, _] = await isFile(filePath);

    if (!canRead) {
      console.error(`Cannot read file ${filePath}`);
      continue;
    }

    if (!file.endsWith(".json")) {
      console.error(`Skipping non-json file ${file}`);
      continue;
    }

    const contents = await fs.readFile(filePath, "utf8");
    const json = contents.replace(/^\s*\/\/.*$/gm, "");
    const schemaList = JSON.parse(json);

    if (Array.isArray(schemaList)) {
      allSchemas.push(...schemaList);
      schemaList.forEach((schema) => {
        try {
          const {
            events = [],
            types = [],
            functions = [],
            namespace,
            permissions = [],
            properties = {},
            description = "",
          } = schema;
          if (namespace) {
            // console.log(`Merging schema for ${namespace}`);
            if (mergedSchema[namespace]) {
              mergedSchema[namespace].events =
                mergedSchema[namespace].events.concat(events);
              mergedSchema[namespace].types =
                mergedSchema[namespace].types.concat(types);
              mergedSchema[namespace].functions =
                mergedSchema[namespace].functions.concat(functions);
              mergedSchema[namespace].permissions =
                mergedSchema[namespace].permissions.concat(permissions);
              mergedSchema[namespace].properties = {
                ...mergedSchema[namespace].properties,
                ...properties,
              };
            } else {
              mergedSchema[namespace] = {
                description,
                events,
                types,
                functions,
                permissions,
                properties,
                sourceFile: file,
              };
            }
          } else {
            console.error(`Schema in ${file} does not have a namespace`);
          }
        } catch (ex: any) {
          console.error(`Error parsing schema in ${file}: ${ex.message}`);
        }
      });
    } else {
      console.error(`Schema in ${file} is not an array`);
    }
  }

  const factory = ts.factory;
  const declaredNamespaces = createNamespaceModules(
    mergedSchema,
    { ignoredNamespaces: [] },
    factory
  );

  const reExports = declaredNamespaces.statements.reduce<{
    [key: string]: ts.ImportEqualsDeclaration;
  }>((acc, node) => {
    if (
      node.kind === ts.SyntaxKind.ModuleDeclaration &&
      ts.isModuleDeclaration(node)
    ) {
      const name = node.name.text;
      const normalizedName = name.substring(0, `${name}.`.indexOf("."));

      if (!acc[normalizedName]) {
        acc[normalizedName] = factory.createImportEqualsDeclaration(
          [factory.createToken(ts.SyntaxKind.ExportKeyword)],
          false,
          factory.createIdentifier(normalizedName),
          factory.createQualifiedName(
            factory.createIdentifier("messenger"),
            factory.createIdentifier(normalizedName)
          )
        );
      }
    }

    return acc;
  }, {});

  const nsMessenger = factory.createModuleDeclaration(
    [factory.createModifier(ts.SyntaxKind.DeclareKeyword)],
    factory.createIdentifier("messenger"),
    declaredNamespaces,
    ts.NodeFlags.Namespace
  );

  const nsBrowser = factory.createModuleDeclaration(
    [factory.createModifier(ts.SyntaxKind.DeclareKeyword)],
    factory.createIdentifier("browser"),
    factory.createModuleBlock(Object.values(reExports)),
    ts.NodeFlags.Namespace
  );

  const source = ts.createSourceFile(
    "../.out/messenger.d.ts",
    "",
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS
  );

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const src = printer.printList(
    ts.ListFormat.MultiLineBlockStatements,
    factory.createNodeArray([
      /* /// <reference lib="dom" /> */
      bootstrapWindowVariables(factory),
      ...bootstrapGlobalInterfaces(factory),
      nsMessenger,
      nsBrowser,
    ]),
    source
  );

  const applicationVersion = detectApplicationVersion(allSchemas);
  const generator = await readGeneratorIdentity();
  const metadata: GenerationMetadata = {
    applicationVersion,
    packageVersion: packageVersionFor(applicationVersion),
    manifestVersion: schemaSource.manifestVersion,
    channel: schemaSource.channel,
    schemaRepo: schemaSource.repo,
    schemaRef: schemaSource.ref,
    schemaCommit: schemaSource.commit,
    generatorName: generator.name,
    generatorVersion: generator.version,
    namespaceCount: Object.keys(mergedSchema).length,
    outfile,
      };

      await fs.writeFile(outfile, `${buildFileHeader(metadata)}${src}`, {
        flag: "w+",
      });

      return metadata;
    };

const isFile = async (file: string) => {
  try {
    const stat = await fs.stat(file);

    return [stat.isFile(), null];
  } catch (error) {
    return [null, error];
  }
};

const canAccessDirectory = async (
  directory: string,
  flags: number = fs.constants.O_DIRECTORY,
  reportError: boolean = true
) => {
  try {
    await fs.access(directory, flags);
    return [directory, null];
  } catch (error) {
    if (reportError) {
      console.error(`Error: cannot access directory: ${directory}`);
    }
    return [null, error];
  }
};

const ensureDirectory = async (
  dir: string,
  flags: number = fs.constants.O_DIRECTORY
) => {
  try {
    // A missing directory is not an error here, it is created below.
    const [hasAccess, error] = await canAccessDirectory(dir, flags, false);
    if (hasAccess) {
      return [true, null];
    }
    await fs.mkdir(path.join(dir), { recursive: true });
    return [true, null];
  } catch (error) {
    return [null, error];
  }
};

export const createTypingsFile = async (
  schemaDir: string,
  outfile: string,
  forceCreateDir: boolean,
  options: {
    schemaSource?: SchemaSource;
    metaFile?: string;
  } = {}
): Promise<GenerationMetadata | null> => {
  try {
    const outDir = path.dirname(outfile);

    const [hasSchemaDirAccess, schemaDirError] = await (forceCreateDir
      ? ensureDirectory(schemaDir, fs.constants.O_RDWR)
      : canAccessDirectory(schemaDir));
    const [hasOutDirAcess, outDirError] = await (forceCreateDir
      ? ensureDirectory(outDir, fs.constants.O_RDWR)
      : canAccessDirectory(outDir, fs.constants.O_RDWR));

    if (hasSchemaDirAccess && hasOutDirAcess) {
      const schemaSource: SchemaSource = options.schemaSource || {
        schemaDir,
        ref: null,
        repo: null,
        commit: null,
        manifestVersion: null,
        channel: null,
      };

      const metadata = await generateTypingsFromSchema(
        schemaDir,
        outfile,
        schemaSource
      );

      if (options.metaFile) {
        await ensureDirectory(
          path.dirname(options.metaFile),
          fs.constants.O_RDWR
        );
        await fs.writeFile(
          options.metaFile,
          `${JSON.stringify(metadata, null, 2)}\n`,
          { flag: "w+" }
        );
          }

          return metadata;
        }
  } catch (e) {
    console.error(e);
  }

  return null;
};
