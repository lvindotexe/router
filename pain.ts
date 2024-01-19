const METHOD_NAME_ALL = "ALL";
export type Params = Record<string, string>;

export type Pattern = readonly [string, string, RegExp | true] | "*";

export const splitRoutingPath = (path: string): string[] => {
  const groups: [string, string][] = []; // [mark, original string]
  for (let i = 0; ; ) {
    let replaced = false;
    path = path.replace(/\{[^}]+\}/g, (m) => {
      const mark = `@\\${i}`;
      groups[i] = [mark, m];
      i++;
      replaced = true;
      return mark;
    });
    if (!replaced) {
      break;
    }
  }

  const paths = path.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) {
      if (paths[j].indexOf(mark) !== -1) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }

  return paths;
};

const patternCache: { [key: string]: Pattern } = {};
export const getPattern = (label: string): Pattern | null => {
  // *            => wildcard
  // :id{[0-9]+}  => ([0-9]+)
  // :id          => (.+)
  //const name = ''

  if (label === "*") {
    return "*";
  }

  const match = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match) console.log({ match: match });
  if (match) {
    if (!patternCache[label]) {
      if (match[2]) {
        patternCache[label] = [
          label,
          match[1],
          new RegExp("^" + match[2] + "$"),
        ];
      } else {
        patternCache[label] = [label, match[1], true];
      }
    }

    return patternCache[label];
  }

  return null;
};

export const splitPath = (path: string): string[] => {
  const paths = path.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
};

type HandlerSet<T> = {
  handler: T;
  possibleKeys: string[];
  score: number;
  name: string; // For debug
};

type HandlerParamsSet<T> = HandlerSet<T> & {
  params: Record<string, string>;
};

export class Node<T> {
  methods: Record<string, HandlerSet<T>>[];

  children: Record<string, Node<T>>;
  patterns: Pattern[];
  order: number = 0;
  name: string;
  params: Record<string, string> = {};

  constructor(
    method?: string,
    handler?: T,
    children?: Record<string, Node<T>>
  ) {
    this.children = children || {};
    this.methods = [];
    this.name = "";
    if (method && handler) {
      const m: Record<string, HandlerSet<T>> = {};
      m[method] = { handler, possibleKeys: [], score: 0, name: this.name };
      this.methods = [m];
    }
    this.patterns = [];
  }

  insert(method: string, path: string, handler: T): Node<T> {
    this.name = `${method} ${path}`;
    this.order = ++this.order;

    // deno-lint-ignore no-this-alias
    let curNode: Node<T> = this;
    const parts = splitRoutingPath(path);

    const possibleKeys: string[] = [];
    const parentPatterns: Pattern[] = [];

    for (let i = 0, len = parts.length; i < len; i++) {
      const p: string = parts[i];

      if (Object.keys(curNode.children).includes(p)) {
        parentPatterns.push(...curNode.patterns);
        curNode = curNode.children[p];
        const pattern = getPattern(p);
        if (pattern) possibleKeys.push(pattern[1]);
        continue;
      }

      curNode.children[p] = new Node();

      const pattern = getPattern(p);
      if (pattern) {
        curNode.patterns.push(pattern);
        parentPatterns.push(...curNode.patterns);
        possibleKeys.push(pattern[1]);
      }
      curNode = curNode.children[p];
    }

    if (!curNode.methods.length) {
      curNode.methods = [];
    }

    const m: Record<string, HandlerSet<T>> = {};

    const handlerSet: HandlerSet<T> = {
      handler,
      possibleKeys,
      name: this.name,
      score: this.order,
    };

    m[method] = handlerSet;
    curNode.methods.push(m);

    return curNode;
  }

  // getHandlerSets
  private gHSets(
    node: Node<T>,
    method: string,
    params: Record<string, string>
  ): HandlerParamsSet<T>[] {
    const handlerSets: HandlerParamsSet<T>[] = [];
    for (let i = 0, len = node.methods.length; i < len; i++) {
      const m = node.methods[i];
      const handlerSet = (m[method] ||
        m[METHOD_NAME_ALL]) as HandlerParamsSet<T>;
      if (handlerSet !== undefined) {
        handlerSet.params = {};
        handlerSet.possibleKeys.map((key) => {
          handlerSet.params[key] = params[key];
        });
        handlerSets.push(handlerSet);
      }
    }
    return handlerSets;
  }

  search(method: string, path: string): [[T, Params][]] {
    const handlerSets: HandlerParamsSet<T>[] = [];

    const params: Record<string, string> = {};
    this.params = {};

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const curNode: Node<T> = this;
    let curNodes = [curNode];
    const parts = splitPath(path);

    for (let i = 0, len = parts.length; i < len; i++) {
      const part: string = parts[i];
      const isLast = i === len - 1;
      const tempNodes: Node<T>[] = [];

      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.children[part];

        if (nextNode) {
          if (isLast === true) {
            // '/hello/*' => match '/hello'
            if (nextNode.children["*"]) {
              handlerSets.push(
                ...this.gHSets(nextNode.children["*"], method, node.params)
              );
            }
            handlerSets.push(...this.gHSets(nextNode, method, node.params));
          } else {
            tempNodes.push(nextNode);
          }
        }

        for (let k = 0, len3 = node.patterns.length; k < len3; k++) {
          const pattern = node.patterns[k];

          // Wildcard
          // '/hello/*/foo' => match /hello/bar/foo
          if (pattern === "*") {
            const astNode = node.children["*"];
            if (astNode) {
              handlerSets.push(...this.gHSets(astNode, method, node.params));
              tempNodes.push(astNode);
            }
            continue;
          }

          if (part === "") continue;

          const [key, name, matcher] = pattern;

          const child = node.children[key];

          // `/js/:filename{[a-z]+.js}` => match /js/chunk/123.js
          const restPathString = parts.slice(i).join("/");
          if (matcher instanceof RegExp && matcher.test(restPathString)) {
            params[name] = restPathString;
            handlerSets.push(
              ...this.gHSets(child, method, { ...params, ...node.params })
            );
            continue;
          }

          if (
            matcher === true ||
            (matcher instanceof RegExp && matcher.test(part))
          ) {
            if (typeof key === "string") {
              params[name] = part;
              if (isLast === true) {
                handlerSets.push(
                  ...this.gHSets(child, method, { ...params, ...node.params })
                );
                if (child.children["*"]) {
                  handlerSets.push(
                    ...this.gHSets(child.children["*"], method, {
                      ...params,
                      ...node.params,
                    })
                  );
                }
              } else {
                child.params = { ...params };
                tempNodes.push(child);
              }
            }
          }
        }
      }

      curNodes = tempNodes;
    }
    const results = handlerSets.sort((a, b) => {
      return a.score - b.score;
    });

    return [
      results.map(({ handler, params }) => [handler, params] as [T, Params]),
    ];
  }
}