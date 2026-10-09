import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, getClientKey, recordFailure, resetRateLimit } from "@/lib/auth/rate-limit";

function req(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/auth/login", { method: "POST", headers });
}

describe("rate limit", () => {
  beforeEach(() => resetRateLimit("1.2.3.4"));
  it("mengizinkan di bawah batas", () => {
    for (let i = 0; i < 5; i++) { expect(checkRateLimit("1.2.3.4").allowed).toBe(true); recordFailure("1.2.3.4"); }
  });
  it("memblokir setelah batas", () => {
    for (let i = 0; i < 5; i++) recordFailure("1.2.3.4");
    expect(checkRateLimit("1.2.3.4").allowed).toBe(false);
  });
});

describe("getClientKey", () => {
  it("memakai x-real-ip bila ada", () => {
    expect(getClientKey(req({ "x-real-ip": "10.0.0.1", "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("10.0.0.1");
  });
  it("memakai entri paling kanan x-forwarded-for", () => {
    expect(getClientKey(req({ "x-forwarded-for": "spoofed, 203.0.113.9" }))).toBe("203.0.113.9");
  });
  it("menghasilkan local bila header tidak ada", () => {
    expect(getClientKey(req({}))).toBe("local");
  });
});

