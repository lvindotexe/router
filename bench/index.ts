import { Hono } from "npm:hono";
import { zValidator } from "npm:@hono/zod-validator";
import { z } from "npm:zod";
import { Router } from "../src/router/index.ts";

//Micro benchmakrs and the lies we tell ourselves

const handler = new Router()
	.guard({ query: z.object({ name: z.string() }) })
	.post("/", ({ query }) => new Response(`hi your name is ${query.name} ${query.surname}`),{query:z.object({surname:z.string()})})
	.build()



const honoHandler = new Hono()
	.post(
		"/",
		zValidator("query", z.object({ name: z.string(),surname:z.string() }), (res) => {
			if (!res.success) return new Response("bad params", { status: 400 });
		}),
		(c) => {
			const body = c.req.valid("query");
			return c.text(`hi your name is ${body.name}`);
		},
	).fetch;

const request = new Request("http://localhost:8000/?name=mark&surname=aurelius", {
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
