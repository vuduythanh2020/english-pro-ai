/**
 * Unit Tests cho jwt.utils.ts — US-04
 * =============================================
 * Test hàm generateToken() và verifyToken().
 *
 * Test Coverage:
 * - TC-01: generateToken trả về string dạng xxx.yyy.zzz (3 phần)
 * - TC-02: verifyToken decode token hợp lệ → trả JwtPayload đúng
 * - TC-03: verifyToken — token hết hạn → trả null
 * - TC-04: verifyToken — signature bị tamper → trả null
 * - TC-05: verifyToken — format sai (không đủ 3 phần) → trả null
 * - TC-06: verifyToken — chuỗi rỗng → trả null
 * - TC-07: Token payload chứa userId, email, iat, exp
 * - TC-08: exp - iat = expiresIn (default 86400)
 * - TC-09: Hai lần generateToken cùng payload với thời gian khác → token khác
 * - TC-10: Named exports: generateToken, verifyToken, JwtPayload
 * - TC-11: verifyToken — payload bị sửa → signature mismatch → null
 * - TC-12: verifyToken — undefined/null input → null (try-catch)
 * - TC-13: Token header là HS256/JWT
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock config TRƯỚC khi import jwt.utils
vi.mock("../../config/env.js", () => ({
  config: {
    jwt: {
      secret: "test-secret-key-for-unit-tests",
      expiresIn: 86400, // 24h
    },
  },
}));

import { generateToken, verifyToken } from "./jwt.utils.js";
import type { JwtPayload } from "./jwt.utils.js";

// =============================================
// Fixtures
// =============================================

const testPayload = {
  userId: "550e8400-e29b-41d4-a716-446655440000",
  email: "test@example.com",
};

// =============================================
// Helper: decode Base64URL without verification
// =============================================

function base64UrlDecode(encoded: string): string {
  let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = base64.length % 4;
  if (remainder === 2) base64 += "==";
  else if (remainder === 3) base64 += "=";
  return Buffer.from(base64, "base64").toString("utf-8");
}

// =============================================
// Tests
// =============================================

describe("jwt.utils", () => {
  describe("generateToken", () => {
    it("TC-01: Trả về string dạng xxx.yyy.zzz (3 phần, separated by dots)", () => {
      const token = generateToken(testPayload);

      expect(typeof token).toBe("string");
      const parts = token.split(".");
      expect(parts.length).toBe(3);

      // Mỗi phần đều là non-empty string
      for (const part of parts) {
        expect(part.length).toBeGreaterThan(0);
      }
    });

    it("TC-07: Token payload chứa userId, email, iat, exp", () => {
      const token = generateToken(testPayload);
      const parts = token.split(".");

      // Decode payload (phần thứ 2)
      const payloadJson = base64UrlDecode(parts[1]);
      const payload = JSON.parse(payloadJson) as JwtPayload;

      expect(payload.userId).toBe(testPayload.userId);
      expect(payload.email).toBe(testPayload.email);
      expect(typeof payload.iat).toBe("number");
      expect(typeof payload.exp).toBe("number");
      expect(payload.iat).toBeGreaterThan(0);
      expect(payload.exp).toBeGreaterThan(payload.iat);
    });

    it("TC-08: exp - iat = expiresIn (86400 seconds = 24h)", () => {
      const token = generateToken(testPayload);
      const parts = token.split(".");
      const payloadJson = base64UrlDecode(parts[1]);
      const payload = JSON.parse(payloadJson) as JwtPayload;

      expect(payload.exp - payload.iat).toBe(86400);
    });

    it("TC-13: Token header chứa alg=HS256 và typ=JWT", () => {
      const token = generateToken(testPayload);
      const parts = token.split(".");

      // Decode header (phần thứ 1)
      const headerJson = base64UrlDecode(parts[0]);
      const header = JSON.parse(headerJson) as { alg: string; typ: string };

      expect(header.alg).toBe("HS256");
      expect(header.typ).toBe("JWT");
    });

    it("TC-09: Hai lần generateToken với thời gian khác nhau → token khác nhau", () => {
      // Dùng fake timers để control thời gian
      vi.useFakeTimers();

      vi.setSystemTime(new Date("2024-01-15T10:00:00.000Z"));
      const token1 = generateToken(testPayload);

      vi.setSystemTime(new Date("2024-01-15T10:00:01.000Z")); // +1 giây
      const token2 = generateToken(testPayload);

      expect(token1).not.toBe(token2);

      vi.useRealTimers();
    });

    it("Token không chứa ký tự +, /, = (Base64URL format)", () => {
      const token = generateToken(testPayload);

      expect(token).not.toMatch(/[+/=]/);
    });
  });

  describe("verifyToken", () => {
    it("TC-02: Verify token hợp lệ → trả JwtPayload đúng", () => {
      const token = generateToken(testPayload);
      const payload = verifyToken(token);

      expect(payload).not.toBeNull();
      expect(payload!.userId).toBe(testPayload.userId);
      expect(payload!.email).toBe(testPayload.email);
      expect(typeof payload!.iat).toBe("number");
      expect(typeof payload!.exp).toBe("number");
    });

    it("TC-03: Token hết hạn → trả null", () => {
      vi.useFakeTimers();

      // Tạo token tại thời điểm T
      vi.setSystemTime(new Date("2024-01-15T00:00:00.000Z"));
      const token = generateToken(testPayload);

      // Tua thời gian +25 giờ (vượt quá 24h expiry)
      vi.setSystemTime(new Date("2024-01-16T01:00:01.000Z"));
      const payload = verifyToken(token);

      expect(payload).toBeNull();

      vi.useRealTimers();
    });

    it("Token vẫn hợp lệ ngay trước khi hết hạn", () => {
      vi.useFakeTimers();

      // Tạo token tại T=0
      vi.setSystemTime(new Date("2024-01-15T00:00:00.000Z"));
      const token = generateToken(testPayload);

      // Tua đến T+86399 (1 giây trước khi hết hạn)
      const almostExpired = new Date("2024-01-15T00:00:00.000Z").getTime() + 86399 * 1000;
      vi.setSystemTime(new Date(almostExpired));
      const payload = verifyToken(token);

      expect(payload).not.toBeNull();

      vi.useRealTimers();
    });

    it("Token hết hạn chính xác tại exp → trả null (exp <= now)", () => {
      vi.useFakeTimers();

      // Tạo token tại T=0
      vi.setSystemTime(new Date("2024-01-15T00:00:00.000Z"));
      const token = generateToken(testPayload);

      // Tua đến chính xác T+86400 (exp = now → exp <= now → null)
      const exactExpiry = new Date("2024-01-15T00:00:00.000Z").getTime() + 86400 * 1000;
      vi.setSystemTime(new Date(exactExpiry));
      const payload = verifyToken(token);

      expect(payload).toBeNull();

      vi.useRealTimers();
    });

    it("TC-04: Signature bị tamper → trả null", () => {
      const token = generateToken(testPayload);
      const parts = token.split(".");

      // Thay đổi signature (đổi ký tự cuối)
      const lastChar = parts[2].charAt(parts[2].length - 1);
      const tamperedChar = lastChar === "a" ? "b" : "a";
      const tamperedSignature = parts[2].slice(0, -1) + tamperedChar;

      const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSignature}`;
      const payload = verifyToken(tamperedToken);

      expect(payload).toBeNull();
    });

    it("TC-11: Payload bị sửa → signature mismatch → null", () => {
      const token = generateToken(testPayload);
      const parts = token.split(".");

      // Tạo payload mới với email khác rồi encode
      const fakePayload = JSON.stringify({
        userId: "hacked-id",
        email: "hacker@evil.com",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400,
      });
      const fakePayloadEncoded = Buffer.from(fakePayload, "utf-8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      // Giữ header và signature gốc, chỉ thay payload
      const tamperedToken = `${parts[0]}.${fakePayloadEncoded}.${parts[2]}`;
      const payload = verifyToken(tamperedToken);

      expect(payload).toBeNull();
    });

    it("TC-05: Format sai (không đủ 3 phần) → trả null", () => {
      expect(verifyToken("only.two")).toBeNull();
      expect(verifyToken("onepart")).toBeNull();
      expect(verifyToken("one.two.three.four")).toBeNull();
    });

    it("TC-06: Chuỗi rỗng → trả null", () => {
      expect(verifyToken("")).toBeNull();
    });

    it("TC-12: Garbage input → trả null (try-catch protection)", () => {
      expect(verifyToken("aaa.bbb.ccc")).toBeNull();
      expect(verifyToken("...")).toBeNull();
    });

    it("Roundtrip: generateToken → verifyToken → payload giống nhau", () => {
      const token = generateToken(testPayload);
      const decoded = verifyToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded!.userId).toBe(testPayload.userId);
      expect(decoded!.email).toBe(testPayload.email);
    });
  });

  describe("Named exports (TC-10)", () => {
    it("generateToken là named export function", () => {
      expect(typeof generateToken).toBe("function");
    });

    it("verifyToken là named export function", () => {
      expect(typeof verifyToken).toBe("function");
    });

    it("JwtPayload interface tồn tại (TypeScript check — nếu compile thì pass)", () => {
      // Interface check: khởi tạo object conform JwtPayload
      const testObj: JwtPayload = {
        userId: "test",
        email: "test@test.com",
        iat: 1000,
        exp: 2000,
      };
      expect(testObj.userId).toBe("test");
    });
  });
});