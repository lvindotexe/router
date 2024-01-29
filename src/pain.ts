// deno-lint-ignore-file
// deno-lint-ignore-file no-explicit-any
import z, {
  NEVER,
  RefinementCtx,
  ZodError,
  ZodTypeAny
} from "npm:zod";
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

type InferValidators<T extends Record<string, ZodTypeAny>> = {
  [k in keyof T]: z.infer<T[k]>;
};

function split(path: string): Array<string> {
  const parts = path.replace(/\/+$/, "").split("/");
  if (parts.length > 1 && parts[0] === "") parts.shift();
  return parts;
}

function NotFoundHandler(): Response {
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
  router: Router<any>;

  constructor(router: Router<any>) {
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
    const parts = split(path);
    let node: Node = this;
    const len = parts.length;

    for (const [i, part] of parts.entries()) {
      if (i >= len - 1) break;
      if (!node.children.has(part))
        node.children.set(part, new Node(node.router));
      node = node.children.get(part)!;
    }

    if (arg instanceof Node) {
      const last = parts[parts.length - 1]!;
      node.children.set(last, arg);
      arg.isEnd = true;
      return;
    }
    let next = node.children.get(parts[len - 1]);
    if (!next) {
      next = new Node(node.router);
      node.children.set(parts[len - 1], next);
    }
    node = next!;
    const method = arg as Method;
    const existingHandlers = node.handlers.get(method) || [];
    existingHandlers.push(...handlers);
    node.handlers.set(method, existingHandlers);
    node.isEnd = true;
  }

  *[Symbol.iterator]() {
    function* search(
      node: Node,
      fullPath: string
    ): Iterable<{
      path: string;
      node: Node;
    }> {
      if (node.isEnd) yield { path: fullPath, node };
      for (const [path] of node.children) {
        yield* search(
          node.children.get(path)!,
          fullPath.concat(`/${path}`).replaceAll(/\/+/g, "/")
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
  size: number;
  #middleware: Array<Handler>;

  constructor() {
    this.size = 0;
    this.#root = new Node(this);
    this.#schema = {} as Record<SchemaKeys, ZodTypeAny>;
    this.#decorators = {} as Decorators;
    this.#initialisers = new Array();
    this.#derivations = new Array();
    this.#middleware = new Array();
  }

  #find(path: string): Node | null {
    return this.#root.find(path);
  }
  #insert(path: string, arg: Method | Node, ...handlers: Array<Handler>): void {
    this.#root.add(path, arg, ...handlers);
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
      //@ts-expect-error
      () => {}
    );
    if (!result) return new Response("404 route not found", { status: 404 });
    if (!result)
      throw new Error("does your middleware return a response object? ");
    else return result as Response;
  }

  #clone(): Router<Decorators> {
    const router = new Router<Decorators>();

    router.#schema = this.#schema;
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

  derive<
    const K extends string,
    const D extends (ctx: Context<Decorators>) => any
  >(key: K, deriver: D): Router<Decorators & { [P in K]: ReturnType<D> }> {
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
    const clone = arg instanceof Router ? arg : arg(this.#clone())
    for(const {node,path:nodePath} of clone.#root)
      this.#insert(`${path}/${nodePath}`.replaceAll(/\/+/g, "/"), node);
    return this
  }

  build() {
    return async (ctx: { request: Request }, next?: Next) => {
      const path = new URL(ctx.request.url).pathname;
      const node = this.#find(path);
      console.log({schema:this.#schema})
      if (!node) return next ? next() : NotFoundHandler();
      const router = node.router;

      if (node.router.#schema) {
        const valid = await validateRequest(ctx.request, node.router.#schema);
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
        ? node.handlers.get(ctx.request.method as Method)
        : undefined;
      //@ts-expect-error idk
      return this.#sequence(middleware, ctx as Context, () => {
        if (handlers && handlers.length > 0)
          return this.#sequence(
            handlers,
            ctx as Context<Decorators>,
            () => new Response()
          );
        else return next ? next() : NotFoundHandler();
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

function parseJSONString(string: string, ctx: RefinementCtx): unknown {
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
        .transform(parseJSONString)
        .pipe(schema)
        .safeParse(await request.clone().text());
      if (bodyResult.success) result.json = bodyResult.data;
      else return bodyResult.error;
    }
    if (k === "params") {
      const paramsResult = z
        .string()
        .transform(parseJSONString)
        .pipe(schema)
        .safeParse(Object.fromEntries(new URL(request.url).searchParams));
      if (paramsResult.success) result.params = paramsResult.data;
      else return paramsResult.error;
    }
  }
  return result;
}

function getPattern(part:string){
  if(part.startsWith(":")) return [part.slice(1),part] as const
}