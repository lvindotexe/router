import z from "zod";
import { describe, expect, test } from "vitest";
import { Router } from "../src/router";
import { _Context } from "../src/router/context";
import { Handler } from "../src/types";
import { rc } from "../src/client";

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
		.register('/',(app) => app)
		.register("/", (app) =>
			app
				.decorate("world", "hello")
				.get("/sub", (c) => {
					const { hello, world } = c;
					return c.json({ hello, world });
				}));
	let res = await app.request("/");
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("root");

	res = await app.request("/sub");
	expect(res.status).toBe(200);
	expect(await res.json()).toEqual(
		{
			world: "hello",
			hello: "world",
		}
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
		.register("/book", () => book)
		.register("/user", () => user)
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
				.get('/',(c) => c.text('root'))
				.use((c, next) => {
					c.config.age = 22;
					return next();
				})
				.get("/sub", (c) => c.text(`get ${c.config.age} /`))
				.use((ctx, next) => {
					ctx.config.age = 22;
					return next();
				}))
		.get("/api/start", () => new Response("get /api/start"));

	const client = rc<typeof app>('http://127.0.0.1:8000',{
		fetch:(input,init) => app.request(input,init)
	})

	const res = await client.index.$get()
	expect(res.status).toBe(200);
	expect(await res.text()).toBe('root')

	const subRes = await client.sub.$get()
	expect(await subRes.text()).toBe("get 22 /");

	const apiRes = await client.api.start.$get()
	expect(res.status).toBe(200);
	expect(await apiRes.text()).toBe("get /api/start");
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

test("Guard Validation", async () => {
	let counter = 0;

	const iterate: Handler = (_, next) => {
		counter++;
		return next();
	};

	const app = new Router()
		.guard({ json: z.object({ hello: z.string() }) })
		.post("/", (c) => c.json(c.valid("json")))
		.post("/other", (c) => c.json(c.valid("json")), {
			json: z.object({ name: z.string() }),
		});
	
	const client = rc<typeof app>('http://127.0.0.1:8000',{
		fetch:(input,init) => app.request(input,init)
	})
	const res = await client.index.$post({
		json:{hello:'world'}
	})

	// expect(res.status).toBe(200);
	let json = await res.text() as unknown
	console.log({json})
	expect(json).toEqual({hello:'world'});
	
	const otherRes = await client.other.$post({
		json:{
			hello:'world',
			name:'marcus'
		}
	})

	json = await otherRes.json() as unknown
	expect(json).toEqual({
		hello:'world',
		name:'marcus'
	});
});

test("Composable Guards", async () => {
	const res = await new Router()
		.guard({ json: z.object({ name: z.string() }) })
		.guard({ json: z.object({ age: z.number() }) })
		.post("/", (c) => {
			const { name, age } = c.valid("json");
			return c.text(`name: ${name} age: ${age}`, { status: 201 });
		})
		.request("/", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "marcus", age:25 }),
		});

	expect(res.status).toBe(201);
	expect(await res.text()).toBe("name: marcus age: 25");
});

test("Isolated Guards", async () => {
	const app = new Router()
		.register("/greet", (app) =>
			app
				.guard({ json: z.object({ name: z.string() }) })
				.post("/", ({ json }) => new Response(`hello ${json.name}`)))
		.register(
			"/hello",
			() => new Router().get("/", () => new Response("hello world")),
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
