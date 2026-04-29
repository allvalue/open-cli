import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveOperationEither } from "../resolve-operation.js";
import type { IntrospectionField } from "../introspection-types.js";

function makeField(name: string): IntrospectionField {
  return { name, args: [], type: { kind: "SCALAR", name: "String" } };
}

const queryFields = new Map([
  ["collections", makeField("collections")],
  ["products", makeField("products")],
  ["orders", makeField("orders")],
]);
const mutationFields = new Map([["productCreate", makeField("productCreate")]]);

test("resolveOperationEither - exact camelCase match", () => {
  const r = resolveOperationEither("admin", "collections", queryFields, mutationFields);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.op.graphqlName, "collections");
});
test("resolveOperationEither - kebab-case match", () => {
  const r = resolveOperationEither("admin", "product-create", queryFields, mutationFields);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.op.graphqlName, "productCreate");
});
test("resolveOperationEither - mutation found", () => {
  const r = resolveOperationEither("admin", "productCreate", queryFields, mutationFields);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.op.kind, "mutation");
});
test("resolveOperationEither - not found returns suggestions", () => {
  const r = resolveOperationEither("admin", "product", queryFields, mutationFields);
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.suggestions.length > 0);
});
test("resolveOperationEither - alias search-order", () => {
  const fields = new Map([["orders", makeField("orders")]]);
  const r = resolveOperationEither("admin", "search-order", fields, new Map());
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.op.graphqlName, "orders");
});
