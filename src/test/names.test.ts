import { test } from "node:test";
import assert from "node:assert/strict";
import { camelToKebab, kebabToCamel } from "../names.js";

test("camelToKebab - productCreate", () => assert.equal(camelToKebab("productCreate"), "product-create"));
test("camelToKebab - collections", () => assert.equal(camelToKebab("collections"), "collections"));
test("camelToKebab - getProductById", () => assert.equal(camelToKebab("getProductById"), "get-product-by-id"));
test("kebabToCamel - product-create", () => assert.equal(kebabToCamel("product-create"), "productCreate"));
test("kebabToCamel - collections", () => assert.equal(kebabToCamel("collections"), "collections"));
test("kebabToCamel - get-product-by-id", () => assert.equal(kebabToCamel("get-product-by-id"), "getProductById"));
