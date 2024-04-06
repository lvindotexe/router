import type { StatusCode } from "./status.ts";
import { Cookies } from "./cookie.ts";

type ValidRedirectStatus = 300 | 301 | 302 | 303 | 304 | 307 | 308;

type ResponseOptions = {
	headers?: HeadersInit;
	status?: StatusCode;
	statusText?: string;
};

export class Context {
	#headers: Headers | undefined;
	url: URL;
	request: Request;
	cookies: Cookies;

	constructor(request: Request) {
		this.url = new URL(request.url);
		this.request = request;
		this.cookies = new Cookies(request);
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
		return new Response(text, {
			status: options.status,
			statusText: options.statusText,
			headers: options.headers,
			// headers:new Headers(...this.cookies)
		});
	}

	json(val: Record<string, unknown>, options: ResponseOptions): Response {
		return new Response(JSON.stringify(val), {
			status: options.status,
			statusText: options.statusText,
			headers: options.headers,
			// headers:new Headers(...this.cookies)
		});
	}

	html(val: Record<string, unknown>, options: ResponseOptions): Response {
		return new Response(JSON.stringify(val), {
			status: options.status,
			statusText: options.statusText,
			headers: options.headers,
			// headers:new Headers(...this.cookies)
		});
	}

	header(key: string, value: string | undefined) {
		if (value === undefined) {
			if(this.#headers) this.#headers.delete(key)
			return;
		}
		if(!this.#headers) {
			this.#headers = new Headers([[key, value]]);
			return
		}
		else this.#headers.set(key,value)
	}
}
