import { describe, expect, test } from "vitest";
import { RouterRequest } from "../src/router/request";

describe("Query", () => {
  test("req.query() and req.queries()", () => {
    const rawRequest = new Request("http://localhost?page=2&tag=A&tag=B");
    const req = new RouterRequest(rawRequest);

    const page = req.query("page");
    expect(page).not.toBeUndefined();
    expect(page).toBe("2");

    const q = req.query("q");
    expect(q).toBeUndefined();

    const tags = req.queries("tag");
    expect(tags).not.toBeUndefined();
    expect(tags).toEqual(["A", "B"]);

    const q2 = req.queries("q2");
    expect(q2).toBeUndefined();
  });

  test("decode special chars", () => {
    const rawRequest = new Request(
      "http://localhost?mail=framework%40hono.dev&tag=%401&tag=%402",
    );
    const req = new RouterRequest(rawRequest);

    const mail = req.query("mail");
    expect(mail).toBe("framework@hono.dev");

    const tags = req.queries("tag");
    expect(tags).toEqual(["@1", "@2"]);
  });
});

describe('headers', () => {
  test('empty string is a valid header value', () => {
    const req = new RouterRequest(new Request('http://localhost', { headers: { foo: '' } }))
    const foo = req.header('foo')
    expect(foo).toEqual('')
  })
})

describe("Body methods with caching", () => {
  const text = '{"foo":"bar"}';
  const json = { foo: "bar" };
  const buffer = new TextEncoder().encode(text).buffer;

  test("req.text()", async () => {
    const req = new RouterRequest(
      new Request("http://localhost", {
        method: "POST",
        body: text,
      }),
    );

    expect(await req.text()).toEqual(text);
    expect(await req.json()).toEqual(json);
    expect(await req.arrayBuffer()).toEqual(buffer);
    expect(await req.blob()).toEqual(
      new Blob([text], {
        type: "text/plain;charset=utf-8",
      }),
    );
  });

  test("req.json()", async () => {
    const req = new RouterRequest(
      new Request("http://localhost", {
        method: "POST",
        body: '{"foo":"bar"}',
      }),
    );
    expect(await req.json()).toEqual(json);
    expect(await req.text()).toEqual(text);
    expect(await req.arrayBuffer()).toEqual(buffer);
    expect(await req.blob()).toEqual(
      new Blob([text], {
        type: "text/plain;charset=utf-8",
      }),
    );
  });

  test("req.arrayBuffer()", async () => {
    const req = new RouterRequest(
      new Request("http://localhost", {
        method: "POST",
        body: buffer,
      }),
    );
    expect(await req.arrayBuffer()).toEqual(buffer);
    expect(await req.text()).toEqual(text);
    expect(await req.json()).toEqual(json);
    expect(await req.blob()).toEqual(
      new Blob([text], {
        type: "",
      }),
    );
  });

  test("req.blob()", async () => {
    const blob = new Blob(['{"foo":"bar"}'], {
      type: "application/json",
    });

    const req = new RouterRequest(
      new Request("http://localhost", {
        method: "POST",
        body: blob,
      }),
    );
    expect(await req.blob()).toEqual(blob);
    expect(await req.text()).toEqual(text);
    expect(await req.json()).toEqual(json);
    expect(await req.arrayBuffer()).toEqual(buffer);
  });

  test("req.formData()", async () => {
    const data = new FormData();
    data.append("foo", "bar");

    const req = new RouterRequest(
      new Request("http://localhost", {
        method: "POST",
        body: data,
      }),
    );

    expect((await req.formData()).get("foo")).toBe("bar");
    expect(async () => await req.text()).not.toThrow();
    expect(async () => await req.arrayBuffer()).not.toThrow();
    expect(async () => await req.blob()).not.toThrow();
  });
});
