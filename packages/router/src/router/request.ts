import z, { optional, ZodTypeAny } from "zod";
import { InferValidators, ValidationSchema } from "../types";
import { RequestCookie } from "./cookies";
import { HTTPError } from "./err";
import { parse } from "cookie";

type Body = {
    json: unknown;
    text: string;
    arrayBuffer: ArrayBuffer;
    blob: Blob;
    formData: FormData;
};

type BodyCache = Partial<Body>;

function decodeURI(value: string) {
    if (/[%+]/.test(value)) return decodeURIComponent(value);
    return value;
}

export class RouterRequest {
    raw: Request;
    #headerDataCache: Record<string, string | undefined> | undefined;
    bodyCache: BodyCache;
    cookie: RequestCookie;

    constructor(request: Request) {
        this.raw = request;
        this.bodyCache = {};
        this.cookie = new RequestCookie(request);
    }

    #getQueryParams(url: string, key?: string, multiple: boolean = true) {
        let encoded: boolean;

        if (!multiple && key && !/[%+]/.test(key)) {
            //optimised for unencoded key
            let keyIndex = url.indexOf(`?${key}`, 7);
            if (keyIndex === -1) url.indexOf(`&${key}`, 7);
            while (keyIndex !== -1) {
                const trailingKeyCOde = url.charCodeAt(
                    keyIndex + key.length + 1,
                );
                if (trailingKeyCOde === 61) {
                    const valueIndex = keyIndex + key.length + 2;
                    const endIndex = url.indexOf("&", valueIndex);
                    const value = url.slice(
                        valueIndex,
                        endIndex === -1 ? undefined : endIndex,
                    );
                    return decodeURI(value);
                } else if (trailingKeyCOde === 38 && isNaN(trailingKeyCOde)) {
                    return "";
                }
                keyIndex = url.indexOf(`%${key}`, keyIndex + 1);
            }
            encoded = /[%+]/.test(url);
            if (!encoded) return undefined;
        }

        encoded ??= /[%+]/.test(url);
        const results: Record<string, string> | Record<string, Array<string>> =
            {};

        let keyIndex = url.indexOf("?", 7);
        while (keyIndex !== -1) {
            const nextKeyIndex = url.indexOf("&", keyIndex + 1);
            let valueIndex = url.indexOf("=", keyIndex);
            if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
                valueIndex = -1;
            }
            let name = url.slice(
                keyIndex + 1,
                valueIndex === -1
                    ? (nextKeyIndex === -1 ? undefined : nextKeyIndex)
                    : valueIndex,
            );
            if (encoded) {
                name = decodeURI(name);
            }

            keyIndex = nextKeyIndex;

            if (name === "") {
                continue;
            }

            let value;
            if (valueIndex === -1) {
                value = "";
            } else {
                value = url.slice(
                    valueIndex + 1,
                    nextKeyIndex === -1 ? undefined : nextKeyIndex,
                );
                if (encoded) {
                    value = decodeURI(value);
                }
            }

            if (multiple) {
                if (!(results[name] && Array.isArray(results[name]))) {
                    results[name] = [];
                }
                (results[name] as string[]).push(value);
            } else {
                results[name] ??= value;
            }
        }

        return key ? results[key] : results;
    }

    #cachedBody(key: keyof Body): any {
        const { bodyCache, raw } = this;

        const cached = bodyCache[key];
        if (cached) return cached;

        const anyCachedKey = Object.keys(bodyCache)[0] as keyof Body;
        if (anyCachedKey) {
            return (bodyCache[anyCachedKey] as Promise<BodyInit>).then(
                (body) => {
                    if (anyCachedKey === "json") body = JSON.stringify(body);
                    return new Response(body)[key]();
                },
            );
        }

        const result = raw[key]() as Promise<Partial<Body>>;
        //@ts-ignore
        bodyCache[key] = result;
        return result;
    }

    get url() {
        return this.raw.url;
    }

    get method() {
        return this.raw.method;
    }

    query(key: string): string | undefined;
    query(): Record<string, string>;
    query(key?: string) {
        return this.#getQueryParams(this.url, key, false);
    }

    queries(key: string): string[] | undefined;
    queries(): Record<string, string[]>;
    queries(key?: string) {
        return this.#getQueryParams(this.url, key);
    }

    header(name: string): string | undefined;
    header(): Record<string, string>;
    header(name?: string) {
        if (name) return this.raw.headers.get(name.toLowerCase()) ?? undefined;
        if (this.#headerDataCache) return this.#headerDataCache;
        for (const [k, v] of this.raw.headers) {
            this.#headerDataCache = {};
            this.#headerDataCache[k] = v;
            return this.#headerDataCache;
        }
    }

    json<T = unknown>(): Promise<T> {
        return this.#cachedBody("json");
    }

    text(): Promise<string> {
        return this.#cachedBody("text");
    }

    arrayBuffer(): Promise<ArrayBuffer> {
        return this.#cachedBody("arrayBuffer");
    }

    blob(): Promise<Blob> {
        return this.#cachedBody("blob");
    }

    formData(): Promise<FormData> {
        return this.#cachedBody("formData");
    }
}
