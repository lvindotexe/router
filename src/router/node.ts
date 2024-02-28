// deno-lint-ignore-file
import type { Router } from "./index.ts";
import type { Handler, Methods, ValidationSchema } from "./types.ts";

function split(path: string): Array<string> {
	const parts = path.replace(/\/+$/, "").split("/");
	if (parts.length > 1 && parts[0] === "") parts.shift();
	return parts;
}

export class Node {
	children: Map<string, Node>;
	isEnd: boolean;
	schema: Partial<ValidationSchema> | undefined
	handlers: Map<Methods, Array<Handler>>;
	router: Router<any>;

	constructor(router: Router<any>) {
		this.children = new Map();
		this.schema = {};
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

	add(
		path: string,
		schema: Partial<ValidationSchema> | undefined,
		arg: Methods | Node,
		...handlers: Array<Handler>
	): void {
		const parts = split(path);
		let node: Node = this;
		const len = parts.length;

		for (const [i, part] of parts.entries()) {
			if (i >= len - 1) break;
			if (!node.children.has(part)) {
				node.children.set(part, new Node(node.router));
			}
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
		const method = arg as Methods;
		const existingHandlers = node.handlers.get(method) || [];
		existingHandlers.push(...handlers);
		node.handlers.set(method, existingHandlers);
		node.schema = schema;
		node.isEnd = true;
	}

	*[Symbol.iterator]() {
		function* search(
			node: Node,
			fullPath: string,
		): Iterable<{
			path: string;
			node: Node;
		}> {
			if (node.isEnd) yield { path: fullPath, node };
			for (const [path] of node.children) {
				yield* search(
					node.children.get(path)!,
					fullPath.concat(`/${path}`).replaceAll(/\/+/g, "/"),
				);
			}
		}
		yield* search(this, "");
	}
}
