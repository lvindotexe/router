import { Router } from "../router";
import { Endpoint, IsAny, Schema, UnionToIntersection } from "../types";
import { ResponseFormat } from "../types/format";
import { StatusCode, SuccessStatusCode } from "../types/status";

type RequiredKeysOf<BaseType extends object> = Exclude<
  {
    [Key in keyof BaseType]: BaseType extends Record<Key, BaseType[Key]> ? Key
      : never;
  }[keyof BaseType],
  undefined
>;

type HasRequiredKeys<BaseType extends object> = RequiredKeysOf<BaseType> extends
  never ? false
  : true;

export type RouterClientOptions<T = unknown> =
  & {
    fetch?:typeof fetch,
    init?: RequestInit;
  }
  & (keyof T extends never ? {
      headers?: Record<string, string>;
    }
    : {
      headers: T;
    });

type BlankRecordToNever<T> = T extends any ? T extends null ? null
  : keyof T extends never ? never
  : T
  : never;

interface ClientResponse<
  D,
  S extends StatusCode = StatusCode,
  F extends ResponseFormat = ResponseFormat,
> extends globalThis.Response {
  ok: S extends SuccessStatusCode ? true
    : S extends Exclude<StatusCode, SuccessStatusCode> ? true
    : boolean;
  status: S;
  json(): F extends "text" ? Promise<never>
    : F extends "json" ? Promise<BlankRecordToNever<D>>
    : Promise<unknown>;
  text(): F extends "text" ? (D extends string ? Promise<D> : Promise<never>)
    : Promise<string>;
}

type ResponseFromEndpoint<T extends Endpoint = Endpoint> = T extends {
  data: infer D;
  format: infer F;
  status: infer S;
} ? ClientResponse<
    D,
    S extends StatusCode ? S : never,
    F extends ResponseFormat ? F : never
  >
  : never;

type RemoveDollar<T> = T extends `$${infer R}` ? R : never;

export type ClientRequest<S extends Schema = Schema> =
  & {
    [M in keyof S]: S[M] extends Endpoint & { input: infer R }
      ? R extends object ? HasRequiredKeys<R> extends true ? (
            args: R,
            options?: RouterClientOptions,
          ) => Promise<ResponseFromEndpoint<S[M]>>
        : (
          args?: R,
          options?: RouterClientOptions,
        ) => Promise<ResponseFromEndpoint<S[M]>>
      : never
      : never;
  }
  & {
    $url: (arg?: S[keyof S]) => URL;
    $req: <M extends keyof S>(
      method: RemoveDollar<M>,
      arg: S[M] extends Endpoint & { input: infer R } ? R : undefined,
    ) => Request;
  };

type PathToChain<
  Path extends string,
  S extends Schema,
  Original extends string = Path,
> = Path extends `/${infer P}` ? PathToChain<P, S, Path>
  : Path extends `${infer P}/${infer R}`
    ? { [K in P]: PathToChain<R, S, Original> }
  : {
    [K in Path extends "" ? "index" : Path]: ClientRequest<
      S extends Record<string, unknown> ? S[Original] : never
    >;
  };

export type Client<T> = T extends Router<any, infer S, any,any>
  ? S extends Record<infer K, Schema> ? K extends string ? PathToChain<K, S>
    : never
  : never
  : never;
