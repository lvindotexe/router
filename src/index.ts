// deno-lint-ignore-file no-explicit-any
type METHOD = "GET" | "POST" | "PUT" | "DELETE" | "PUT";
type METHOD_ALL = "ALL";
export type Handler<
  Decorators extends Record<string, unknown> = Record<string, unknown>,
  Context extends Record<string, unknown> = any
> = Context & { decorators: Decorators };

function pathToParts(path: string): Array<string> {
  return [...new Set(path.replace(/^(?!\/)/, "/").split("/"))];
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
  private handlers: Map<METHOD | METHOD_ALL, Array<Handler>>;
  name: string;

  constructor() {
    this.children = new Map();
    this.handlers = new Map();
    this.name = "";
  }

  add(method: METHOD | METHOD_ALL, path: string, handler: Handler): Node {
    // deno-lint-ignore no-this-alias
    let node: Node = this;
    const parts = pathToParts(path);
    for (const part of parts) {
      if (!node.children.has(part)) node.children.set(part, new Node());
      node = node.children.get(part)!;
    }
    const handlers = node.handlers.get(method) || [];
    handlers.push(handler);
    node.handlers.set(method, handlers);
    return node;
  }

  private getMethods(node: Node, method: METHOD | METHOD_ALL): Array<Handler> {
    const handlers = new Array<Handler>();
    for (const [nMethod, nHandlers] of node.handlers) {
      if (nMethod === method || nMethod === "ALL")
        for (const handler of nHandlers) handlers.push(handler);
    }
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
    return this.getMethods(node, method);
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
