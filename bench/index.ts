import { Hono } from "npm:hono";
import { zValidator } from "npm:@hono/zod-validator";
import { z } from "npm:zod";
import { Router } from "../src/router/index.ts";

//Micro benchmakrs and the lies we tell ourselves

const handler = new Router()
	.decorate({ hello: "world" })
	.state("count", () => 2)
	.derive("message", ({ hello, count }) => hello.repeat(count))
	.guard({ params: z.object({ name: z.string() }) })
	.get("/hello", () => new Response("world"))
	.register(
		"/",
		(app) => app.post("/", ({ params }) => new Response(`hi your name is ${params.name}`)),
	)
	.build();

const honoHandler = new Hono()
	.post(
		"/",
		zValidator("query", z.object({ name: z.string() }), (res) => {
			if (!res.success) return new Response("bad params", { status: 400 });
		}),
		(c) => {
			const body = c.req.valid("query");
			return c.text(`hi your name is ${body.name}`);
		},
	).fetch;

const request = new Request("http://localhost:8000/?name=mark", {
	method: "POST",
	body: JSON.stringify({ name: "mark" }),
	headers: {
		"content-type": "application/json",
	},
});

Deno.bench({
	name: "router",
	group: "routers",
	baseline: true,
	fn: async () => {
		await handler({ request });
	},
});

Deno.bench({
	name: "hono",
	group: "routers",
	fn: async () => {
		await honoHandler(request);
	},
});
