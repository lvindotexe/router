import { serialize,parse } from "cookie";
import type { CookieSerializeOptions } from "cookie";

const DELETED_EXPIRATION = new Date(0);
const DELETED_VALUE = "deleted";

export class RequestCookie {

	#req:Request
	#incoming:Record<string,string>
	constructor(req:Request){
		this.#req = req
		const pain = parse('cookie')
		this.#incoming = parse(req.headers.get('Cookie') ?? '')
	}

	get(key:string):Cookie | undefined {
		return !!this.#incoming[key] ? new Cookie(this.#incoming[key]) : undefined
	}

	has(key:string):boolean {
		return key in this.#incoming
	}
}

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

	toString(){
		return this.value
	}
}

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


export class Cookies {
	#outgoing: Map<string, [string, string, boolean]>;

	constructor() {
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
		return undefined
	}

	has(key: string): boolean {
		if (this.#outgoing.has(key)) {
			const [, , isSetValue] = this.#outgoing.get(key)!;
			return isSetValue;
		}
		return false
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

	*[Symbol.iterator](): Iterator<[string,string]> {
		for (const [_,[str,ser]] of this.#outgoing) yield [str,ser];
	}
}