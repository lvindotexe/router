// deno-lint-ignore-file no-explicit-any
import { Context as _Context} from "./contex.ts";
import type {z} from 'npm:zod'
import {Router} from './index.ts'

type SchemaKeys = "json" | "query"
type ValidationSchema = Record<SchemaKeys,z.ZodTypeAny>

export const Methods = ["post","get"] as const;

export type Push<A extends any[], I> = A extends Array<any> ? [...A, I] : never;

export type Prettify<T> =
	& {
		[K in keyof T]: T[K];
	}
	& {};

export type Next = () => Promise<Response> | Response;

export type Context<D extends Record<string, unknown>> = _Context<D> & {
	forward: (input: URL | string, init?: RequestInit) => Promise<Response>;
};

export type Handler<
	Decorators extends Record<string, unknown> = any,
> = (
	context: Context<Decorators>,
	next: Next,
) => Response | Promise<Response>;

export interface HandlerInterface<D extends Record<string, unknown>> {
    (path: string, ...handlers: [...Array<Handler<D>>, Handler<D>]): Router<D>;
    (path: string, ...handlers: [...Array<Handler<D>>, Partial<ValidationSchema>]): Router<D>;
	(path: string,...handlers:[...Array<Handler<D>>, Handler<D>]| [...Array<Handler<D>>, Partial<ValidationSchema>]):Router<D>
}