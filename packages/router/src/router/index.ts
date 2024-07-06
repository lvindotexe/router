// deno-lint-ignore-file no-explicit-any no-array-constructor ban-types
import { Node } from "./node.js";
import { _Context, type Context } from "./context.js";
import {
  Handler,
  HandlerInterface,
  InferValidators,
  Methods,
  Next,
  Prettify,
  Schema,
  ValidationSchema,
} from "../types/index.js";
import z from "zod";
import { RouterRequest } from "./request.js";
import { errorHandler } from "./err.js";

type RouterOptions = {
  basePath?:string
  notFoundHandler: () => Response;
};

function notFoundHandler(): Response {
  return new Response("404 not found", { status: 404 });
}

/*
 * handles the routing
 *
 * @template Decorators - context decorators
 * @template Schema - schema
 * @template BasePath - the router base path
 */
export class Router<
  D extends Record<string, unknown> = Record<string, unknown>,
  S extends Schema = {},
  P extends string = "/",
> {
  #root: Node;
  #schema: ValidationSchema;
  #decorators: D;
  #initialisers: Array<[string, () => any]>;
  #derivations: Array<[string, (ctx: any) => any]>;
  size: number;
  #middleware: Array<Handler>;
  #notFoundHandler: RouterOptions["notFoundHandler"];

  constructor(options: RouterOptions = {
    basePath:'/',
    notFoundHandler,
  }) {
    this.size = 0;
    this.#root = new Node(this);
    this.#schema = {} as ValidationSchema;
    this.#decorators = {} as D;
    this.#initialisers = new Array();
    this.#derivations = new Array();
    this.#middleware = new Array();
    this.#notFoundHandler = options.notFoundHandler
  }

  #insert(
    path: string,
    schema: Partial<ValidationSchema> | undefined,
    arg: Methods | Node,
    ...handlers: Array<Handler>
  ): void {
    this.#root.add(path, schema, arg, ...handlers);
  }

  //From https://github.com/withastro/astro/blob/d90714fc3dd7c3eab0a6b29319b0b666bb04b678/packages/astro/src/core/middleware/sequence.ts#L8
  #sequence(
    handlers: Array<Handler>,
    ctx: Context<D>,
    next: Next,
  ): Response | Promise<Response> {
    const length = handlers.length;
    if (!length) return next();
    // @ts-expect-error pain
    // SAFETY: Usually `next` always returns something in user land, but in `sequence` we are actually
    // doing a loop over all the `next` functions, and eventually we call the last `next` that returns the `Response`.
    function applyHandle(i: number, handleContext: _Context<D>) {
      const handle = handlers[i];
      // deno-lint-ignore require-await
      return handle(handleContext, async () => {
        if (i < length - 1) return applyHandle(i + 1, handleContext);
        else return next();
      });
    }
    return applyHandle(0, ctx);
  }

  async #dispatch(request: Request): Promise<Response> {
    const ctx = new _Context(request);
    const path = new URL(request.url).pathname;
    const node = this.#root.find(path);
    if (!node) return this.#notFoundHandler();
    const { router, schema } = node;
    const result = schema
      ? await validateRequest(ctx.req, mergeSchema(this.#schema, schema))
      : undefined;
    if(result instanceof Error) return errorHandler(result)
    if(result) Object.assign(_Context.prototype,result)
    const handlers = node?.isEnd
      ? node.handlers.get(ctx.req.method.toLowerCase() as Methods)
      : undefined;
    //@ts-expect-error idk
    const response = this.#sequence(router.#middleware, ctx as _Context, () => {
      if (handlers && handlers.length > 0) {
        return this.#sequence(
          handlers,
          ctx as Context<D>,
          () => new Response("hello world"),
        );
      } else return this.#notFoundHandler();
    });
    if (!response) {
      throw new Error("does your middleware return a response object? ");
    }
    return response;
  }

  #clone(): Router<D> {
    const router = new Router<D>();

    router.#schema = { ...this.#schema };
    router.#decorators = { ...this.#decorators };
    router.#initialisers = [...this.#initialisers];
    router.#derivations = [...this.#derivations];
    router.#middleware = [...this.#middleware];

    return router;
  }

  decorate<const K extends string, V>(
    key: K,
    value: V,
  ): Router<Prettify<D & { [P in K]: V }>>;
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
  ): Router<Prettify<D & (T | { [P in K]: P })>> {
    if (typeof arg === "object") {
      this.#decorators = { ...this.#decorators, ...arg };
      Object.assign(_Context.prototype, this.#decorators);
      return this as Router<Prettify<D & T>>;
    }
    //@ts-expect-error
    _Context.prototype[arg] = value;
    return this as Router<Prettify<D & T>>;
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

  derive<K extends string, C extends (ctx: Context<D>) => any>(
    key: K,
    deriver: C,
  ): Router<C & { [P in K]: ReturnType<C> }> {
    this.#derivations.push([key, deriver]);
    return this as any;
  }

  guard<T extends Partial<ValidationSchema>>(
    schema: T,
  ): Router<Prettify<D & InferValidators<T>>> {
    for (const [k, s] of Object.entries(schema)) {
      if (this.#schema[k as keyof ValidationSchema]) {
        this.#schema[k as keyof ValidationSchema] = this
          .#schema[k as keyof ValidationSchema].and(
            s,
          );
      } else this.#schema[k as keyof ValidationSchema] = s;
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
    return this.#dispatch(new Request(path, requesstInit));
  }

  register<P extends string>(
    path: P,
    app: (app: Router<D>) => Router<D>,
  ): Router<D>;
  register(path: string, app: Router): Router<D>;
  register<P extends string>(
    path: P,
    arg: Router | ((app: Router<D>) => Router<D>),
  ): Router<D> {
    const clone = arg instanceof Router ? arg : arg(this.#clone());
    for (const { node, path: nodePath } of clone.#root) {
      this.#insert(
        `${path}/${nodePath}`.replaceAll(/\/+/g, "/"),
        undefined,
        node,
      );
    }
    return this;
  }

  use(...handlers: Array<Handler<D>>): Router<D> {
    this.#middleware.push(...handlers);
    return this;
  }

  get: HandlerInterface<D, "get", S, P> = (path, ...arg) => {
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

  post: HandlerInterface<D, "get", S, P> = (path, ...arg) => {
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

function parseJSONString(string: string, ctx: z.RefinementCtx): unknown {
  try {
    return JSON.parse(string);
  } catch (_) {
    ctx.addIssue({ code: "custom", message: "unable to parse json" });
    return z.NEVER;
  }
}

async function validateRequest(
  request: RouterRequest,
  guard: Partial<ValidationSchema>,
): Promise<Record<string, unknown> | Error> {
  const result = {} as Record<keyof ValidationSchema, unknown>;
  for (const [k, schema] of Object.entries(guard)) {
    if (k === "json") {
      const validContentType = !![...request.raw.headers]
        .find(
          ([k, v]) =>
            k.toLowerCase().startsWith("content-type") &&
            v.toLowerCase().startsWith("application/json"),
        )?.[1]
        ?.toLowerCase() ?? "";
      if (!validContentType) {
        return new Error("unsupported content type");
      }
      const bodyResult = z
        .string()
        .transform(parseJSONString)
        .pipe(schema)
        .safeParse(await request.text());
      if (bodyResult.success) {
        result.json = bodyResult.data;
      } else return bodyResult.error;
    }
    if (k === "query") {
      const queryResult = schema.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
      if (queryResult.success) result.query = queryResult.data;
      else return queryResult.error;
    }
  }
  return result;
}

function mergeSchema(
  ...schemas: Array<Partial<ValidationSchema>>
): Partial<ValidationSchema> {
  const acc: Partial<ValidationSchema> = {};
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

const router = new Router()
  .decorate("hello", "world")
  .get("/", ({ hello }) => new Response(hello))
  .get("/other", () => new Response("other"))
  .post("/post", (c) => c.json({hello:'world'},{status:201}), {
    json: z.object({ uuid: z.string() }),
  });
