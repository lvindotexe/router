// deno-lint-ignore-file ban-types no-explicit-any
import z from "zod";
import { Router } from "../router";
import { ResponseFormat } from "./format";
import { JSONValue } from "./json";
import { RedirectStatusCode, StatusCode } from "./status";
import { type Context } from "../router/context";

export type ValidationSchema = Record<
	"json" | "query" | "headers" | "cookie",
	z.ZodTypeAny
>;

export type ValidationTargets = {
	json:unknown,
	query:Record<string,string | Array<string>>
	headers:Record<string,string>
	cookies:Record<string,string>
} 

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never

export const Methods = ["post", "get"] as const;
export type Methods = (typeof Methods)[number];

export type Prettify<T> =
	& {
		[K in keyof T]: T[K];
	}
	& {};

export type Next = () => Promise<Response> | Response;

export type InferValidators<T extends Record<string, z.ZodTypeAny>> = {
	[k in keyof T]: z.infer<T[k]>;
};

export type Handler<
	D extends Record<string, unknown> = any,
	P extends string = string,
	V extends Partial<ValidationSchema> = any,
	R extends HandlerResponse<any> = any,
> = (
	context: Context<D, P, V>,
	next: Next,
) => R;

export type Init<
	THeaders extends HeadersInit = HeadersInit,
	TStatusCode extends StatusCode = StatusCode,
	TStatusText extends string = string,
> = {
	headers?: THeaders;
	status?: TStatusCode;
	statusText?: TStatusText;
};

export type TypedResponse<
	TData = unknown,
	TInit extends Init = Init,
	TFormat extends ResponseFormat = TData extends string ? "string"
		: TData extends JSONValue ? "json"
		: ResponseFormat,
> = TInit extends Init<any, infer TStatusCode, infer TStatusText> ? {
		_data: TData;
		_status: TStatusCode;
		_statusText: TStatusText;
		_format: TFormat;
	}
	: never;

type AddDollar<T extends string> = `$${Lowercase<T>}`;
export type IsAny<T> = boolean extends (T extends never ? true : false) ? true
	: false;

export type Input<V extends Partial<ValidationSchema>> = {
	in: Prettify<InferValidators<V>>;
	out: {};
	outputFormat: ResponseFormat;
};

export type ExtractInput<I extends Input<any> | Input<any>["in"]> = I extends
	Input<any> ? unknown extends I["in"] ? {}
	: I["in"]
	: I;

export type ToSchema<
	M extends Methods,
	P extends string,
	V extends Partial<ValidationSchema>,
	R,
> = Prettify<
	{
		[K in P]: {
			[K2 in M as AddDollar<K2>]: Prettify<
				& {
					input: Prettify<InferValidators<V>>;
				}
				& (
					IsAny<R> extends true
						? {
							data: {};
							status: StatusCode;
							format: ResponseFormat;
						}
						: R extends
							TypedResponse<
								infer TData,
								infer TInit,
								infer TFormat
							> ? {
								data: TData;
								status: TInit extends Init<any,infer TStatus,any> ? TStatus : StatusCode;
								format: TFormat;
							}
						: {
							data: {};
							status: StatusCode;
							format: ResponseFormat;
						}
				)
			>;
		};
	}
>;

type HandlerResponse<T = any> =
	| Response
	| TypedResponse<T>
	| Promise<Response | TypedResponse<T>>;

export type Schema = {
	[Path: string]: {
		[Method: `$${Lowercase<string>}`]: Endpoint;
	};
};

export type Endpoint = {
	input: Partial<ValidationSchema>;
	output: any;
	status: RedirectStatusCode;
};

export interface HandlerInterface<
	D extends Record<string, unknown> = {},
	M extends Methods = Methods,
	S extends Schema = {},
	BasePath extends string = "/",
> {
	<
		P extends string,
		V extends Partial<ValidationSchema> = {},
		R extends HandlerResponse<any> = any,
		D2 extends Record<string, unknown> = D,
	>(
		path: P,
		...handlers: [...Array<Handler<D2, P, V, R>>, Handler<D2, P, V>]
	): Router<D, Prettify<S & ToSchema<M, P, V, R>>, BasePath>;
	<
		P extends string,
		V extends Partial<ValidationSchema> = {},
		R extends HandlerResponse<any> = any,
		D2 extends Record<string, unknown> = D,
	>(
		path: P,
		...handlers: [...Array<Handler<D2, P, V, R>>, V]
	): Router<D2, Prettify<S & ToSchema<M, P, V, R>>, BasePath>;
	<
		P extends string,
		V extends Partial<ValidationSchema> = {},
		R extends HandlerResponse<any> = any,
		D2 extends Record<string, unknown> = D,
	>(
		path: P,
		...handlers:
			| [...Array<Handler<D2, P, V, R>>, Handler<D, P, V>]
			| [
				...Array<Handler<D2, P, V, R>>,
				V,
			]
	): Router<D, Prettify<S & ToSchema<M, P, V, R>>, BasePath>;
}
