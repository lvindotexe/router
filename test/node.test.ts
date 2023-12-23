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

Deno.test("All", async (t) => {
  const node = new Node();
  node.add("ALL", "/all-methods", "all methods"); // ALL

  await t.step("/all-methods with GET", () => {
    const [res] = node.find("GET", "/all-methods")!;
    assertExists(res);
    assertEquals(res, "all methods");
  });

  await t.step("/all-methods with PUT", () => {
    const [res] = node.find("PUT", "/all-methods")!;
    assertExists(res);
    assertEquals(res, "all methods");
  });
});

// Deno.test("Basic Usage", async (t) => {
//   const node = new Node();
//   node.add("GET", "/hello", "get hello");
//   node.add("POST", "/hello", "post hello");
//   node.add("GET", "/hello/foo", "get hello foo");

//   await t.step("get, post /hello", () => {
//     assertEquals(node.find("GET", "/"), undefined);
//     assertEquals(node.find("POST", "/"), undefined);
//     assertStrictEquals(node.find("GET", "/hello")![0], "get hello");
//     assertStrictEquals(node.find("GET", "hello")![0], "get hello");
//     assertStrictEquals(node.find("POST", "/hello")![0], "post hello");
//     assertStrictEquals(node.find("PUT", "/hello"), undefined);
//   });

//   await t.step("get /nothing", () => {
//     assertStrictEquals(node.find("GET", "/nothing"), undefined);
//   });

//   await t.step("/hello/foo, /hello/bar", () => {
//     assertStrictEquals(node.find("GET", "/hello/foo")![0], "get hello foo");
//     assertStrictEquals(node.find("POST", "/hello/foo"), undefined);
//     assertStrictEquals(node.find("GET", "/hello/bar"), undefined);
//   });

//   await t.step("/hello/foo/bar", () => {
//     assertStrictEquals(node.find("GET", "/hello/foo/bar"), undefined);
//   });
// });

// Deno.test("Wildcard", async (t) => {
//   const node = new Node();

//   node.add("GET", "/wildcard-abc/*/wildcard-efg", "wildcard");
//   node.add("GET", "/wildcard-abc/*/wildcard-efg/hijk", "wildcard");

//   await t.step("/wildcard-abc/xxxxxx/wildcard-efg", () => {
//     const [res] = node.find("GET", "/wildcard-abc/xxxxxx/wildcard-efg")!;
//     assertExists(res);
//     assertEquals(res, "wildcard");
//   });

//   await t.step("/wildcard-abc/xxxxxx/wildcard-efg/hijk", () => {
//     const [res] = node.find("GET", "/wildcard-abc/xxxxxx/wildcard-efg/hijk")!;
//     assertExists(res);
//     assertEquals(res[0], "wildcard");
//   });

//   await t.step("Special Wildcard", async (t) => {
//     const node = new Node();
//     node.add("ALL", "*", "match all");

//     await t.step("/foo", () => {
//       const [res] = node.find("GET", "/foo")!;
//       assertExists(res);
//       assertEquals(res, "match all");
//     });

//     await t.step("/hello", () => {
//       const [res] = node.find("GET", "/hello")!;
//       assertExists(res);
//       assertEquals(res, "match all");
//     });

//     await t.step("/hello/foo", () => {
//       const [res] = node.find("GET", "/hello/foo")!;
//       assertExists(res);
//       assertEquals(res, "match all");
//     });
//   });

//   await t.step("wildcard as middleware", async () => {
//     const node = new Node();
//     node.add("ALL", "*", "middleware 1");
//     node.add("ALL", "*", "middleware 2");
//     node.add("GET", "/hello", "response");

//     const [middleware1, middleware2, res] = await node.find("GET", "/hello")!;
//     assertExists(middleware1);
//     assertExists(middleware2);
//     assertExists(res);
//     assertEquals(middleware1, "middleware 1");
//     assertEquals(middleware2, "middleware 2");
//     assertEquals(res, "response");
//   });
// });
