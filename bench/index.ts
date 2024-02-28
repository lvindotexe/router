import { Hono } from "npm:hono";
import { zValidator } from "npm:@hono/zod-validator";
import { z } from "npm:zod";
import { Router } from "../src/router/index.ts";

//Micro benchmakrs and the lies we tell ourselves

const handlerValidation = new Router()
  .register("/", (app) =>
    app.post("/", ({ json }) => new Response(`hi your name is ${json.name}`), {
      json: z.object({ name: z.string() }),
    })
  )
  .build();

const handler = new Router()
  .post(
    "/",
    async ({ request }) =>
      new Response(`hi your name is ${(await request.json()).name}`)
  )
  .build();

const simple = async (req: Request) => {
  const { name } = (await req.json()) as { name: string };
  return new Response(`hi your name is ${name}`);
};

const honoValidation = new Hono().post(
  "/",
  zValidator("query", z.object({ name: z.string() }), (res) => {
    if (!res.success) return new Response("bad params", { status: 400 });
  }),
  (c) => {
    const body = c.req.valid("query");
    return c.text(`hi your name is ${body.name}`);
  }
).fetch;

const honoHandler = new Hono().post(
  "/",
  async ({ req }) => new Response(`hi your name is ${(await req.json()).name}`)
).fetch;

Deno.bench({
  name: "handler",
  group: "routers",
  baseline: true,
  fn: async (b) => {
    const request = new Request("http://localhost:8000/?name=mark", {
      method: "POST",
      body: JSON.stringify({ name: "mark" }),
      headers: {
        "content-type": "application/json",
      },
    });

    b.start();
    await handler({ request });
    b.end;
  },
});

Deno.bench({
  name: "handler with validation",
  group: "routers",
  baseline: true,
  fn: async (b) => {
    const request = new Request("http://localhost:8000/?name=mark", {
      method: "POST",
      body: JSON.stringify({ name: "mark" }),
      headers: {
        "content-type": "application/json",
      },
    });

    b.start();
    await handlerValidation({ request });
    b.end();
  },
});

Deno.bench({
  name: "hono validation",
  group: "routers",
  baseline: true,
  fn: async (b) => {
    const request = new Request("http://localhost:8000/?name=mark", {
      method: "POST",
      body: JSON.stringify({ name: "mark" }),
      headers: {
        "content-type": "application/json",
      },
    });

    b.start();
    await honoValidation(request);
    b.end();
  },
});

Deno.bench({
  name: "hono",
  group: "routers",
  fn: async (b) => {
    const request = new Request("http://localhost:8000/?name=mark", {
      method: "POST",
      body: JSON.stringify({ name: "mark" }),
      headers: {
        "content-type": "application/json",
      },
    });

    b.start();
    await honoHandler(request);
    b.end();
  },
});
