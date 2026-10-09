import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, recordFailure, resetRateLimit } from "@/lib/auth/rate-limit";

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
