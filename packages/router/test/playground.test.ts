import {  expect, test } from "vitest";
import { Router } from "../src/router";
import z from "zod";
import { rc } from "../src/client";

const app = new Router()
    .decorate("hello", "world")
    .get('/',(c) =>  c.text('hello world'))
    .post("/post", ({ hello, json: { uuid } }) => new Response(uuid), {
        json: z.object({ uuid: z.string() }),
    });

let res = await app.request(
    new Request("http://127.0.0.1:8000/post", {
        method: "post",
        headers:{
            ['content-type']:'application/json'
        },
        body: JSON.stringify({
            uuid: crypto.randomUUID(),
        }),
    }),
);
console.log({text:await res.text()});

res = await app.request(new Request('http://127.0.0.1:8000/'))
console.log({text:await res.text()});

const client = rc<typeof app>('http://127.0.0.1:8000')

client

test("hell", () => {
    expect(true).toBe(true);
});
