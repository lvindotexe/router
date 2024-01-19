// deno-lint-ignore-file no-explicit-any
type METHOD = "GET" | "POST" | "PUT" | "DELETE" | "PUT";
type METHOD_ALL = "ALL";

type Next = () => Response | Promise<Response>

export type Handler<
  Decorators extends Record<string, unknown> = Record<string, unknown>,
  Context extends Record<string, unknown> = any
> = (c:Context & {decorators:Decorators},next:Next) => ReturnType<Next>

type HandlerSet<T> = {
  handler: T;
  possibleKeys: Array<string>;
  name:string
};

export type Pattern = readonly [string, string, RegExp | true] | "*";

function split(path: string): Array<string> {
  const parts = path.split("/");
  if (parts[0] === "") parts.shift();
  return parts;
}

function createPathParser() {
  const cache = new Map();
  return (part: string): Pattern | undefined => {
    /*
    regex magic to split possible match into capture groups
    e.g :user_id{[a-z-A-Z-0-9]+}
    1st group will be, user_id
    2nd groupd will be [a-zA-Z0-9]+
    */
    const match = part.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
    if (!match) return undefined;
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


const parsePart = createPathParser()

interface Router {
  add: (method: METHOD | METHOD_ALL, path: string, handler: any) => void;
  match: (
    method: METHOD | METHOD_ALL,
    path: METHOD | METHOD_ALL
  ) => Array<any> | undefined;
}

export class Node<T> {
  private children: Map<string, Node<T>>;
  private handlers: Map<METHOD | METHOD_ALL, Array<HandlerSet<T>>>;
  patterns:Array<Pattern>
  name: string;

  constructor() {
    this.children = new Map();
    this.handlers = new Map();
    this.patterns = new Array()
    this.name = "";
  }

  add(method: METHOD | METHOD_ALL, path: string, handler: T): Node<T> {
    this.name = `${method} ${path}`
    
    let currNode:Node<T> = this
    const parts = split(path)

    const possibleKeys = new Array<string>()
    const parentPatterns = new Array<Pattern>()

    for (const [part] of parts){
      const next = currNode.children.get(part)
      if(next){
        parentPatterns.push(...currNode.patterns)
        currNode = next
        const pattern = parsePart(part)
        if(pattern) possibleKeys.push(pattern[1])
        continue
      }

      currNode.children.set(part,new Node())
      
      const pattern = parsePart(part)
      if(pattern){
        currNode.patterns.push(pattern)
        parentPatterns.push(...currNode.patterns)
        possibleKeys.push(pattern[1])
      }

      currNode = currNode.children.get(part)!
    }

    const handlerSet:HandlerSet<T> = {
      handler,
      possibleKeys,
      name:this.name
    }

    const methods = currNode.handlers.get(method)!
    methods.push(handlerSet)
    currNode.handlers.set(method,methods)

    return currNode
  }

  private getMethods(
    node: Node<T>,
    method: METHOD | METHOD_ALL
  ): Array<HandlerSet<T>> {
    const handlers = new Array<HandlerSet<T>>();
    for (const [nMethod, nHandlers] of node.handlers)
      if (nMethod === method || nMethod === "ALL") handlers.push(...nHandlers);
    return handlers;
  }

  find(method: METHOD | METHOD_ALL, path: string): Array<T> {

    const handlerSets  = new Array<HandlerSet<T>>()

    // deno-lint-ignore no-this-alias
    const currNode:Node<T> = this
    let currNodes:Array<Node<T>> = [currNode]
    const parts = split(path)

    for (const [i,part] of parts.entries()){
      const isLast = i === parts.length -1
      const tempNodes = new Array<Node<T>>()

      for(const [j,node] of currNodes.entries()){
        const nextNode = node.children.get(part)

        if(nextNode){
          if(isLast){
            // '/hello/*' => match '/hello'
            if(nextNode.children.get('*')) handlerSets.push(...this.getMethods(node,method))
            handlerSets.push(...this.getMethods(nextNode,method))
          }
        }

        for(const [i,pattern] of node.)
      }
    }

  }
}

export class TrieRouter<Handler> implements Router {
  private root: Node<Handler>;
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
