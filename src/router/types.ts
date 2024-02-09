// deno-lint-ignore-file no-explicit-any
export type Method = "POST" | "GET";

export type Push<A extends any[], I> = A extends Array<any> ? [...A, I] : never;

type pain = Push<[], 1>;

export type Prettify<T> =
	& {
		[K in keyof T]: T[K];
	}
	& {};
