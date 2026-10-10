import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password", () => {
  it("hash tidak sama dengan aslinya", async () => {
    const h = await hashPassword("rahasia123");
    expect(h).not.toContain("rahasia123");
  });
  it("verifikasi benar/salah", async () => {
    const h = await hashPassword("rahasia123");
    expect(await verifyPassword(h, "rahasia123")).toBe(true);
    expect(await verifyPassword(h, "salah")).toBe(false);
  });
});
