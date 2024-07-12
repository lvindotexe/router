import z from "zod";
import { describe, expect, test } from "vitest";
import { Router } from "../src/router";
import { _Context } from "../src/router/context";
import { Handler } from "../src/types";

test("GET Request", async () => {
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
	expect(res.status).toBe(200);
	expect(res.statusText).toBe("Router is OK");
	expect(await res.text()).toBe("hello");

	res = await app.request("httphello");
	expect(res.status).toBe(404);

	res = await app.request("/hello");
	expect(res).toBeDefined();
	expect(res.status).toBe(200);
	expect(res.statusText).toBe("Router is OK");
	expect(await res.text()).toBe("hello");

	res = await app.request("hello");
	expect(res).toBeDefined();
	expect(res.status).toBe(200);
	expect(res.statusText).toBe("Router is OK");
	expect(await res.text()).toBe("hello");

	res = await app.request("hello-with-shortcuts");
	expect(res).toBeDefined();
	expect(res.status).toBe(201);
	expect(res.headers.get("X-Custom")).toBe("custom-header");
	expect(res.headers.get("Content-Type")).toBe("text/html");
	expect(await res.text()).toBe("<h1>Router!!!</h1>");

	res = await app.request("http://localhost/");
	expect(res).toBeDefined();
	expect(res.status).toBe(404);
});

test("Customization", async () => {
	const res = await new Router()
		.decorate({ hello: "world" })
		.get("/", (ctx) => new Response(`hello ${ctx.hello}`))
		.request("/");

	expect(res.status).toBe(200);
	expect(await res.text()).toBe("hello world");
});

test("Reinitialize Values Per Request", async () => {
	const app = new Router().state({ hello: () => new Map() }).get(
		"/",
		(ctx) => {
			ctx.hello.set(crypto.randomUUID(), "value");
			return new Response(`${ctx.hello.size}`);
		},
	);

	let count = 0;
	while (count < 10) {
		const res = await app.request("/");
		const text = await res.text();
		expect(res.status).toBe(200);
		expect(text).toBe("1");
		count++;
	}
});

test("Derive State from State and Decorators", async () => {
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
	expect(res.status).toBe(200);
	expect(key).toBe("hello");
	expect(
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i
			.test(
				uuid,
			),
	).toBe(true);
	expect(world).toBe("world");
});

test("Return Itself", async () => {
	const app = new Router();
	const app2 = app.get("/", () => new Response("get /"));
	expect(app2).toBeDefined();

	const res = await app2.request("http://localhost/", { method: "GET" });
	expect(res).toBeDefined();
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("get /");
});

test("Accept Little Mutation", async () => {
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
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("root");

	res = await app.request("/sub");
	expect(res.status).toBe(200);
	expect(await res.text()).toBe(
		JSON.stringify({
			world: "hello",
			hello: "world",
		}),
	);
});

test("Nested Route", async () => {
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
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("get /book");

	res = await app.request("http://localhost/book", { method: "POST" });
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("post /book");

	res = await app.request("http://localhost/book/", { method: "GET" });
	expect(res.status).toBe(200);

	res = await app.request("http://localhost/user/login", { method: "GET" });
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("logged in");

	res = await app.request("http://localhost/user/register", {
		method: "POST",
	});
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("registered");

	res = await app.request("http://localhost/add-path-after-route-call", {
		method: "GET",
	});
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("get /add-path-after-route-call");
});

test("Registers SubRoutes", async () => {
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
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("get 22 /");

	res = await app.request("/api/start");
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("get /api/start");
});

test("Decorating the Context", async () => {
	const app = new Router()
		.decorate({ hello: "world", count: 1 })
		.get("/", ({ hello }) => new Response(`hello ${hello}`))
		.post("/increment", (ctx) => {
			ctx.count++;
			return new Response(`${ctx.count}`);
		});

	const res = await app.request("/");
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("hello world");
});

test("Chaining Middleware", async () => {
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
	expect(text).toBe("3");
});

test.only("Guard Validation", async () => {
	let counter = 0;

	const iterate:Handler = (_,next) => {
		counter++
		return next()
	} 

	const pain = new Router()
		.guard({json:z.object({hello:z.string()})})
		.post('/',(c) => c.json(c.valid('json')))
		.post('/other',(c) => c.json(c.valid('json')),{json:z.object({name:z.string()})})
	let res = await app.request("/", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ msisdn: "1234567890" }),
	});
	let text = await res.text();
	console.log({ text });
	expect(res.status).toBe(200);
	expect(text).toBe("msisdn: 1234567890 sent");

	res = await app.request("/other", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name: "marcus", msisdn: "1234567890" }),
	});

	text = await res.text();
	expect(text).toBe("msisdn: 1234567890 marcus");
	expect(counter).toBe(2);
});

test("Composable Guards", async () => {
	const res = await new Router()
		.guard({ json: z.object({ msisdn: z.string() }) })
		.guard({ json: z.object({ country: z.string() }) })
		.post("/", ({ json }) => {
			return new Response(
				`msisdn: ${json.msisdn} sent from ${json.country}`,
				{
					status: 200,
				},
			);
		})
		.request("/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ msisdn: "1234567890", country: "brazil" }),
		});

	expect(res.status).toBe(200);
	expect(await res.text()).toBe("msisdn: 1234567890 sent from brazil");
});

test("Isolated Guards", async () => {
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
	expect(await res.text()).toBe("hello from root");

	res = await app.request("/hello");
	expect(await res.text()).toBe("hello world");

	res = await app.request("/greet", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name: "moto" }),
	});
	expect(await res.text()).toBe("hello moto");
});

const schema = {
	json: z.object({ hello: z.string() }),
};
const app = new Router()
	.guard({json: z.object({ hello: z.string()})})
	.get("/", (c) => c.text(c.valid("json").hello),{json:z.object({other:z.string()})});
const ctx = new _Context<typeof schema>(new Request("/"));
const pain = ctx.text(ctx.valid("json").hello);
