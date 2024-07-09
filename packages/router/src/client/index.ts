import { Router } from "../router/index.js";
import { UnionToIntersection, ValidationTargets } from "../types/index.js";
import { deepMerge, serialize } from "../router/isomorphic-utils.js";
import { Client, RouterClientOptions } from "./types.js";

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
	#query: URLSearchParams | undefined;
	#body: BodyInit | undefined;

	constructor(url: string, method: string) {
		this.#url = url;
		this.#method = method;
	}

	async fetch(args?: ValidationTargets, opt?: RouterClientOptions) {
		if (args) {
		}

		const headers = new Headers({
			...args?.headers,
			...opt?.headers,
		});

		if (args?.cookies) {
			headers.set(
				"Cookie",
				Object.entries(args.cookies)
					.map(([k, v]) => serialize(k, v, { path: "/" }))
					.join(","),
			);
		}

		let url = this.#url;
		url = /^https?:\/\/[^\/]+?\/index$/.test(url)
			? url.replace(/\/index$/, "/")
			: url.replace(/\/index$/, "");
		if (this.#query) url = `${url}?${this.#query.toString()}`;

		const method = this.#method.toUpperCase();
		const setBody = !(method === "GET" || method === "HEAD");

		return (opt?.fetch || fetch)(url, {
			body: setBody ? this.#body : undefined,
			method: method,
			headers: headers,
			...opt?.init,
		});
	}
}



export function rc<R extends Router<any,any,any>>(
	baseurl: string,
	options?: RouterClientOptions,
) {
	return createRecursiveProxy((opts) => {
		const parts = [...opts.path];
		let method = "";
		if (/^$/.test(parts[parts.length - 1])) {
			const last = parts.pop();
			if (last) method = last.replace(/^$/, "");
		}

		const url = mergePath(baseurl, parts.join("/"));

		const req = new ClientRequest(url, method);
		if (method) {
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
