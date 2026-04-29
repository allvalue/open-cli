/** GraphQL introspection JSON（节选） */

export type TypeRef = {
  kind: string;
  name?: string | null;
  ofType?: TypeRef | null;
};

export type IntrospectionInputValue = {
  name: string;
  description?: string | null;
  type: TypeRef;
  defaultValue?: string | null;
  isDeprecated?: boolean;
};

export type IntrospectionField = {
  name: string;
  description?: string | null;
  args: IntrospectionInputValue[];
  type: TypeRef;
  isDeprecated?: boolean;
};

export type IntrospectionEnumValue = {
  name: string;
  description?: string | null;
  isDeprecated?: boolean;
};

export type IntrospectionType = {
  kind: string;
  name?: string | null;
  description?: string | null;
  fields?: IntrospectionField[] | null;
  inputFields?: IntrospectionInputValue[] | null;
  enumValues?: IntrospectionEnumValue[] | null;
};

export type IntrospectionSchema = {
  data: {
    __schema: {
      queryType: { name: string };
      mutationType?: { name: string } | null;
      types: IntrospectionType[];
    };
  };
};

export type OperationKind = "query" | "mutation";

export type ResolvedOperation = {
  kind: OperationKind;
  field: IntrospectionField;
  /** 用户输入的 kebab 名（若用了别名则保留） */
  userToken: string;
  /** 实际 GraphQL 字段名 */
  graphqlName: string;
};
