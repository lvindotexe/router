type METHOD = "GET" | "POST" | "PUT" | "DELETE" | "PUT";
type METHOD_ALL = "ALL";

export type Handler<
  Decorators extends Record<string, unknown> = Record<string, unknown>,
  Context extends Record<string, unknown> = Record<string, unknown>
> = Context & { decorators: Decorators };

type HandlerSet<T> = {
  handler: T;
  possibleKeys: Array<string>;
};

export type Pattern = readonly [string, string, RegExp | true] | "*";

function pathToParts(path: string): Array<string> {
  const parts = path.split("/");
  if (parts[0] === "") parts.shift();
  return parts;
}

function createPathParser() {
  const cache = new Map();
  return (part: string): Pattern | null => {
    /*
    regex magic to split possible match into capture groups
    e.g :user_id{[a-z-A-Z-0-9]+}
    1st group will be, user_id
    2nd groupd will be [a-zA-Z0-9]+
    */
    const match = part.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
    if (!match) return match;
    else {
      if (!cache.has(part)) {
        //Returns [part,1st capture group, and the 2nd capture group as a RegExp]
        if (!match[2]) cache.set(part, [part, match[1], new RegExp("")]);
        else cache.set(part, [part, match[1], new RegExp(`^${match[2]}$`)]);
      }
      return cache.get(part);
    }
  };
}

interface Router {
  add: (method: METHOD | METHOD_ALL, path: string, handler: Handler) => void;
  match: (
    method: METHOD | METHOD_ALL,
    path: METHOD | METHOD_ALL
  ) => Array<Handler> | undefined;
}

export class Node {
  private children: Map<string, Node>;
  private handlers: Map<METHOD | METHOD_ALL, Array<HandlerSet<Handler>>>;
  name: string;

  constructor() {
    this.children = new Map();
    this.handlers = new Map();
    this.name = "";
  }

  add(method: METHOD | METHOD_ALL, path: string, handler: Handler): Node {
    // deno-lint-ignore no-this-alias
    let node: Node = this;
    const possibleKeys = new Array<string>();
    const pathParser = createPathParser();

    const parts = pathToParts(path);
    for (const part of parts) {
      if (!node.children.has(part)) node.children.set(part, new Node());
      node = node.children.get(part)!;
      const pattern = pathParser(part);
      if (pattern) possibleKeys.push(pattern[1]);
    }
    const handlers = node.handlers.get(method) || [];
    handlers.push({ handler, possibleKeys });
    node.handlers.set(method, handlers);
    return node;
  }

  private getMethods(
    node: Node,
    method: METHOD | METHOD_ALL
  ): Array<HandlerSet<Handler>> {
    const handlers = new Array<HandlerSet<Handler>>();
    for (const [nMethod, nHandlers] of node.handlers)
      if (nMethod === method || nMethod === "ALL") handlers.push(...nHandlers);
    return handlers;
  }

  find(method: METHOD | METHOD_ALL, path: string): Array<Handler> {
    // deno-lint-ignore no-this-alias
    let node: Node = this;
    const parts = pathToParts(path);
    for (const part of parts) {
      if (!node.children.has(part)) return new Array<Handler>();
      else node = node.children.get(part)!;
    }
    return this.getMethods(node, method).map((e) => e.handler);
  }
}

export class TrieRouter implements Router {
  private root: Node;
  constructor() {
    this.root = new Node();
  }

  add(method: METHOD | METHOD_ALL, path: string, handler: Handler) {
    this.root.add(method, path, handler);
  }
  match(method: METHOD | METHOD_ALL, path: string) {
    return this.root.find(method, path);
  }
}
