// deno-lint-ignore-file
import { Context as _Context } from "./contex.ts";
import { z } from "npm:zod";
import { Router } from "./index.ts";

export type ValidationSchema = Record<"json" | "query", z.ZodTypeAny>;

export const Methods = ["post", "get"] as const;
export type Methods = (typeof Methods)[number];

export type Prettify<T> =
	& {
		[K in keyof T]: T[K];
	}
	& {};

export type Next = () => Promise<Response> | Response;

export type Context<D extends Record<string, unknown>> = _Context<D> & {
	forward: (input: URL | string, init?: RequestInit) => Promise<Response>;
};

export type InferValidators<T extends Record<string, z.ZodTypeAny>> = {
	[k in keyof T]: z.infer<T[k]>;
};

export type Handler<
	Decorators extends Record<string, unknown> = any
> = (
	context: Context<Decorators>,
	next: Next,
) => Response | Promise<Response>;

export interface HandlerInterface<D extends Record<string, unknown>> {
	<v extends Partial<ValidationSchema>>(path: string, ...handlers: [...Array<Handler<D>>, Handler<D>]): Router<D>;
	<V extends Partial<ValidationSchema>>(path: string, ...handlers: [...Array<Handler<D & InferValidators<V>>>, V]): Router<D>;
	<V extends Partial<ValidationSchema>>(
		path: string,
		...handlers: [...Array<Handler<D & InferValidators<V>>>, Handler<D & InferValidators<V>>] | [
			...Array<Handler<D & InferValidators<V>>>,
			V,
		]
	): Router<D>;
}