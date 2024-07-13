// deno-lint-ignore-file ban-types no-explicit-any
import z from "zod";
import { Router } from "../router";
import { ResponseFormat } from "./format";
import { JSONValue } from "./json";
import { RedirectStatusCode, StatusCode } from "./status";
import { type Context } from "../router/context";

export type ValidationSchema = Partial<
	Record<
		"json" | "query" | "headers" | "cookie" | "form",
		z.ZodTypeAny
	>
>;

export type ValidationTargets = {
	json: unknown;
	query: Record<string, string | Array<string>>;
	form: Record<string, string | Array<string> | File>;
	headers: Record<string, string>;
	cookie: Record<string, string>;
};

export type UnionToIntersection<U> =
	(U extends any ? (k: U) => void : never) extends (
		k: infer I,
	) => void ? I
		: never;

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
	V extends ValidationSchema = any,
	R extends HandlerResponse<any> = any,
> = (
	context: Context<D, V>,
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

export type RemoveBlankRecord<T> = T extends Record<infer K, unknown>
  ? K extends string
    ? T
    : never
  : never

export type MergeSchemaPath<OrigSchema extends Schema, SubPath extends string> = Prettify<{
  [P in keyof OrigSchema as MergePath<SubPath, P & string>]: {
    [M in keyof OrigSchema[P]]: OrigSchema[P][M]
  }
}>

export type MergePath<A extends string, B extends string> = B extends ''
  ? MergePath<A, '/'>
  : A extends ''
  ? B
  : A extends '/'
  ? B
  : A extends `${infer P}/`
  ? B extends `/${infer Q}`
    ? `${P}/${Q}`
    : `${P}/${B}`
  : B extends `/${infer Q}`
  ? Q extends ''
    ? A
    : `${A}/${Q}`
  : `${A}/${B}`

export type ToSchema<
	M extends Methods,
	P extends string,
	V extends ValidationSchema,
	R,
> = Prettify<
	{
		[K in P]: {
			[K2 in M as AddDollar<K2>]: Prettify<
				& {
					input: Prettify<InferValidators<V>>;
				}
				& (
					IsAny<R> extends true ? {
							data: {};
							status: StatusCode;
							format: ResponseFormat;
						}
						: R extends TypedResponse<
							infer TData,
							infer TInit,
							infer TFormat
						> ? {
								data: TData;
								status: TInit extends
									Init<any, infer TStatus, any> ? TStatus
									: StatusCode;
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
	input: InferValidators<ValidationSchema>;
	data: any;
	format: ResponseFormat;
	status: StatusCode;
};
export type IfAnyThenEmptyObject<T> = 0 extends 1 & T ? {} : T;
type EnvOrEmpty<T> = T extends Record<string, string>
	? (Record<string, string> extends T ? {} : T)
	: T;
type IntersectNonAnyTypes<T extends any[]> = T extends
	[infer Head, ...infer Rest]
	? IfAnyThenEmptyObject<EnvOrEmpty<Head>> & IntersectNonAnyTypes<Rest>
	: {};

export interface HandlerInterface<
	D extends Record<string, unknown> = {},
	M extends Methods = Methods,
	S extends Schema = {},
	BasePath extends string = "/",
	V extends ValidationSchema = {},
> {
	<
		P extends string,
		R extends HandlerResponse<any> = any,
		D2 extends Record<string, unknown> = D,
		V2 extends ValidationSchema = {},
	>(
		path: P,
		...handlers: [
			...Array<Handler<IntersectNonAnyTypes<[D, D2]>, V, R>>,
			Handler<IntersectNonAnyTypes<[D & D2]>, V, R>,
		]
	): Router<
		IntersectNonAnyTypes<[D, D2]>,
		Prettify<S & ToSchema<M, P, V, R>>,
		BasePath,
		V
	>;

	<
		P extends string,
		R extends HandlerResponse<any> = any,
		D2 extends Record<string, unknown> = D,
		V2 extends ValidationSchema = {},
	>(
		path: P,
		...handlers: [
			...Array<
				Handler<
					IntersectNonAnyTypes<[D, D2]>,
					IntersectNonAnyTypes<[V, V2]>,
					R
				>
			>,
			V2,
		]
	): Router<
		IntersectNonAnyTypes<[D, D2]>,
		Prettify<S & ToSchema<M, P, IntersectNonAnyTypes<[V, V2]>, R>>,
		BasePath,
		IntersectNonAnyTypes<[V, V2]>
	>;

	<
		P extends string,
		R extends HandlerResponse<any> = any,
		D2 extends Record<string, unknown> = D,
		V2 extends ValidationSchema = {},
	>(
		path: P,
		...handlers:
			| [
				...Array<Handler<IntersectNonAnyTypes<[D2, D]>, V, R>>,
				Handler<D, V>,
			]
			| [
				...Array<
					Handler<
						IntersectNonAnyTypes<[D, D2]>,
						IntersectNonAnyTypes<[V, V2]>,
						R
					>
				>,
				V2,
			]
	): Router<
		IntersectNonAnyTypes<[D, D2]>,
		Prettify<S & ToSchema<M, P, V, R>>,
		BasePath,
		IntersectNonAnyTypes<[V, V2]>
	>;
}


const schema =z.object({hello:z.string()})
type pain = IntersectNonAnyTypes<[{},typeof schema]>