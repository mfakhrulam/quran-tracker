import { describe, it, expect } from "vitest";
import { shouldRedirectToLogin } from "@/middleware";

describe("middleware helper", () => {
  it("redirect untuk halaman tanpa cookie", () => {
    expect(shouldRedirectToLogin("/", false)).toBe(true);
  });
  it("tidak redirect untuk /login", () => {
    expect(shouldRedirectToLogin("/login", false)).toBe(false);
  });
  it("tidak redirect bila ada cookie", () => {
    expect(shouldRedirectToLogin("/", true)).toBe(false);
  });
  it("tidak redirect untuk aset & api auth", () => {
    expect(shouldRedirectToLogin("/_next/static/x.js", false)).toBe(false);
    expect(shouldRedirectToLogin("/api/auth/login", false)).toBe(false);
  });
});
