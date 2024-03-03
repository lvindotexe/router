import { assertEquals } from "https://deno.land/std@0.210.0/assert/assert_equals.ts";
import { assertExists } from "https://deno.land/std@0.210.0/assert/assert_exists.ts";
import z from "npm:zod";
import { Router } from "../src/router/index.ts";

Deno.test("GET Request", async () => {
	const app = new Router()
		.get("/hello", () => {
			return new Response("hello", {
				status: 200,
				statusText: "Router is OK",
			});
		})
		.get("/hello-with-shortcuts", () => {
			return new Response("<h1>Router!!!</h1>", {
				status: 201,
				headers: {
					"X-Custom": "custom-header",
					"Content-Type": "text/html",
				},
			});
		});

	let res = await app.request("hello");
	assertExists(res);
	assertEquals(res.status, 200);
	assertEquals(res.statusText, "Router is OK");
	assertEquals(await res.text(), "hello");

	res = await app.request("httphello");
	assertEquals(res.status, 404);

	res = await app.request("/hello");
	assertExists(res);
	assertEquals(res.status, 200);
	assertEquals(res.statusText, "Router is OK");
	assertEquals(await res.text(), "hello");

	res = await app.request("hello");
	assertExists(res);
	assertEquals(res.status, 200);
	assertEquals(res.statusText, "Router is OK");
	assertEquals(await res.text(), "hello");

	res = await app.request("hello-with-shortcuts");
	assertExists(res);
	assertEquals(res.status, 201);
	assertEquals(res.headers.get("X-Custom"), "custom-header");
	assertEquals(res.headers.get("Content-Type"), "text/html");
	assertEquals(await res.text(), "<h1>Router!!!</h1>");

	res = await app.request("http://localhost/");
	assertExists(res);
	assertEquals(res.status, 404);
});

Deno.test("Customization", async () => {
	const res = await new Router()
		.decorate({ hello: "world" })
		.get("/", (ctx) => new Response(`hello ${ctx.hello}`))
		.request("/");

	assertEquals(res.status, 200);
	assertEquals(await res.text(), "hello world");
});

Deno.test("Reinitialize Values Per Request", async () => {
	const app = new Router().state({ hello: () => new Map() }).get("/", (ctx) => {
		ctx.hello.set(crypto.randomUUID(), "value");
		return new Response(`${ctx.hello.size}`);
	});

	let count = 0;
	while (count < 10) {
		const res = await app.request("/");
		const text = await res.text();
		assertEquals(res.status, 200);
		assertEquals(text, "1");
		count++;
	}
});

Deno.test("Derive State from State and Decorators", async () => {
	const app = new Router()
		.state({ uuid: () => crypto.randomUUID() })
		.state({ world: () => "world" })
		.decorate({ hello: "hello" })
		.derive("pain", ({ hello, uuid }) => new Map().set(hello, uuid))
		.get("/", ({ pain, world }) => {
			const [[key, value]] = pain;
			return new Response(`${key} ${value} ${world}`);
		});
	const res = await app.request("/");
	const [key, uuid, world] = await res.text().then((r) => r.split(" "));
	assertEquals(res.status, 200);
	assertEquals(key, "hello");
	assertEquals(
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			uuid,
		),
		true,
	);
	assertEquals(world, "world");
});

Deno.test("Return Itself", async () => {
	const app = new Router();
	const app2 = app.get("/", () => new Response("get /"));
	assertExists(app2);

	const res = await app2.request("http://localhost/", { method: "GET" });
	assertExists(res);
	assertEquals(res.status, 200);
	assertEquals(await res.text(), "get /");
});

Deno.test("Accept Little Mutation", async () => {
	const app = new Router()
		.decorate({ hello: "world" })
		.get("/", () => new Response("root"))
		.register("/", (app) =>
			app.decorate({ world: "hello" }).get(
				"/sub",
				(ctx) =>
					new Response(
						JSON.stringify({
							world: ctx.world,
							hello: ctx.hello,
						}),
					),
			));

	let res = await app.request("/");
	assertEquals(res.status, 200);
	assertEquals(await res.text(), "root");

	res = await app.request("/sub");
	assertEquals(res.status, 200);
	assertEquals(
		await res.text(),
		JSON.stringify({
			world: "hello",
			hello: "world",
		}),
	);
});

Deno.test("Nested Route", async () => {
	const app = new Router();
	const book = new Router()
		.get("/", () => new Response("get /book"))
		.post("/", () => new Response("post /book"));
	const user = new Router()
		.get("/", () => new Response("user"))
		.get("/login", () => new Response("logged in"))
		.post("/register", () => new Response("registered"));

	app
		.register("/book", book)
		.register("/user", user)
		.get(
			"/add-path-after-route-call",
			() => new Response("get /add-path-after-route-call"),
		);

	let res = await app.request("http://localhost/book", { method: "GET" });
	assertEquals(res.status, 200);
	assertEquals(await res.text(), "get /book");

	res = await app.request("http://localhost/book", { method: "POST" });
	assertEquals(res.status, 200);
	assertEquals(await res.text(), "post /book");

	res = await app.request("http://localhost/book/", { method: "GET" });
	assertEquals(res.status, 200);

	res = await app.request("http://localhost/user/login", { method: "GET" });
	assertEquals(res.status, 200);
	assertEquals(await res.text(), "logged in");

	res = await app.request("http://localhost/user/register", { method: "POST" });
	assertEquals(res.status, 200);
	assertEquals(await res.text(), "registered");

	res = await app.request("http://localhost/add-path-after-route-call", {
		method: "GET",
	});
	assertEquals(res.status, 200);
	assertEquals(await res.text(), "get /add-path-after-route-call");
});

Deno.test("Registers SubRoutes", async () => {
	const app = new Router()
		.register("/", () =>
			new Router()
				.decorate({ config: { hello: "world", age: 12 } })
				.use((ctx, next) => {
					ctx.config.age = 22;
					return next();
				})
				.get("/", (ctx) => new Response(`get ${ctx.config.age} /`)))
		.get("/api/start", () => new Response("get /api/start"));

	let res = await app.request("/");
	assertEquals(res.status, 200);
	assertEquals(await res.text(), "get 22 /");

	res = await app.request("/api/start");
	assertEquals(res.status, 200);
	assertEquals(await res.text(), "get /api/start");
});

Deno.test("Decorating the Context", async () => {
	const app = new Router()
		.decorate({ hello: "world", count: 1 })
		.get("/", ({ hello }) => new Response(`hello ${hello}`))
		.post("/increment", (ctx) => {
			ctx.count++;
			return new Response(`${ctx.count}`);
		});

	const res = await app.request("/");
	assertEquals(res.status, 200);
	assertEquals(await res.text(), "hello world");
});

Deno.test("Chaining Middleware", async () => {
	const app = new Router().decorate({ count: 1 }).get(
		"/",
		(ctx, next) => {
			ctx.count++;
			return next();
		},
		(ctx, next) => {
			ctx.count++;
			return next();
		},
		(ctx) => {
			return new Response(`${ctx.count}`);
		},
	);

	const res = await app.request("/");
	const text = await res.text();
	assertEquals(text, "3");
});

Deno.test.only("Guard Validation", async () => {
	let counter = 0;
	const app = await new Router()
		.guard({ json: z.object({ msisdn: z.string() }) })
		.post("/", ({ json }) => {
			return new Response(`msisdn: ${json.msisdn} sent`, { status: 200 });
		})
		.post(
			"/other",
			(_, next) => {
				counter++;
				return next();
			},
			(_, next) => {
				counter++;
				return next();
			},
			({ json }) => new Response(`msisdn: ${(json.msisdn)} ${json.name}`),
			{ json: z.object({ name: z.string() }) },
		);

	let res = await app.request("/", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ msisdn: "1234567890" }),
	});
	let text = await res.text();
	assertEquals(res.status, 200);
	assertEquals(text, "msisdn: 1234567890 sent");

	res = await app.request("/other", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name: "marcus", msisdn: "1234567890" }),
	});

	text = await res.text();
	assertEquals(text, "msisdn: 1234567890 marcus");
	assertEquals(counter, 2);
});

Deno.test("Composable Guards", async () => {
	const res = await new Router()
		.guard({ json: z.object({ msisdn: z.string() }) })
		.guard({ json: z.object({ country: z.string() }) })
		.post("/", ({ json }) => {
			return new Response(`msisdn: ${json.msisdn} sent from ${json.country}`, {
				status: 200,
			});
		})
		.request("/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ msisdn: "1234567890", country: "brazil" }),
		});

	assertEquals(res.status, 200);
	assertEquals(await res.text(), "msisdn: 1234567890 sent from brazil");
});

Deno.test("Isolated Guards", async () => {
	const app = new Router()
		.register("/greet", (app) =>
			app
				.guard({ json: z.object({ name: z.string() }) })
				.post("/", ({ json }) => new Response(`hello ${json.name}`)))
		.register(
			"/hello",
			new Router().get("/", () => new Response("hello world")),
		)
		.get("/", () => new Response("hello from root"));

	let res = await app.request("/");
	assertEquals(await res.text(), "hello from root");

	res = await app.request("/hello");
	assertEquals(await res.text(), "hello world");

	res = await app.request("/greet", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name: "moto" }),
	});
	assertEquals(await res.text(), "hello moto");
});
