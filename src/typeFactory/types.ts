/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import ts from "typescript";

export interface WithDescription {
  description: string;
}

export interface WithDeprecation {
  deprecated: string;
}

export interface WithUnsupported {
  unsupported: boolean;
}

export interface WithId {
  id: string;
}

export interface WithOptional {
  optional: boolean | "omit-key-if-missing";
}

export interface WithName {
  name: string;
}

export interface AnyType {
  type: "any";
}

export interface WithInstanceOf extends ObjectType {
  isInstanceOf: string;
}

export interface WithFunctions extends ObjectType {
  functions: FunctionType[];
}

export interface WithMaybeAsync extends FunctionType {
  async: string | boolean;
}

export interface WithProps extends ObjectType {
  properties: { [key: string]: SingleType & WithOptional };
}

export interface WithPatternProperties extends ObjectType {
  patternProperties: { [key: string]: SingleType & WithOptional };
}

export interface WithAdditionalProperties extends ObjectType {
  additionalProperties: boolean | (SingleType & WithOptional);
}

export interface ReferenceType extends WithId, WithDescription {
  $ref: string;
}

export interface ObjectType extends WithId, WithDescription {
  type: "object";
  options: SingleType[];
  properties: { [key: string]: SingleType & WithOptional };
}

export interface EnumType extends WithId, WithDescription {
  enum: string[] | (WithName & WithDescription)[];
}

export interface ArrayType extends WithId, WithDescription {
  type: "array";
  items: SingleType;
}

export interface FunctionType extends WithDescription {
  type: "function";
  name: string;
}

export interface AsyncFunctionType extends FunctionType {
  async: boolean;
}

export interface OptionalFunctionType extends FunctionType {
  optional: boolean;
}

export interface WithFunctionParameters extends FunctionType {
  parameters: SingleType[];
}

export interface WithExtraParameters extends FunctionType {
  extraParameters: SingleType[];
}

export interface WithReturn extends FunctionType {
  returns: SingleType;
}

export interface SingleType extends WithId, WithDescription {
  type:
    | "number"
    | "string"
    | "integer"
    | "boolean"
    | "object"
    | "array"
    | "null";
}

export interface UnionType extends WithDescription {
  choices: WebExtensionType[];
}

export type SimpleStringType = SingleType & { type: "string" };

export type NumberType = SingleType & { type: "number" };

export type IntegerType = SingleType & { type: "integer" };

export type BooleanType = SingleType & { type: "boolean" };

export type EnumStringType = EnumType & SimpleStringType;

export type StringType = SimpleStringType | EnumStringType;

export type NullType = { type: "null" };

export type StaticValueType = { value: string | number | boolean };

export type WebExtensionType =
  | AnyType
  | ArrayType
  | BooleanType
  | EnumType
  | FunctionType
  | IntegerType
  | NullType
  | NumberType
  | ObjectType
  | ReferenceType
  | SingleType
  | StaticValueType
  | StringType
  | UnionType;

export type WebExtensionSchemaMapping = {
  [key: string]: {
    types: WebExtensionType[];
    events: any[];
    functions: FunctionType[];
    permissions: string[];
    properties: Record<string, any>;
    description: string;
    sourceFile: string;
  };
};

export type TypeGeneratorContext = {
  currentNamespace: string;
  knownTypes: WebExtensionType[];
  alreadyDefinedTypes: ts.Node[];
  schemaCatalog: WebExtensionSchemaMapping;
  context: "namespace" | "interface" | "inline";
  factory: ts.NodeFactory;
};
