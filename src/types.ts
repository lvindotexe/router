export type Method = "POST" | "GET";

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};