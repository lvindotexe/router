import { Router } from "./src/router/index.ts";

const app = new Router()
	.get("/", async (_, next) => {
		return await new Promise((res) => {
			setTimeout(() => {
				res(new Response("hello world"));
				next();
			}, 3000);
		});
	}, (_, next) => {
		console.log("middleware ran");
		return next();
	});

await app.request('/')