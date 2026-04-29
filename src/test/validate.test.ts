import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJsonSafe, validateFieldArguments, isArgRequired, typeRefToString } from "../validate.js";
import type { IntrospectionType } from "../introspection-types.js";

const typeMap = new Map<string, IntrospectionType>([
  ["String", { kind: "SCALAR", name: "String" }],
  ["Int", { kind: "SCALAR", name: "Int" }],
  ["Boolean", { kind: "SCALAR", name: "Boolean" }],
  ["SortKey", { kind: "ENUM", name: "SortKey", enumValues: [{ name: "CREATED_AT" }, { name: "TITLE" }] }],
]);

test("parseJsonSafe - valid JSON", () => {
  const r = parseJsonSafe('{"first":10}');
  assert.equal(r.ok, true);
  assert.deepEqual((r as any).value, { first: 10 });
});
test("parseJsonSafe - invalid JSON", () => assert.equal(parseJsonSafe("{bad}").ok, false));
test("isArgRequired - NON_NULL", () => assert.equal(isArgRequired({ kind: "NON_NULL", ofType: { kind: "SCALAR", name: "String" } }), true));
test("isArgRequired - optional", () => assert.equal(isArgRequired({ kind: "SCALAR", name: "String" }), false));
test("typeRefToString - NON_NULL String", () => assert.equal(typeRefToString({ kind: "NON_NULL", ofType: { kind: "SCALAR", name: "String" } }), "String!"));
test("typeRefToString - LIST of Int", () => assert.equal(typeRefToString({ kind: "LIST", ofType: { kind: "SCALAR", name: "Int" } }), "[Int]"));
test("validateFieldArguments - missing required arg", () => {
  const args = [{ name: "id", type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "String" } } }] as any;
  const issues = validateFieldArguments({}, args, typeMap);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /必填/);
});
test("validateFieldArguments - unknown arg", () => {
  const args = [{ name: "first", type: { kind: "SCALAR", name: "Int" } }] as any;
  const issues = validateFieldArguments({ first: 10, unknown: "x" }, args, typeMap);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].path, "unknown");
});
test("validateFieldArguments - wrong scalar type", () => {
  const args = [{ name: "first", type: { kind: "SCALAR", name: "Int" } }] as any;
  const issues = validateFieldArguments({ first: "not-a-number" }, args, typeMap);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /Int/);
});
test("validateFieldArguments - valid enum", () => {
  const args = [{ name: "sortKey", type: { kind: "SCALAR", name: "SortKey" } }] as any;
  assert.equal(validateFieldArguments({ sortKey: "CREATED_AT" }, args, typeMap).length, 0);
});
test("validateFieldArguments - invalid enum value", () => {
  const args = [{ name: "sortKey", type: { kind: "SCALAR", name: "SortKey" } }] as any;
  assert.equal(validateFieldArguments({ sortKey: "INVALID" }, args, typeMap).length, 1);
});
test("validateFieldArguments - no args, empty variables", () => assert.equal(validateFieldArguments({}, [], typeMap).length, 0));
