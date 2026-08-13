/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { ReferenceType, TypeGeneratorContext } from "./types";
import { isWithId, isWithName } from "./guards";
import { addJsDocAnnotation } from "../utils";
import ts from "typescript";

export const generateReferenceType = (
  type: ReferenceType,
  ctx: TypeGeneratorContext
) => {
  const {
    currentNamespace,
    knownTypes,
    alreadyDefinedTypes,
    schemaCatalog,
    context,
    factory,
  } = ctx;

  const referenceLink = type.$ref.split(".");
  if (referenceLink.length === 1) {
    // if it's a reference to a type in the same namespace we need to check whether it exists or not
    const localType = (schemaCatalog[currentNamespace]?.types || []).find(
      (someType) => isWithId(someType) && someType.id === type.$ref
    );

    // check if the type is somewhere in the global scope; a schema set without a
    // manifest namespace is unusual, but must not crash the run
    const manifestType = (schemaCatalog["manifest"]?.types || []).find(
      (someType) => isWithId(someType) && someType.id === type.$ref
    );

    // check if the type is already defined by another namespace
    const alreadyDefinedType = alreadyDefinedTypes.find((node) => {
      if (
        ts.isTypeAliasDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isFunctionDeclaration(node)
      ) {
        if (node.name && ts.isIdentifier(node.name)) {
          return node.name.text === type.$ref;
        }
      }

      return false;
    });

    if (alreadyDefinedType === undefined && localType === undefined) {
      if (manifestType !== undefined) {
        console.warn(
          `Warning: schema incorrect, referenced local type: ${type.$ref} in '${currentNamespace}', but should reference manifest.${type.$ref}`
        );
        type.$ref = `manifest.${type.$ref}`;
      } else {
        // not local nor in the manifest, so search the other namespaces and
        // qualify the reference with whichever one owns it
        const owningNamespace = Object.keys(schemaCatalog).find(
          (namespace) =>
            namespace !== currentNamespace &&
            (schemaCatalog[namespace].types || []).some(
              (someType) => isWithId(someType) && someType.id === type.$ref
            )
        );

        if (owningNamespace !== undefined) {
          console.warn(
            `Warning: schema incorrect, referenced local type: ${type.$ref} in '${currentNamespace}', but should reference ${owningNamespace}.${type.$ref}`
          );
          type.$ref = `${owningNamespace}.${type.$ref}`;
        } else {
          console.warn(
            `Warning: referenced type '${type.$ref}' not found in schema '${currentNamespace}'`
          );
        }
      }
    }
  }

  const referenceType = factory.createTypeReferenceNode(type.$ref);

  if (context === "inline") {
    return referenceType;
  } else if (context === "namespace") {
    const identifier = isWithName(type) ? type.name : type.id;
    return factory.createVariableStatement(
      [factory.createToken(ts.SyntaxKind.ExportKeyword)],
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            factory.createIdentifier(identifier),
            undefined,
            referenceType,
            undefined
          ),
        ],
        ts.NodeFlags.Const
      )
    );
  } else if (context === "interface") {
    const identifier = isWithName(type) ? type.name : type.id;
    return addJsDocAnnotation(
      type,
      factory.createPropertySignature(
        undefined,
        factory.createIdentifier(identifier),
        undefined,
        referenceType
      )
    );
  }

  throw new Error("Invalid type generator context");
};
