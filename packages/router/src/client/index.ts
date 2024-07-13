import { Router } from "../router/index.js";
import { UnionToIntersection, ValidationTargets } from "../types/index.js";
import { deepMerge, serialize } from "../router/isomorphic-utils.js";
import type { Client, RouterClientOptions } from "./types.js";

interface ProxyCallbackOptions {
	path: string[];
	args: any[];
}

type ProxyCallback = (opts: ProxyCallbackOptions) => unknown;

function createRecursiveProxy(
	callback: ProxyCallback,
	path: string[],
): unknown {
	return new Proxy(
		() => {
			// dummy no-op function since we don't have any
			// client-side target we want to remap to
		},
		{
			get(_obj, key) {
				if (typeof key !== "string") return undefined;
				// Recursively compose the full path until a function is invoked
				return createRecursiveProxy(callback, [...path, key]);
			},
			apply(_1, _2, args) {
				// Call the callback function with the entire path we
				// recursively created and forward the arguments
				return callback({
					path,
					args,
				});
			},
		},
	);
}

class ClientRequest {
	#url: string;
	#method: string;
	#params: URLSearchParams | undefined;
	#headers: Headers | undefined;
	#cType: string | undefined;
	#body: BodyInit | undefined;

	constructor(url: string, method: string) {
		this.#url = url;
		this.#method = method;
	}

	request(args?: ValidationTargets, opt?: RouterClientOptions): Request {
		if (args) {
			if (args.query) {
				this.#params ||= new URLSearchParams();
				for (const [k, v] of Object.entries(args.query)) {
					if (!v) continue;
					if (Array.isArray(v)) {
						for (const v2 of v) this.#params.append(k, v2);
					} else this.#params.set(k, v);
				}
			}
			if (args.form) {
				const form = new FormData();
				for (const [k, v] of Object.entries(args.form)) {
					if (v instanceof Array) {
						for (const [v2] of v) form.append(k, v2);
					} else form.append(k, v);
				}
				this.#body = form;
			}
			if (args.json) {
				this.#body = JSON.stringify(args.json);
				this.#cType = "application/json";
			}
			if (args.headers) {
				this.#headers ||= new Headers({
					...opt?.headers,
				});
				for (const [k, v] of Object.entries(args.headers)) {
					if (!v) continue;
					if (this.#headers.has(k)) this.#headers.append(k, v);
					else this.#headers.set(k, v);
				}
			}
			if (args.cookie) {
				this.#headers ||= new Headers();
				const pain = Object.entries(args.cookie).map(([k, v]) =>
					serialize(k, v, { path: "/" })
				);
				this.#headers.set(
					"Cookie",
					Object.entries(args.cookie).map(([k, v]) =>
						serialize(k, v, { path: "/" })
					).join("; "),
				);
			}
		}

		let url = this.#url;
		url = /^https?:\/\/[^\/]+?\/index$/.test(url)
			? url.replace(/\/index$/, "/")
			: url.replace(/\/index$/, "");
		if (this.#params) url = `${url}?${this.#params.toString()}`;

		const method = this.#method.toUpperCase();
		const setBody = !(method === "GET" || method === "HEAD");

		const init: ResponseInit = {
			body: setBody ? this.#body : undefined,
			method: method,
			headers: this.#headers ||= new Headers(),
			...opt?.init,
		};
		const req = new Request(url, init);
		return req;
	}

	fetch(
		args?: ValidationTargets,
		opt?: RouterClientOptions,
	): Promise<Response> {
		const req = this.request(args, opt);
		return (opt?.fetch || fetch)(req);
	}
}

export function rc<R extends Router<any, any, any,any>>(
	baseurl: string,
	options?: RouterClientOptions,
) {
	return createRecursiveProxy((opts) => {
		const parts = [...opts.path];
		let method = "";
		if (/^\$/.test(parts[parts.length - 1])) {
			const last = parts.pop();
			if (last) method = last.replace(/^\$/, "");
		}

		const url = mergePath(baseurl, parts.join("/"));

		if (method === "req") {
			let [method, args] = opts.args as [string, any];
			const req = new ClientRequest(url, method);
			options ??= {};
			args = deepMerge<RouterClientOptions>(options, {
				method,
				...(opts.args[1] ?? {}),
			});
			return req.request(opts.args[1], args);
		}

		if (method) {
			const req = new ClientRequest(url, method);
			options ??= {};
			const args = deepMerge<RouterClientOptions>(options, {
				...(opts.args[1] ?? {}),
			});
			return req.fetch(opts.args[0], args);
		}
	}, []) as UnionToIntersection<Client<R>>;
}

const mergePath = (base: string, path: string) => {
	base = base.replace(/\/+$/, "");
	base = base + "/";
	path = path.replace(/^\/+/, "");
	return base + path;
};
