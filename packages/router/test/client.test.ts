import { describe, expect, expectTypeOf, it } from "vitest";
import { rc } from "../src/client";
import { Router } from "../src/router";
import z from "zod";
import { Equal, Expect } from "./utils";

describe("Basic - JSON", () => {
    const app = new Router();
    const route = app
        .post(
            "/posts",
            (c) => {
                return c.json({
                    success: true,
                    message: "dummy",
                    requestContentType: "application/json",
                    requestRouter: "hono",
                    requestMessage: "foobar",
                    requestBody: {
                        id: 123,
                        title: "Hello! Router!",
                    },
                });
            },
            {
                cookie: z.object({ debug: z.string() }),
                headers: z.object({ "x-message": z.string() }),
                json: z.object({ id: z.number(), title: z.string() }),
            },
        )
        .get("/hello-not-found", (c) => c.notFound())
        .get("/text", (c) => c.text("hello world"))
        .get("/json", (c) => c.json({ hello: "world" }))
        .get("/null", (c) => c.json(null));

    type AppType = typeof route;

    const client = rc<AppType>("http://localhost", {
        fetch: (input, init) => route.request(input, init),
        headers: { "x-hono": "hono" },
    });

    const json = { id: 123, title: "Hello! Router!" };

    it("Should get 200 response", async () => {
        const res = await client.posts.$post({
            json,
            headers: {
                "x-message": "foobar",
            },
            cookie: {
                debug: "true",
            },
        });

        const data = await res.json();
        expect(res.ok).toBe(true);
        expect(data.success).toBe(true);
        expect(data.message).toBe("dummy");
        expect(data.requestContentType).toBe("application/json");
        expect(data.requestRouter).toBe("hono");
        expect(data.requestMessage).toBe("foobar");
        expect(data.requestBody).toEqual(json);
    });

    it("Should get 404 response", async () => {
        const req = client["hello-not-found"].$req("get", {});
        expect((await route.request(req)).status).toBe(404);
    });

    it("Should get a `null` content", async () => {
        const client = rc<AppType>("http://localhost");
        const req = client.null.$req("get", {});
        const res = await route.request(req);
        const data = await res.json();
        expectTypeOf(data).toMatchTypeOf<unknown>();
        expect(data).toBe(null);
    });

    it("Should have correct types - primitives", async () => {
        const app = new Router();
        const route = app
            .get("/api/string", (c) => c.json("a-string"))
            .get("/api/number", (c) => c.json(37))
            .get("/api/boolean", (c) => c.json(true))
            .get(
                "/api/generic",
                (c) =>
                    c.json(
                        Math.random() > 0.5
                            ? Boolean(Math.random())
                            : Math.random(),
                    ),
            );
        type AppType = typeof route;
        type UnWrap<T extends PromiseLike<any>> = T extends PromiseLike<infer R>
            ? R extends PromiseLike<any> ? UnWrap<R> : R
            : never;

        const client = rc<AppType>("http://localhost", {
            fetch: async (input, init) => {
                const req = input instanceof Request
                    ? input
                    : new Request(input, init);
                const res = await route.request(req);
                return res;
            },
        });
        const stringFetch = await client.api.string.$get();
        const stringRes = await stringFetch.json();
        const numberFetch = await client.api.number.$get();
        const numberRes = await numberFetch.json();
        const booleanFetch = await client.api.boolean.$get();
        const booleanRes = await booleanFetch.json();
        const genericFetch = await client.api.generic.$get();
        const genericRes = await genericFetch.json();

        type stringVerify = Expect<
            Equal<
                "a-string",
                typeof stringRes
            >
        >;
        expect(stringRes).toBe("a-string");
        type numberVerify = Expect<
            Equal<37, typeof numberRes>
        >;
        expect(numberRes).toBe(37);
        type booleanVerify = Expect<
            Equal<true, typeof booleanRes>
        >;
        expect(booleanRes).toBe(true);
        type genericVerify = Expect<
            Equal<
                number | boolean,
                typeof genericRes
            >
        >;
        expect(
            typeof genericRes === "number" || typeof genericRes === "boolean",
        ).toBe(true);

        type textTest = Expect<
            Equal<
                string,
                UnWrap<ReturnType<typeof genericFetch.text>>
            >
        >;
    });
});

describe("Basic - query, queries, form, path params, header and cookie", () => {
    const app = new Router();

    const route = app
        .get(
            "/search",
            async (c) => {
                const data = c.valid("query");
                return c.json(data);
            },
            {
                query: z.object({
                    q: z.string(),
                    tag: z.array(z.string()),
                }),
            },
        )
        //TODO support lazy and eager form validation
        .post(
            "/post/id",
            async (c) => {
                const data = c.valid("form");
                return c.json(data);
            },
            { form: z.object({ title: z.string() }) },
        )
        .get(
            "/header",
            async (c) => {
                const data = c.valid("headers");
                return c.json(data);
            },
            { headers: z.object({ "x-message-id": z.string() }) },
        )
        .get(
            "/cookie",
            async (c) => {
                const data = c.valid("cookie");
                return c.json(data);
            },
            {
                cookie: z.object({ hello: z.string() }),
            },
        );

    type AppType = typeof route;
    const client = rc<AppType>("http://localhost", {
        fetch: (input, init) =>
            route.request(
                input instanceof Request ? input : new Request(input, init),
            ),
    });

    it("Should get 200 response - query", async () => {
        const res = await client.search.$get({
            query: {
                q: "foobar",
                tag: ["a", "b"],
            },
        });
        const json = await res.json();
        expect(json).toEqual({
            q: "foobar",
            tag: ["a", "b"],
        });
    });

    it("Should get 200 response - header", async () => {
        const headers = {
            "x-message-id": "Hello",
        };
        const res = await client.header.$get({
            headers,
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual(headers);
    });

    it("Should get 200 response - cookie", async () => {
        const cookie = {
            hello: "world",
        };
        const res = await client.cookie.$get({
            cookie,
        });

        expect(res.status).toBe(200);
        const data = await res.json()
        expect(data).toEqual(cookie);
    });
});
