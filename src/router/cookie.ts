import { serialize } from "npm:cookie";
import type { CookieSerializeOptions } from "npm:cookie";

const DELETED_EXPIRATION = new Date(0);
const DELETED_VALUE = "deleted";

type CookieSetOptions = {
	domain?: string;
	expires?: Date;
	httpOnly?: boolean;
	maxAge?: number;
	path?: string;
	sameSite?: boolean | "lax" | "none" | "strict";
	secure?: boolean;
};

type CookieDeleteOptions = Pick<CookieSetOptions, "domain" | "path">;


export class Cookie {
	value: string;
	constructor(value: string) {
		this.value = value;
	}

	json() {
		if (!this.value) throw new Error("cannot convert undefined to an object");
		else return JSON.parse(this.value);
	}

	number() {
		return Number(this.value);
	}

	boolean() {
		return typeof this.value === "boolean" ? this.value : Boolean(this.value);
	}
}


export class Cookies {
	#request: Request;
	#requestValues: Record<string, string>;
	#outgoing: Map<string, [string, string, boolean]>;

	constructor(req: Request) {
		this.#request = req;
		this.#requestValues = {};
		this.#outgoing = new Map();
	}

	delete(key: string, options: CookieDeleteOptions): void {
		const serializeOptions: CookieSerializeOptions = {
			expires: DELETED_EXPIRATION,
		};
		if (options.domain) serializeOptions.domain = options.domain;
		if (options.path) serializeOptions.path = options.path;
		// Set-Cookie: token=deleted; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT
		this.#outgoing.set(key, [
			DELETED_VALUE,
			serialize(key, DELETED_VALUE, serializeOptions),
			false,
		]);
	}

	get(key: string): Cookie | undefined {
		if (this.#outgoing.has(key)) {
			const [serialisedVal, , isSetValue] = this.#outgoing.get(key)!;
			if (isSetValue) return new Cookie(serialisedVal);
			else return undefined;
		}
		const value = this.#requestValues[key];
		return value ? new Cookie(value) : undefined;
	}

	has(key: string): boolean {
		if (this.#outgoing.has(key)) {
			const [, , isSetValue] = this.#outgoing.get(key)!;
			return isSetValue;
		}
		return !!this.#requestValues[key];
	}

	set(
		key: string,
		value: string | Record<string, unknown>,
		options: CookieSetOptions,
	) {
		let serialisedVal: string;
		if (typeof value === "string") serialisedVal = value;
		else {
			const stringified = value.toString();
			if (stringified === Object.prototype.toString.call(value)) {
				serialisedVal = JSON.stringify(value);
			} else serialisedVal = stringified;
		}

		const serializeOptions: CookieSerializeOptions = {};
		if (options) Object.assign(serializeOptions, options);
		this.#outgoing.set(key, [
			serialisedVal,
			serialize(key, serialisedVal, serializeOptions),
			true,
		]);
	}

	*headers(): Iterator<string> {
		for (const [, val] of this.#outgoing) yield val[1];
	}
}

export function createContext<T extends Record<string, unknown>>(
	request: Request,
): Context {
	return {
		url: new URL(request.url),
		request,
		cookies: new Cookies(request),
		redirect: (location: string, status?: ValidRedirectStatus) =>
			new Response(null, {
				status: status || 302,
				headers: {
					location,
				},
			}),
	};
}
