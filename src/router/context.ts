import type { StatusCode } from "./status.ts";
import { Cookies } from "./cookie.ts";

type ValidRedirectStatus = 300 | 301 | 302 | 303 | 304 | 307 | 308;

type ResponseOptions = {
	headers?: HeadersInit;
	status?: StatusCode;
	statusText?: string;
};

new Headers([['hello','world']])

export class Context {
	#headers: Headers;
	url: URL;
	request: Request;
	cookies: Cookies;

	constructor(request: Request) {
		this.#headers = new Headers();
		this.url = new URL(request.url);
		this.request = request;
		this.cookies = new Cookies(request);
	}

	#respond(content: string, options: ResponseOptions) {
		for (const [k, v] of new Headers(options.headers).entries()) this.#headers?.set(k, v);
		return new Response(content, options);
	}

	redirect(location: string, status?: ValidRedirectStatus) {
		return new Response(null, {
			status: status ?? 302,
			headers: {
				location,
			},
		});
	}

	text(text: string, options: ResponseOptions): Response {
		return this.#respond(text,options)
	}

	json(val: Record<string, unknown>, options: ResponseOptions): Response {
		return this.#respond(JSON.stringify(val),options)
	}

	header(key: string, value: string | undefined) {
		if (value === undefined) {
			if (this.#headers) this.#headers.delete(key);
			return;
		}
		if (!this.#headers) {
			this.#headers = new Headers([[key, value]]);
			return;
		} else this.#headers.set(key, value);
	}
}
