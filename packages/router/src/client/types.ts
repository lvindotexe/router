import z from 'zod'
import { Router } from "../router";
import { Endpoint, Schema } from "../types"

type RequiredKeysOf<BaseType extends object> = Exclude<
  {
    [Key in keyof BaseType]: BaseType extends Record<Key, BaseType[Key]> ? Key : never
  }[keyof BaseType],
  undefined
> 

 type HasRequiredKeys<BaseType extends object> = RequiredKeysOf<BaseType> extends never
  ? false
  : true

export type RouterClientOptions<T = unknown> = {
	init?: RequestInit;
	fetch?: typeof fetch;
} & (keyof T extends never
  ? {
      headers?:
        | Record<string, string>
        | (() => Record<string, string> | Promise<Record<string, string>>)
    }
  : {
      headers: T | (() => T | Promise<T>)
    })

export type ClientRequest<S extends Schema> = {
  [M in keyof S]: S[M] extends Endpoint & { input: infer R }
    ? R extends object
      ? HasRequiredKeys<R> extends true
        ? (args: R, options?: RouterClientOptions) => Promise<RouterClientOptions<S[M]>>
        : (args?: R, options?: RouterClientOptions) => Promise<RouterClientOptions<S[M]>>
      : never
    : never
}

type PathToChain<
  Path extends string,
  S extends Schema,
  Original extends string = Path
> = Path extends `/${infer P}`
  ? PathToChain<P, S, Path>
  : Path extends `${infer P}/${infer R}`
  ? { [K in P]: PathToChain<R, S, Original> }
  : {
      [K in Path extends '' ? 'index' : Path]: ClientRequest<
        S extends Record<string, unknown> ? S[Original] : never
      >
    }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Client<T> = T extends Router<any, infer S, any>
  ? S extends Record<infer K, Schema>
    ? K extends string
      ? PathToChain<K, S>
      : never
    : never
  : never


type Rient<T extends Router<any,any,any>>  = T extends Router<any,infer S,any> ? S : never

type pain = Client<typeof app>
type rain = Rient<typeof app>

  const app = new Router()
    .decorate("hello", "world")
    .get('/',(c) =>  c.text('hello world'))
    .post("/post", ({ hello, json: { uuid } }) => new Response(uuid), {
        json: z.object({ uuid: z.string() }),
    });
