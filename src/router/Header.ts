import { serialize, parse } from "npm:cookie";
import type { CookieSerializeOptions } from "npm:cookie";

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

const DELETED_EXPIRATION = new Date(0);
const DELETED_VALUE = "deleted";

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
  #requestValues: Record<string, string>;
  #outgoing: Map<string, [string, string, boolean]>;
  #request: Request;
  #consumed: boolean;

  constructor(request: Request) {
    this.#request = request;
    this.#requestValues = {};
    this.#consumed = false;
    this.#outgoing = new Map();
  }

  #ensureParsed(options: CookieSetOptions):Record<string,string> {
    const raw = this.#request.headers.get("cookie");
    if (!raw) return this.#requestValues;
    this.#requestValues = parse(this.#request.headers.get("cookie"), options);
    return this.#requestValues;
  }

  *consume(): Iterator<[string, string]> {
    this.#consumed = true;
    for (const i of this) yield i;
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

  get(key: string, options: CookieSetOptions): Cookie | undefined {
    if (this.#outgoing.has(key)) {
      const [serialisedVal, , isSetValue] = this.#outgoing.get(key)!;
      if (isSetValue) return new Cookie(serialisedVal);
      else return undefined;
    }
    // const value = this.#requestValues[key];
    const value = this.#ensureParsed(options)[key];
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
    options: CookieSetOptions
  ):void {
    if (this.#consumed) {
      const warning = new Error("cookies have already been sent to the client");
	  warning.name = "warning"
	  console.warn(warning)
    }
    let stringifiedValue: string;
    if (typeof value === "string") stringifiedValue = value;
    else {
      const stringified = value.toString();
      if (stringified === Object.prototype.toString.call(value)) {
        stringifiedValue = JSON.stringify(value);
      } else stringifiedValue = stringified;
    }

    const serializeOptions: CookieSerializeOptions = {};
    if (options) Object.assign(serializeOptions, options);
    this.#outgoing.set(key, [
      stringifiedValue,
      serialize(key, stringifiedValue, serializeOptions),
      true,
    ]);
  }

  *[Symbol.iterator](): Iterator<[string, string]> {
    for (const [key, value] of this.#outgoing) yield [key, value[1]];
  }
}
