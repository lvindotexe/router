// deno-lint-ignore-file no-explicit-any no-array-constructor ban-types
import z from "npm:zod";
import { Node } from "./node.ts";
import { errorHandler } from "./err.ts";
import {
  Context,
  Handler,
  InferValidators,
  Methods,
  Next,
  ValidationSchema,
} from "./types.ts";
import { createContext } from "./contex.ts";
import { HandlerInterface } from "./types.ts";

type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

function NotFoundHandler(): Response {
  return new Response("404 not found", { status: 404 });
}

function defineDynamciClass(): {
  new <D extends Record<string, unknown>>(): {
    [M in Lowercase<Methods>]: HandlerInterface<D>;
  };
} {
  return class {} as never;
}

export class Router<
  Decorators extends Record<string, unknown> = Record<string, unknown>
> extends defineDynamciClass()<Decorators> {
  #root: Node;
  #schema: ValidationSchema;
  #decorators: Decorators;
  #initialisers: Array<[string, () => any]>;
  #derivations: Array<[string, (ctx: any) => any]>;
  size: number;
  #middleware: Array<Handler>;

  constructor() {
    super();
    this.size = 0;
    this.#root = new Node(this);
    this.#schema = {} as ValidationSchema;
    this.#decorators = {} as Decorators;
    this.#initialisers = new Array();
    this.#derivations = new Array();
    this.#middleware = new Array();

    for (const method of Methods) {
      this[method] = (
        path: string,
        ...arg:
          | [...Array<Handler<Decorators>>, Handler<Decorators>]
          | [...Array<Handler<Decorators>>, Partial<ValidationSchema>]
      ): Router<Decorators> => {
        const last = arg.pop()!;
        if (typeof last === "object") {
          this.#insert(
            path,
            last,
            method,
            ...(arg as Array<Handler<Decorators>>)
          );
          return this;
        } else if (typeof last === "function") {
          this.#insert(
            path,
            undefined,
            method,
            ...(arg.concat(last) as Array<Handler<Decorators>>)
          );
        }
        return this as any;
      };
    }
  }

  #find(path: string): Node | null {
    return this.#root.find(path);
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
    ctx: Context<Decorators>,
    next: Next
  ): Response | Promise<Response> {
    const length = handlers.length;
    if (!length) return next();
    // @ts-expect-error pain
    // SAFETY: Usually `next` always returns something in user land, but in `sequence` we are actually
    // doing a loop over all the `next` functions, and eventually we call the last `next` that returns the `Response`.
    function applyHandle(i: number, handleContext: Context<Decorators>) {
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
    const result = await this.build()(
      createContext(request),
      //@ts-expect-error //TODO
      () => {}
    );
    if (!result) return new Response("404 route not found", { status: 404 });
    if (!result) {
      throw new Error("does your middleware return a response object? ");
    } else return result as Response;
  }

  #clone(): Router<Decorators> {
    const router = new Router<Decorators>();

    router.#schema = { ...this.#schema };
    router.#decorators = { ...this.#decorators };
    router.#initialisers = [...this.#initialisers];
    router.#derivations = [...this.#derivations];
    router.#middleware = [...this.#middleware];

    return router;
  }

  decorate<const K extends string, V>(
    key: K,
    value: V
  ): Router<Prettify<Decorators & { [P in K]: V }>>;
  decorate<T extends Record<string, unknown>>(
    decorators: T
  ): Router<Prettify<Decorators & T>>;
  decorate<
    const K extends string,
    const V,
    const T extends Record<string, unknown>
  >(
    arg: K | T,
    value?: V
  ): Router<Prettify<Decorators & (T | { [P in K]: P })>> {
    if (typeof arg === "object") {
      this.#decorators = { ...this.#decorators, ...arg };
      return this as Router<Prettify<Decorators & T>>;
    }
    this.#decorators = { ...this.#decorators, [arg]: value };
    return this as Router<Prettify<Decorators & T>>;
  }

  state<const T extends Record<string, () => unknown>>(
    store: T
  ): Router<Decorators & { [p in keyof T]: ReturnType<T[p]> }>;
  state<const K extends string, I extends (ctx: Context<Decorators>) => any>(
    key: K,
    initialiser: I
  ): Router<Decorators & { [P in K]: ReturnType<I> }>;
  state<
    const K extends string,
    const I extends () => any,
    const T extends Record<string, () => unknown>
  >(
    arg: K | T,
    initialiser?: I
  ): Router<
    Decorators &
      ({ [P in keyof T]: ReturnType<T[P]> } | { [P in K]: ReturnType<I> })
  > {
    if (typeof arg === "object") {
      for (const [k, v] of Object.entries(arg)) this.#initialisers.push([k, v]);
      return this as any;
    } else if (typeof arg === "string" && initialiser) {
      this.#initialisers.push([arg, initialiser]);
      return this as any;
    } else throw new Error("incompatiable arguments");
  }

  derive<K extends string, D extends (ctx: Context<Decorators>) => any>(
    key: K,
    deriver: D
  ): Router<Decorators & { [P in K]: ReturnType<D> }> {
    this.#derivations.push([key, deriver]);
    return this as any;
  }

  guard<T extends Partial<ValidationSchema>>(
    schema: T
  ): Router<Prettify<Decorators & InferValidators<T>>> {
    for (const [k, s] of Object.entries(schema)) {
      if (this.#schema[k as keyof ValidationSchema]) {
        this.#schema[k as keyof ValidationSchema] =
          this.#schema[k as keyof ValidationSchema].and(s);
      } else this.#schema[k as keyof ValidationSchema] = s;
    }
    return this as any;
  }

  request(
    input: RequestInfo | URL,
    requesstInit?: RequestInit
  ): Promise<Response> {
    if (input instanceof Request) {
      if (requesstInit !== undefined) input = new Request(input, requesstInit);
      return this.#dispatch(input);
    }
    input = input.toString();
    const path = /^https?:\/\//.test(input)
      ? input
      : `http://localhost/${input.split("/").filter(Boolean).join("/")}`;
    return this.#dispatch(new Request(path, requesstInit));
  }

  register<P extends string>(
    path: P,
    app: (app: Router<Decorators>) => Router<Decorators>
  ): Router<Decorators>;
  register(path: string, app: Router): Router<Decorators>;
  register<P extends string>(
    path: string,
    arg: Router | ((app: Router<Decorators>) => Router<Decorators>)
  ): Router<Decorators> {
    const clone = arg instanceof Router ? arg : arg(this.#clone());
    for (const { node, path: nodePath } of clone.#root) {
      this.#insert(
        `${path}/${nodePath}`.replaceAll(/\/+/g, "/"),
        undefined,
        node
      );
    }
    return this;
  }

  build() {
    return async (ctx: { request: Request }, next?: Next) => {
      const path = new URL(ctx.request.url).pathname;
      const node = this.#find(path);
      if (!node) return next ? next() : NotFoundHandler();
      const router = node.router;
			const schema = node.schema ? mergeSchema(node.schema,this.#schema): node.router.#schema
      if (schema) {
        const valid = await validateRequest(ctx.request,schema);
        if (valid instanceof Error) return errorHandler(valid);
        //@ts-expect-error slutty mutation
        for (const [k, v] of Object.entries(valid)) ctx[k] = v;
      }
      //@ts-expect-error slutty mutation
      for (const [k, v] of Object.entries(router.#decorators)) ctx[k] = v;
      //@ts-expect-error slutty mutation
      ctx["forward"] = this.request.bind(this);
      if (router.#initialisers.length) {
        //@ts-expect-error slutty mutation
        for (const [k, i] of router.#initialisers) ctx[k] = i();
      }
      if (router.#derivations.length) {
        //@ts-expect-error slutty mutation
        for (const [k, i] of router.#derivations) ctx[k] = i(ctx);
      }
      const middleware = node.router.#middleware;
      const handlers = node?.isEnd
        ? node.handlers.get(ctx.request.method.toLowerCase() as Methods)
        : undefined;
      //@ts-expect-error idk
      return this.#sequence(middleware, ctx as Context, () => {
        if (handlers && handlers.length > 0) {
          return this.#sequence(
            handlers,
            ctx as Context<Decorators>,
            () => new Response()
          );
        } else return next ? next() : NotFoundHandler();
      });
    };
  }

  use(...handlers: Array<Handler<Decorators>>): Router<Decorators> {
    this.#middleware.push(...handlers);
    return this;
  }
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
  request: Request,
  guard: Partial<ValidationSchema>
): Promise<Record<string, unknown> | Error> {
  const result = {} as Record<keyof ValidationSchema, unknown>;
  for (const [k, schema] of Object.entries(guard)) {
    if (k === "json") {
      const validContentType =
        !![...request.headers]
          .find(
            ([k, v]) =>
              k.toLowerCase().startsWith("content-type") &&
              v.toLowerCase().startsWith("application/json")
          )?.[1]
          ?.toLowerCase() ?? "";
      if (!validContentType) {
        return new Error("unsupported content type");
      }
      const bodyResult = z
        .string()
        .transform(parseJSONString)
        .pipe(schema)
        .safeParse(await request.clone().text());
      if (bodyResult.success) {
        result.json = bodyResult.data;
      } else return bodyResult.error;
    }
    if (k === "query") {
      const queryResult = schema.safeParse(
        Object.fromEntries(new URL(request.url).searchParams)
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
	const acc:Partial<ValidationSchema> = {}
		for(const schema of schemas){
			for(const [k,s] of Object.entries(schema) as Array<[keyof ValidationSchema,z.ZodTypeAny]>){
				acc[k] = acc[k] ? z.intersection(acc[k]!,s) : s
			}
		}
		return acc
}