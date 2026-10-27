import { describe, it, expect } from "vitest";
import {
  MAX_BODY_BYTES,
  BodyLimitError,
  bodyTooLarge,
  readJsonBody,
} from "@/lib/http/body-limit";
import {
  checkJsonContentType,
  checkSameOrigin,
  guardAndReadJson,
} from "@/lib/http/csrf";
import { itemsWithinLimit, MAX_MURAJA_ITEMS } from "@/lib/tracker/validation";

function jsonReq(body: string, headers: Record<string, string> = {}, url = "http://localhost/api/x") {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost", ...headers },
    body,
  });
}

describe("body limit (audit F-01)", () => {
  it("menolak Content-Length di atas batas", () => {
    const req = jsonReq("{}", { "content-length": String(MAX_BODY_BYTES + 1) });
    expect(bodyTooLarge(req)).toBe(true);
  });

  it("menerima body kecil", async () => {
    await expect(readJsonBody(jsonReq('{"a":1}'))).resolves.toEqual({ a: 1 });
  });

  it("melempar BodyLimitError untuk body chunked yang melewati batas", async () => {
    // Tanpa Content-Length: hanya penghitung byte saat membaca yang menahan.
    const big = JSON.stringify({ pad: "A".repeat(MAX_BODY_BYTES + 10) });
    await expect(readJsonBody(jsonReq(big))).rejects.toBeInstanceOf(BodyLimitError);
  });

  it("guardAndReadJson mengembalikan 413 untuk body kebesaran", async () => {
    const big = JSON.stringify({ pad: "A".repeat(MAX_BODY_BYTES + 10) });
    const result = await guardAndReadJson(jsonReq(big));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(413);
  });
});

describe("CSRF guards (audit F-08)", () => {
  it("menolak Origin lintas situs", () => {
    const result = checkSameOrigin(jsonReq("{}", { origin: "https://evil.example" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("menerima Origin same-origin", () => {
    expect(checkSameOrigin(jsonReq("{}", { origin: "http://localhost" })).ok).toBe(true);
  });

  it("menerima login browser biasa lewat Host (bukan Origin dari req.url)", () => {
    // Regresi: membandingkan dengan origin `req.url` menolak login sah.
    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", host: "127.0.0.1:3100", origin: "http://127.0.0.1:3100" },
      body: "{}",
    });
    expect(checkSameOrigin(req).ok).toBe(true);
  });

  it("menolak bila Origin berbeda host dari Host", () => {
    const req = new Request("http://localhost/api/x", {
      method: "POST",
      headers: { "content-type": "application/json", host: "quran.example", origin: "https://evil.example" },
      body: "{}",
    });
    expect(checkSameOrigin(req).ok).toBe(false);
  });

  it("menerima request tanpa Origin (klien non-browser)", () => {
    expect(checkSameOrigin(jsonReq("{}")).ok).toBe(true);
  });

  it("menolak Sec-Fetch-Site lintas situs", () => {
    const result = checkSameOrigin(jsonReq("{}", { "sec-fetch-site": "cross-site" }));
    expect(result.ok).toBe(false);
  });

  it("menolak Content-Type text/plain (simple request tanpa preflight)", () => {
    const req = jsonReq("{}", { "content-type": "text/plain" });
    const result = checkJsonContentType(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(415);
  });

  it("menolak request tanpa Content-Type", () => {
    const req = new Request("http://localhost/api/x", { method: "POST", body: "{}" });
    expect(checkJsonContentType(req).ok).toBe(false);
  });
});

describe("pre-check panjang array (audit F-02)", () => {
  it("menolak array kosong dan array kebesaran tanpa memvalidasi elemen", () => {
    expect(itemsWithinLimit([])).toBe(false);
    expect(itemsWithinLimit(Array.from({ length: MAX_MURAJA_ITEMS + 1 }, () => null))).toBe(false);
    expect(itemsWithinLimit(Array.from({ length: 200_000 }, () => null))).toBe(false);
    expect(itemsWithinLimit("bukan array")).toBe(false);
  });

  it("menerima array dalam batas", () => {
    expect(itemsWithinLimit([{ pageNumber: 1, quality: "lancar" }])).toBe(true);
  });
});
