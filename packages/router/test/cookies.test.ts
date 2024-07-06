import {  serialize } from "cookie";
import { beforeEach, describe, expect, test as  it } from "vitest";
import { Cookie, Cookies, RequestCookie } from "../src/router/cookies";

describe("RequestCookie", () => {
    let cookie: RequestCookie

    beforeEach(() => {
        cookie = new RequestCookie(new Request("https://example.com", {
            headers: {
                "Cookie": "test=value; json=%7B%22key%22%3A%22value%22%7D",
            },
        }))
    });

     it("parsing", () => {
        expect(cookie.get("test")?.toString()).toBe("value");
        expect(cookie.get("json")?.toString()).toBe('{"key":"value"}');
    });

     it("non existing", () => {
        expect(cookie.get("nonexistent")).toBeUndefined();
    });

     it("reading", () => {
        expect(cookie.has("test")).toBe(true);
        expect(cookie.has("nonexistent")).toBe(false);
    });

});

describe("Cookie", () => {

     it("should convert to JSON correctly", () => {
        const cookie = new Cookie('{"key":"value"}');
        expect(cookie.json()).toEqual({ key: "value" });
    });

     it("should throw error on invalid JSON conversion", () => {
        const cookie = new Cookie("");
        expect(() => cookie.json()).toThrow(
            "cannot convert undefined to an object",
        );
    });

     it("should convert to number correctly", () => {
        const cookie = new Cookie("123");
        expect(cookie.number()).toBe(123);
    });

     it("should convert to boolean correctly", () => {
        const cookie = new Cookie("true");
        expect(cookie.boolean()).toBe(true);
    });

     it("should return value as string", () => {
        const cookie = new Cookie("value");
        expect(cookie.toString()).toBe("value");
    });

});

describe("Cookies", () => {
    let cookies: Cookies;

    beforeEach(() => {
        cookies = new Cookies();
    });

     it("should set and get a cookie correctly", () => {
        cookies.set("test", "value", { path: "/" });
        const cookie = cookies.get("test");
        expect(cookie?.toString()).toBe("value");
    });

     it("should delete a cookie correctly", () => {
        cookies.set("test", "value", { path: "/" });
        cookies.delete("test", { path: "/" });
        const cookie = cookies.get("test");
        expect(cookie).toBeUndefined();
    });

     it("should identify existing cookies", () => {
        cookies.set("test", "value", { path: "/" });
        expect(cookies.has("test")).toBe(true);
    });

     it("should identify non-existing cookies", () => {
        expect(cookies.has("nonexistent")).toBe(false);
    });

     it("should correctly iterate over cookies", () => {
        cookies.set("test1", "value1", { path: "/" });
        cookies.set("test2", "value2", { path: "/" });

        const cookieArray = [...cookies];
        expect(cookieArray).toEqual([
            ["value1", serialize("test1", "value1", { path: "/" })],
            ["value2", serialize("test2", "value2", { path: "/" })],
        ]);
    });
});
