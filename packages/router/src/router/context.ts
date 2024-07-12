import type {
	InferValidators,
	Init,
	TypedResponse,
	ValidationSchema,
} from "../types";
import { RouterRequest } from "./request";
import { Cookies } from "./cookies";
import { JSONValue } from "../types/json";
import { Router } from ".";

type ValidRedirectStatus = 301 | 302 | 303 | 307 | 308;

export type Context<
	D extends Record<string, unknown> = Record<string, unknown>,
	V extends ValidationSchema = ValidationSchema,
> = _Context<V> & D;

type ContextOptions<V extends ValidationSchema> = {
	router?: Router;
	validationCache:InferValidators<V>
};

export class _Context<V extends ValidationSchema> {
	#headers: Headers;
	notFound: () => Response;
	cookies: Cookies;
	req: RouterRequest;
	#options: ContextOptions<V> | undefined;

	constructor(req: Request | RouterRequest, options?: ContextOptions<V>) {
		this.req = req instanceof RouterRequest ? req : new RouterRequest(req);
		this.#options = options
		this.cookies = new Cookies();
		this.#headers = new Headers();
		this.notFound = () =>
			this.respond("404 route not found", {
				status: 404,
				headers: this.#headers,
			});
	}

	respond<TConent extends string | null, TInit extends Init>(
		content: TConent,
		options?: TInit,
	): Response & TypedResponse<TConent, TInit> {
		if (!options) {
			return new Response(content, {
				headers: this.#headers,
				status: 200,
			}) as any;
		}
		const result = new Headers();
		for (const [_, v] of this.cookies) result.append("set-cookie", v);
		for (const [k, v] of this.#headers) result.set(k, v);
		for (const [k, v] of new Headers(options.headers)) result.set(k, v);
		return new Response(content, {
			...options,
			headers: result,
			status: options.status ?? 200,
		}) as any;
	}

	notfound(): Response & TypedResponse<"Not found", { status: 404 }, "text"> {
		return this.respond("Not found", { status: 404 }) as any;
	}

    valid<K extends keyof V>(key: K):NonNullable<InferValidators<V>[K]> {
        const data = this.#options?.validationCache?.[key];
        if (!data) {
            throw new Error(
                `${String(key)} is not present in the validation cache`,
            );
        }
        return data;
    }

	redirect(location: string, status: ValidRedirectStatus = 302): Response {
		return this.respond(null, {
			status,
			headers: {
				location,
			},
		});
	}

	rewrite(location: string) {
		if (this.#options?.router) {
			throw new Error(
				"unable to rewrite the rerquest, no router has been attatched to the requestContext",
			);
		}
		//@ts-expect-error
		return this.#options.router.handle(this as Context<any>, () => {});
	}

	text<TText extends string, TInit extends Init>(
		text: TText,
		options?: TInit,
	): Response & TypedResponse<TText, TInit, "text"> {
		return this.respond(text, options) as any;
	}

	html<THTML extends string, TInit extends Init>(
		text: THTML,
		options?: TInit,
	): Response & TypedResponse<THTML, TInit, "text"> {
		const headers = new Headers(options?.headers);
		headers.set("content-type", "text/html; charset=UTF-8");
		return this.respond(text, { ...options, headers }) as any;
	}

	json<TJSON extends JSONValue, TInit extends Init>(
		val: TJSON,
		options?: TInit,
	): Response & TypedResponse<TJSON, TInit, "json"> {
		const headers = new Headers(options?.headers);
		headers.set("content-type", "application/json; charset=UTF-8");
		return this.respond(JSON.stringify(val), {
			...options,
			headers,
		}) as any;
	}

	header(
		key: string,
		value: string | undefined,
		options?: { append: boolean },
	): void {
		//TODO if cookie do this better
		if (!value) return this.#headers.delete(key);
		if (options?.append) return this.#headers.append(key, value);
		return this.#headers.set(key, value);
	}
}
