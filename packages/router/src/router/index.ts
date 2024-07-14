// deno-lint-ignore-file no-explicit-any no-array-constructor ban-types
import { Node } from "./node.js";
import { _Context, type Context } from "./context.js";
import {
  Handler,
  HandlerInterface,
  InferValidators,
  MergePath,
  MergeSchemaPath,
  Methods,
  Next,
  Prettify,
  Schema,
  ValidationSchema,
} from "../types/index.js";
import z from "zod";
import { RouterRequest } from "./request.js";
import { errorHandler, HTTPError } from "./err.js";
import { parse } from "cookie";

export type{ Handler,ValidationSchema,Context}
export {errorHandler,HTTPError}

type RouterOptions = {
  basePath?: string;
  notFoundHandler: () => Response;
};

function notFoundHandler(): Response {
  return new Response("404 not found", { status: 404 });
  "request";
}

export class Router<
  D extends Record<string, unknown> = {},
  S extends Schema = {},
  BasePath extends string = "/",
  V extends ValidationSchema = {},
> {
  #root: Node;
  #schema: ValidationSchema;
  #initialisers: Array<[string, () => unknown]>;
  #derivations: Array<[string, (ctx: Context<D, V>) => unknown]>;
  size: number;
  #middleware: Array<Handler>;
  #notFoundHandler: RouterOptions["notFoundHandler"];

  constructor(options: RouterOptions = {
    basePath: "/",
    notFoundHandler,
  }) {
    this.size = 0;
    this.#root = new Node(this);
    this.#schema = {} as ValidationSchema;
    this.#initialisers = new Array();
    this.#derivations = new Array();
    this.#middleware = new Array();
    this.#notFoundHandler = options.notFoundHandler;
  }

  #insert(
    path: string,
    schema: ValidationSchema | undefined,
    arg: Methods | Node,
    ...handlers: Array<Handler>
  ): void {
    this.#root.add(path, schema, arg, ...handlers);
  }

  //From https://github.com/withastro/astro/blob/d90714fc3dd7c3eab0a6b29319b0b666bb04b678/packages/astro/src/core/middleware/sequence.ts#L8
  #sequence(
    handlers: Array<Handler>,
    ctx: Context<D, V>,
    next: Next,
  ): Response | Promise<Response> {
    const length = handlers.length;
    if (!length) return next();
    // @ts-expect-error pain
    // SAFETY: Usually `next` always returns something in user land, but in `sequence` we are actually
    // doing a loop over all the `next` functions, and eventually we call the last `next` that returns the `Response`.
    function applyHandle(i: number, handleContext: _Context<V>) {
      const handle = handlers[i];
      return handle(handleContext, async () => {
        if (i < length - 1) return applyHandle(i + 1, handleContext);
        else return next();
      });
    }
    try {
      return applyHandle(0, ctx);
    } catch (error) {
      if (error instanceof HTTPError) return errorHandler(error);
      return errorHandler(
        new Error("unknown error occured", { cause: error }),
      );
    }
  }

  async #dispatch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    const node = this.#root.find(path);
    if (!node) return this.#notFoundHandler();
    const { router } = node;
    const schema = node.schema
      ? mergeSchema(this.#schema, node.schema)
      : this.#schema;
    const req = new RouterRequest(request);
    try {
      const result = await validateRequest(req, schema);
      if (result instanceof Error) return errorHandler(result);
      const ctx = new _Context(req, { validationCache: result }) as Context<
        D,
        V
      >;
      if (this.#initialisers.length) {
        //@ts-expect-error
        for (const [k, v] of this.#initialisers) ctx[k] = v();
      }
      if (this.#derivations.length) {
        //@ts-expect-error
        for (const [k, v] of this.#derivations) ctx[k] = v(ctx);
      }
      const handlers = node?.isEnd
        ? node.handlers.get(ctx.req.method.toLowerCase() as Methods)
        : undefined;
      const response = this.#sequence(router.#middleware, ctx, () => {
        if (handlers && handlers.length > 0) {
          return this.#sequence(
            handlers,
            ctx,
            () => new Response("hello world"),
          );
        } else return this.#notFoundHandler();
      });
      if (!response) {
        throw new Error("does your middleware return a response object? ");
      }
      return response;
    } catch (error) {
      return errorHandler(
        error instanceof Error
          ? error
          : new Error("unknown error occured", { cause: error }),
      );
    }
  }

  #clone(): Router<D, S, BasePath, V> {
    const router = new Router<D, S, BasePath, V>();

    router.#schema = { ...this.#schema };
    router.#initialisers = [...this.#initialisers];
    router.#derivations = [...this.#derivations];
    router.#middleware = [...this.#middleware];

    return router;
  }

  register<
    TSubPath extends string,
    TSubD extends Record<string, unknown>,
    TSubBasePath extends string,
    TSubSchema extends Schema,
    TSubVal extends ValidationSchema
  >(
    path: TSubPath,
    app: (app: Router<D, S, TSubPath, V>) => Router<TSubD,TSubSchema,TSubBasePath,TSubVal>,
  ): Router<D, MergeSchemaPath<TSubSchema,MergePath<BasePath,TSubPath>> & S, BasePath, V> {
    const clone = app(this.#clone());
    for (const { node, path: nodePath } of clone.#root) {
      this.#insert(
        `${path}/${nodePath}`.replaceAll(/\/+/g, "/"),
        undefined,
        node,
      );
    }
    return this;
  }

  decorate<const K extends string, V>(
    key: K,
    value: V,
  ): Router<Prettify<D & { [P in K]: V }>, S, BasePath>;
  decorate<T extends Record<string, unknown>>(
    decorators: T,
  ): Router<Prettify<D & T>>;
  decorate<
    const K extends string,
    const V,
    const T extends Record<string, unknown>,
  >(
    arg: K | T,
    value?: V,
  ): Router<Prettify<D & (T | { [P in K]: P })>, S, BasePath> {
    if (typeof arg === "object") {
      for (const [k, v] of Object.entries(arg)) {
        //@ts-expect-error
        _Context.prototype[k] = v;
      }
      return this as any;
    }
    //@ts-expect-error
    _Context.prototype[arg] = value;
    return this as any;
  }

  state<const T extends Record<string, () => unknown>>(
    store: T,
  ): Router<D & { [p in keyof T]: ReturnType<T[p]> }>;
  state<const K extends string, I extends (ctx: Context<D>) => any>(
    key: K,
    initialiser: I,
  ): Router<D & { [P in K]: ReturnType<I> }>;
  state<
    const K extends string,
    const I extends () => any,
    const T extends Record<string, () => unknown>,
  >(
    arg: K | T,
    initialiser?: I,
  ): Router<
    & D
    & ({ [P in keyof T]: ReturnType<T[P]> } | { [P in K]: ReturnType<I> })
  > {
    if (typeof arg === "object") {
      for (const [k, v] of Object.entries(arg)) this.#initialisers.push([k, v]);
      return this as any;
    } else if (typeof arg === "string" && initialiser) {
      this.#initialisers.push([arg, initialiser]);
      return this as any;
    } else throw new Error("incompatiable arguments");
  }

  derive<K extends string, C extends (ctx: Context<D, V>) => any>(
    key: K,
    deriver: C,
  ): Router<C & { [P in K]: ReturnType<C> }> {
    this.#derivations.push([key, deriver]);
    return this as any;
  }

  guard<T extends ValidationSchema>(
    schema: T,
  ): Router<D, S, BasePath, T & V> {
    for (
      const [k, s] of Object.entries(schema) as Array<
        [keyof ValidationSchema, z.ZodTypeAny]
      >
    ) {
      const parentSchema = this.#schema[k];
      if (parentSchema) parentSchema.and(s);
      this.#schema[k] = s;
    }
    return this as any;
  }

  request(
    input: RequestInfo | URL,
    requesstInit?: RequestInit,
  ): Promise<Response> {
    if (input instanceof Request) return this.#dispatch(input);
    input = input.toString();
    const path = /^https?:\/\//.test(input)
      ? input
      : `http://localhost/${input.split("/").filter(Boolean).join("/")}`;
    const req = new Request(path, requesstInit);
    return this.#dispatch(req);
  }

  use(...handlers: Array<Handler<D>>): Router<D, S, BasePath, V> {
    this.#middleware.push(...handlers);
    return this;
  }

  get: HandlerInterface<D, "get", S, BasePath, V> = (path, ...arg) => {
    const last = arg.pop()!;
    if (typeof last === "object") {
      this.#insert(
        path,
        last,
        "get",
        ...(arg as Array<Handler<D>>),
      );
      return this;
    } else if (typeof last === "function") {
      this.#insert(
        path,
        undefined,
        "get",
        ...(arg.concat(last) as Array<Handler<D>>),
      );
    }
    return this as any;
  };

  post: HandlerInterface<D, "post", S, BasePath, V> = (path, ...arg) => {
    const last = arg.pop()!;
    if (typeof last === "object") {
      this.#insert(
        path,
        last,
        "post",
        ...(arg as Array<Handler<D>>),
      );
      return this;
    } else if (typeof last === "function") {
      this.#insert(
        path,
        undefined,
        "post",
        ...(arg.concat(last) as Array<Handler<D>>),
      );
    }
    return this as any;
  };
}

async function validateRequest<V extends ValidationSchema>(
  request: RouterRequest,
  guard: V,
): Promise<InferValidators<V> | Error> {
  const value = {} as InferValidators<V>;
  const cType = request.header("content-type");
  for (
    const [key, schema] of Object.entries(guard) as Array<
      [keyof ValidationSchema, z.ZodTypeAny]
    >
  ) {
    if (key === "json") {
        if (!cType || !/application\/json\s*(;.*)?/i.test(cType)) {
        throw new HTTPError(400, {
          message: `Invalid http header, content type: ${String(cType)}`,
        });
      }
      try {
        const data = await request.json() as any;
        const result = schema.safeParse(data);
        if (result.success) {
          value[key] = result.data;
        } else {throw new HTTPError(400, {
            message: result.error?.message,
          });}
      } catch (error) {
        if (error instanceof Error) throw error;
        throw new HTTPError(400, {
          message: "malformed JSON in request body",
        });
      }
    }
    if (key === "query") {
      const data = [...new URLSearchParams(new URL(request.url).search)].reduce(
        (acc, [k, v]) => {
          if (k in acc) {
            const temp = acc[k];
            if (Array.isArray(temp)) temp.push(v);
            else acc[k] = [temp, v];
            return acc;
          }
          acc[k] = v;
          return acc;
        },
        {} as Record<string, string | Array<string>>,
      ) as any;

      const result = schema.safeParse(data);
      if (result.success) {
        value[key] = result.data;
      } else throw new HTTPError(400, { message: result.error?.message });
    }
    if (key === "headers") {
      const data = Object.fromEntries(request.raw.headers) as any;
      const result = schema.safeParse(data);
      if (result.success) {
        value[key] = data;
      } else throw new HTTPError(400, { message: result.error?.message });
    }
    if (key === "cookie") {
      const cookie = request.raw.headers.get("Cookie");
      if (!cookie) {
        throw new HTTPError(400, {
          message: "Invalid headers, cookie not set",
        });
      }
      const data = parse(cookie) as any;
      const result = schema.safeParse(data);
      if (result.success) {
        value[key] = result.data;
      } else throw new HTTPError(400, { message: result.error?.message });
    }
  }
  return value;
}

function mergeSchema(
  ...schemas: Array<ValidationSchema>
): ValidationSchema {
  const acc: ValidationSchema = {};
  for (const schema of schemas) {
    for (
      const [k, s] of Object.entries(schema) as Array<
        [keyof ValidationSchema, z.ZodTypeAny]
      >
    ) {
      acc[k] = acc[k] ? z.intersection(acc[k]!, s) : s;
    }
  }
  return acc;
}
