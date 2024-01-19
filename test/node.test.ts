import { Node, type Handler } from "../src/index.ts";
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.210.0/assert/mod.ts";

Deno.test("Root Node", async (t) => {
  const node = new Node();
  node.add("GET", "/","get root");

  console.log("hello world")
  await t.step("get /", () => {
    const [res] = node.find("GET", "/")!;
    assertExists(res);
    assertEquals(res, "get root");
    assertEquals(node.find("GET", "/hello"), []);
  });
});

Deno.test("Root Node is not defined", async (t) => {
  const node = new Node();
  node.add("GET", "/hello", "get hello");

  await t.step("get /", () => {
    const result = node.find("GET", "/");
    assertEquals(result, new Array<Handler>());
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

Deno.test("Basic Usage", async (t) => {
  const node = new Node();
  node.add("GET", "/hello", "get hello");
  node.add("POST", "/hello", "post hello");
  node.add("GET", "/hello/foo", "get hello foo");

  await t.step("get, post /hello", () => {
    assertEquals(node.find("GET", "/"), new Array<Handler>());
    assertEquals(node.find("POST", "/"), new Array<Handler>());
    assertEquals(node.find("GET", "/hello")![0], "get hello");
    assertEquals(node.find("GET", "hello")![0], "get hello");
    assertEquals(node.find("POST", "/hello")![0], "post hello");
    assertEquals(node.find("PUT", "/hello"), new Array<Handler>());
  });

  await t.step("get /nothing", () => {
    assertEquals(node.find("GET", "/nothing"), new Array<Handler>());
  });

  await t.step("/hello/foo, /hello/bar", () => {
    assertEquals(node.find("GET", "/hello/foo")![0], "get hello foo");
    assertEquals(node.find("POST", "/hello/foo"), new Array<Handler>());
    assertEquals(node.find("GET", "/hello/bar"), new Array<Handler>());
  });

  await t.step("/hello/foo/bar", () => {
    assertEquals(node.find("GET", "/hello/foo/bar"), new Array<Handler>());
  });
});

Deno.test("Wildcard", async (t) => {
  const node = new Node();

  node.add("GET", "/wildcard-abc/*/wildcard-efg", "wildcard");
  node.add("GET", "/wildcard-abc/*/wildcard-efg/hijk", "wildcard");

  await t.step("/wildcard-abc/xxxxxx/wildcard-efg", () => {
    const [res] = node.find("GET", "/wildcard-abc/xxxxxx/wildcard-efg")!;
    assertExists(res);
    assertEquals(res, "wildcard");
  });

  await t.step("/wildcard-abc/xxxxxx/wildcard-efg/hijk", () => {
    const [res] = node.find("GET", "/wildcard-abc/xxxxxx/wildcard-efg/hijk")!;
    assertExists(res);
    assertEquals(res, "wildcard");
  });

  await t.step("Special Wildcard", async (t) => {
    const node = new Node();
    node.add("ALL", "*", "match all");

    await t.step("/foo", () => {
      const [res] = node.find("GET", "/foo")!;
      assertExists(res);
      assertEquals(res, "match all");
    });

    await t.step("/hello", () => {
      const [res] = node.find("GET", "/hello")!;
      assertExists(res);
      assertEquals(res, "match all");
    });

    await t.step("/hello/foo", () => {
      const [res] = node.find("GET", "/hello/foo")!;
      assertExists(res);
      assertEquals(res, "match all");
    });
  });

  await t.step("wildcard as middleware", async () => {
    const node = new Node();
    node.add("ALL", "*", "middleware 1");
    node.add("ALL", "*", "middleware 2");
    node.add("GET", "/hello", "response");

    const [middleware1, middleware2, res] = await node.find("GET", "/hello")!;
    assertExists(middleware1);
    assertExists(middleware2);
    assertExists(res);
    assertEquals(middleware1, "middleware 1");
    assertEquals(middleware2, "middleware 2");
    assertEquals(res, "response");
  });
});