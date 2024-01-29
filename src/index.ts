// deno-lint-ignore-file
// deno-lint-ignore-file no-explicit-any
import z, { RefinementCtx, ZodError, ZodTypeAny, NEVER } from "npm:zod";
import { Context, createContext } from "./contex.ts";

type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

type Method = "POST" | "GET";

type SchemaKeys = "json" | "params";

export type Next = () => Promise<Response> | Response;

export type Handler<Decorators extends Record<string, unknown> = any> = (
  context: Context<Decorators>,
  next: Next
) => Response | Promise<Response>;

type NewState<K extends string, I extends (...args: any[]) => any> = Prettify<{
  [P in K]: ReturnType<I>;
}>;

function split(path: string): Array<string> {
  const parts = path.replace(/\/+$/, "").split("/");
  if (parts.length > 1 && parts[0] === "") parts.shift();
  return parts;
}

function NotFoundHandler(ctx: Context, next: Next): Response {
  return new Response("404 not found", { status: 404 });
}

function errorHandler(err: Error) {
  console.error(err);
  if (err instanceof HTTPError) {
    return err.getResponse();
  }
  return new Response("Internal Server Error", { status: 500 });
}

type HTTPErrorOptions = {
  res?: Response;
  message?: string;
};

export class HTTPError extends Error {
  readonly res?: Response;
  readonly status: number;
  constructor(status: number = 500, options?: HTTPErrorOptions) {
    super(options?.message);
    this.res = options?.res;
    this.status = status;
  }
  getResponse(): Response {
    if (this.res) {
      return this.res;
    }
    return new Response(this.message, {
      status: this.status,
    });
  }
}

class Node {
  children: Map<string, Node>;
  isEnd: boolean;
  handlers: Map<Method, Array<Handler>>;
  router: Router;

  constructor(router: Router) {
    this.children = new Map();
    this.isEnd = false;
    this.router = router;
    this.handlers = new Map();
  }

  find(path: string): Node | null {
    let node: Node = this;
    const parts = split(path);

    for (const part of parts) {
      const next = node.children.get(part);
      if (next) node = next;
      else return null;
    }
    return node;
  }

add(path: string, arg: Method | Node, ...handlers: Array<Handler>): void {
  let node: Node = this;
  const parts = split(path);
  const len = parts.length;
  
  for (const part of parts.slice(0, -1)) {
    let next = node.children.get(part);
    if (!next) {
      next = new Node(node.router);
      node.children.set(part, next);
    }
    node = next;
  }

  if (arg instanceof Node) {
    node.children.set(parts[len - 1], arg);
    arg.isEnd = true;
    return;
  }

  if (typeof arg === "string") {
    const nodeHandlers = node.handlers.get(arg) || [];
    nodeHandlers.push(...handlers);
    node.handlers.set(arg, nodeHandlers);
    node.isEnd = true;
  }
}


  *[Symbol.iterator]() {
    function* search(
      node: Node,
      path: string
    ): Iterable<{
      path: string;
      node: Node;
    }> {
      if (node.isEnd) yield { path: path, node };
      for (const [nodePath] of node.children) {
        yield* search(
          node.children.get(nodePath)!,
          path.concat(`/${nodePath}`).replaceAll(/\/+/g, "/")
        );
      }
    }
    yield* search(this, "");
  }
}



export class Router<
  Decorators extends Record<string, unknown> = Record<string, unknown>
> {
  #root: Node;
  #schema: Record<SchemaKeys, ZodTypeAny>;
  #decorators: Decorators;
  #initialisers: Array<[string, () => any]>;
  #derivations: Array<[string, (ctx: any) => any]>;
  #middleware: Array<Handler>;

  constructor() {
    this.#root = new Node(this);
    this.#schema = {} as Record<SchemaKeys, ZodTypeAny>;
    this.#decorators = {} as Decorators;
    this.#initialisers = new Array();
    this.#derivations = new Array();
    this.#middleware = new Array();
  }
  #insert(path: string, Node: Node): void;
  #insert(patj: string, method: Method, ...handlers: Array<Handler>): void;
  #insert(path: string, arg: Method | Node, ...handlers: Array<Handler>): void {
    if (arg instanceof Node) this.#root.add(path, arg);
    else this.#root.add(path, arg, ...handlers);
  }

  #find(path: string): Node | null {
    const node = this.#root.find(path);
    return this.#root.find(path);
  }

  //From https://github.com/withastro/astro/blob/d90714fc3dd7c3eab0a6b29319b0b666bb04b678/packages/astro/src/core/middleware/sequence.ts#L8
  #sequence(
    handlers: Array<Handler>,
    ctx: Context<Decorators>,
    next: Next
  ): Response | Promise<Response> {
    const length = handlers.length;
    if (!length) return next();
    // @ts-expect-error
    // SAFETY: Usually `next` always returns something in user land, but in `sequence` we are actually
    // doing a loop over all the `next` functions, and eventually we call the last `next` that returns the `Response`.
    function applyHandle(i: number, handleContext: Context<Decorators>) {
      const handle = handlers[i];
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
      () => new Response("404 not found", { status: 404 })
    );
    if (!result) return new Response("404 route not found", { status: 404 });
    if (!result)
      throw new Error("does your middleware return a response object? ");
    else return result as Response;
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
  ): Router<Decorators & NewState<K, I>>;
  state<
    const K extends string,
    const I extends () => any,
    const T extends Record<string, () => unknown>
  >(arg: K | T, initialiser?: I): Router<Decorators & (T | NewState<K, I>)> {
    if (typeof arg === "object") {
      for (const [k, v] of Object.entries(arg)) this.#initialisers.push([k, v]);
      return this as Router<Decorators & T>;
    } else if (typeof arg === "string" && initialiser) {
      this.#initialisers.push([arg, initialiser]);
      return this as Router<Decorators & NewState<K, I>>;
    } else throw new Error("incompatiable arguments");
  }

  derive<
    const K extends string,
    const D extends (ctx: Context<Decorators>) => any
  >(key: K, deriver: D): Router<Decorators & NewState<K, D>> {
    this.#derivations.push([key, deriver]);
    return this as any;
  }

  guard<T extends Partial<Record<SchemaKeys, z.ZodTypeAny>>>(
    schema: T
  ): Router<Prettify<Decorators & InferValidators<T>>> {
    for (const [k, s] of Object.entries(schema)) {
      if (this.#schema[k as SchemaKeys])
        this.#schema[k as SchemaKeys] = this.#schema[k as SchemaKeys].and(s);
      else this.#schema[k as SchemaKeys] = s;
    }
    return this as any;
  }

  #clone(): Router<Decorators> {
    const clone = new Router<Decorators>();
    clone.#schema = { ...this.#schema };
    clone.#middleware = [...this.#middleware];
    clone.#decorators = { ...this.#decorators };
    clone.#initialisers = [...this.#initialisers];
    clone.#derivations = [...this.#derivations];

    return clone;
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

  register(
    path: string,
    app: (app: Router<Decorators>) => Router<Decorators>
  ): Router<Decorators>;
  register(path: string, app: Router): Router<Decorators>;
  register(
    path: string,
    arg: Router | ((app: Router<Decorators>) => Router<Decorators>)
  ): Router<Decorators> {
    const clone = arg instanceof Router ? arg : arg(this.#clone());
    for (const { node, path: nodePath } of clone.#root)
      this.#insert(`${path}/${nodePath}`.replaceAll(/\/+/g, "/"), node);
    return this;
  }

  build() {
    return async (ctx: { request: Request }, next: Next) => {
      const url = new URL(ctx.request.url);
      const path = url.pathname;
      const node = this.#find(path);
      if (!node) return next();
      if (this.#schema) {
        const valid = await validateRequest(ctx.request, node.router.#schema);
        if (valid instanceof Error) return errorHandler(valid);
        //@ts-expect-error slutty mutation
        for (const [k, v] of Object.entries(valid)) ctx[k] = v;
      }
      //@ts-expect-error slutty mutation
      for (const [k, v] of Object.entries(node.router.#decorators)) ctx[k] = v;
      //@ts-expect-error slutty mutation
      ctx["forward"] = this.request.bind(this);
      if (this.#initialisers.length) {
        //@ts-expect-error slutty mutation
        for (const [k, i] of node.router.#initialisers) ctx[k] = i();
      }
      if (this.#derivations.length) {
        //@ts-expect-error slutty mutation
        for (const [k, i] of node.router.#derivations) ctx[k] = i(ctx);
      }
      const middleware = node.router.#middleware;
      const handlers = node?.isEnd
        ? node.handlers.get(ctx.request.method as Method)
        : undefined;
      //@ts-expect-error idk
      return this.#sequence(middleware, ctx as Context, () => {
        if (handlers && handlers.length > 0)
          return this.#sequence(handlers, ctx as Context<Decorators>, next);
        else return next();
      });
    };
  }

  post(
    path: string,
    handler: Handler<Prettify<Decorators>>
  ): Router<Decorators> {
    this.#insert(path, "POST", handler);
    return this;
  }

  get(
    path: string,
    handler: Handler<Prettify<Decorators>>
  ): Router<Decorators> {
    this.#insert(path, "GET", handler);
    return this;
  }

  use(handler: Handler<Decorators>): Router<Decorators> {
    this.#middleware.push(handler);
    return this;
  }
}

export function sequence(...handlers: Array<Handler>): Handler {
  const length = handlers.length;
  if (!length) {
    return (_, next) => {
      return next();
    };
  }
  return (ctx, next) => {
    // @ts-expect-error
    // SAFETY: Usually `next` always returns something in user land, but in `sequence` we are actually
    // doing a loop over all the `next` functions, and eventually we call the last `next` that returns the `Response`.
    function applyHandle(i: number, handleContext: Context) {
      const handle = handlers[i];
      return handle(handleContext, async () => {
        if (i < length - 1) return applyHandle(i + 1, handleContext);
        else return next();
      });
    }
    return applyHandle(0, ctx);
  };
}

function zodParseJSOn(string: string, ctx: RefinementCtx): unknown {
  try {
    return JSON.parse(string);
  } catch (error) {
    ctx.addIssue({ code: "custom", message: "unable to parse json" });
    return NEVER;
  }
}

async function validateRequest(
  request: Request,
  guard: Record<SchemaKeys, ZodTypeAny>
): Promise<Record<string, unknown> | Error> {
  const result = {} as Record<SchemaKeys, unknown>;
  for (const [k, schema] of Object.entries(guard)) {
    if (k === "json") {
      const contentType = request.headers.get("Content-Type");
      if (!contentType || contentType.startsWith("application/json"))
        return new Error("unsupported content type");
      const bodyResult = z
        .string()
        .transform(zodParseJSOn)
        .pipe(schema)
        .safeParse(await request.clone().text());
      if (bodyResult.success) result.json = bodyResult.data;
      else return bodyResult.error;
    }
    if (k === "params") {
      const paramsResult = z
        .string()
        .transform(zodParseJSOn)
        .pipe(schema)
        .safeParse(Object.fromEntries(new URL(request.url).searchParams));
      if (paramsResult.success) result.params = paramsResult.data;
      else return paramsResult.error;
    }
  }
  return result;
}