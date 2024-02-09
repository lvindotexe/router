import { z } from "npm:zod";
import { Router } from "../src/index.ts";

const handle = new Router()
	.guard({ json: z.object({ name: z.string() }) })
	.post("/", ({ json }) => new Response(`hello ${json.name}`))
	.register(
		"/other",
		(app) => app.post("/", ({ json }) => new Response(`hello ${json.name} from the other`)),
	)
	.register(
		"/forward",
		(app) => app.post("/", ({ forward, request }) => forward("/other", request)),
	)
	.build();

const options = {
	method: "POST",
	body: JSON.stringify({ name: "John" }),
	headers: {
		"content-type": "application/json",
	},
};

console.log(
	await handle({ request: new Request("http://localhost:8000/", options) }),
	await handle({ request: new Request("http://localhost:8000/other", options) }),
	await handle({ request: new Request("http://localhost:8000/forward", options) }),
);
