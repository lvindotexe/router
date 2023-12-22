import { Node } from "../src/index.ts";
import {
  assertEquals,
  assertExists,
  assertStrictEquals,
} from "https://deno.land/std@0.210.0/assert/mod.ts";

Deno.test("Root Node", async (t) => {
  const node = new Node();
  node.add("GET", "/", "get root");

  await t.step("get /", () => {
    const [res] = node.find("GET", "/")!;
    assertExists(res);
    assertStrictEquals(res, "get root");
    assertStrictEquals(node.find("GET", "/hello"), undefined);
  });
});

Deno.test("Root Node is not defined", async (t) => {
  const node = new Node();
  node.add("GET", "/hello", "get hello");

  await t.step("get /", () => {
    const result = node.find("GET", "/");
    assertEquals(result, undefined);
  });
});

//TODO handle wildcards
// Deno.test("Get with *", (t) => {
//   const node = new Node();
//   node.add("GET", "*", "get all");

//   t.step("get /", () => {
//     assertStrictEquals(node.find("GET", "/")![0].length, 1);
//     assertStrictEquals(node.find("GET", "/hello")![0].length, 1);
//   });
// });

Deno.test("Basic Usage", async (t) => {
  const node = new Node();
  node.add("GET", "/hello", "get hello");
  node.add("POST", "/hello", "post hello");
  node.add("GET", "/hello/foo", "get hello foo");

  await t.step("get, post /hello", () => {
    assertEquals(node.find("GET", "/"), undefined);
    assertEquals(node.find("POST", "/"), undefined);
    assertStrictEquals(node.find("GET", "/hello")![0], "get hello");
    assertStrictEquals(node.find("GET", "hello")![0], "get hello");
    assertStrictEquals(node.find("POST", "/hello")![0], "post hello");
    assertStrictEquals(node.find("PUT", "/hello"), undefined);
  });

  await t.step("get /nothing", () => {
    assertStrictEquals(node.find("GET", "/nothing"), undefined);
  });

  await t.step("/hello/foo, /hello/bar", () => {
    assertStrictEquals(node.find("GET", "/hello/foo")![0], "get hello foo");
    assertStrictEquals(node.find("POST", "/hello/foo"), undefined);
    assertStrictEquals(node.find("GET", "/hello/bar"), undefined);
  });

  await t.step("/hello/foo/bar", () => {
    assertStrictEquals(node.find("GET", "/hello/foo/bar"), undefined);
  });
});
