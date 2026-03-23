/**
 * Unit Tests cho password.utils.ts — US-02
 * =============================================
 * Kiểm tra logic hash và verify password sử dụng Node.js crypto (scrypt).
 *
 * Test Coverage:
 * - TC-01: hashPassword() trả về string dạng "salt:hash" (AC3)
 * - TC-02: Salt là 16 bytes (32 hex chars), hash là 64 bytes (128 hex chars) (AC2)
 * - TC-03: Mỗi lần hash cùng password sinh salt khác nhau (BR-04)
 * - TC-04: verifyPassword() trả true cho password đúng (AC3)
 * - TC-05: verifyPassword() trả false cho password sai (AC3)
 * - TC-06: verifyPassword() trả false cho stored format sai (R-04)
 * - TC-07: verifyPassword() trả false cho stored rỗng (edge case)
 * - TC-08: verifyPassword() trả false cho hash length sai (edge case)
 * - TC-09: hashPassword + verifyPassword round-trip với unicode password
 * - TC-10: hashPassword + verifyPassword round-trip với password rỗng
 * - TC-11: Named exports (AC5)
 */

import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password.utils.js";

describe("password.utils", () => {
  // =============================================
  // TC-01: hashPassword() format
  // =============================================
  describe("hashPassword()", () => {
    it("TC-01: trả về string dạng salt:hash", async () => {
      const result = await hashPassword("testpassword");

      // Phải chứa đúng 1 dấu ":"
      const parts = result.split(":");
      expect(parts).toHaveLength(2);
      expect(parts[0]).toBeTruthy();
      expect(parts[1]).toBeTruthy();
    });

    it("TC-02: salt là 32 hex chars (16 bytes), hash là 128 hex chars (64 bytes)", async () => {
      const result = await hashPassword("testpassword");
      const [salt, hash] = result.split(":");

      // Salt: 16 bytes → 32 hex chars
      expect(salt).toHaveLength(32);
      expect(salt).toMatch(/^[0-9a-f]+$/);

      // Hash: 64 bytes → 128 hex chars
      expect(hash).toHaveLength(128);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it("TC-03: cùng password, sinh salt khác nhau mỗi lần (BR-04)", async () => {
      const hash1 = await hashPassword("samepassword");
      const hash2 = await hashPassword("samepassword");

      // Toàn bộ string phải khác nhau
      expect(hash1).not.toBe(hash2);

      // Salt phần phải khác nhau
      const salt1 = hash1.split(":")[0];
      const salt2 = hash2.split(":")[0];
      expect(salt1).not.toBe(salt2);
    });

    it("TC-10: hoạt động với password rỗng", async () => {
      const result = await hashPassword("");
      const parts = result.split(":");
      expect(parts).toHaveLength(2);
      expect(parts[0]).toHaveLength(32);
      expect(parts[1]).toHaveLength(128);
    });

    it("TC-02b: tổng chiều dài <= 161 chars (fits VARCHAR(255))", async () => {
      const result = await hashPassword("testpassword");
      // 32 (salt) + 1 (:) + 128 (hash) = 161
      expect(result.length).toBeLessThanOrEqual(161);
      expect(result.length).toBe(161);
    });
  });

  // =============================================
  // TC-04 → TC-08: verifyPassword()
  // =============================================
  describe("verifyPassword()", () => {
    it("TC-04: trả true cho password đúng (round-trip)", async () => {
      const plain = "mySecureP@ssw0rd!";
      const stored = await hashPassword(plain);
      const isValid = await verifyPassword(plain, stored);
      expect(isValid).toBe(true);
    });

    it("TC-05: trả false cho password sai", async () => {
      const stored = await hashPassword("correctPassword");
      const isValid = await verifyPassword("wrongPassword", stored);
      expect(isValid).toBe(false);
    });

    it("TC-06: trả false cho stored format sai (không có ':')", async () => {
      const isValid = await verifyPassword("password", "invalidformat");
      expect(isValid).toBe(false);
    });

    it("TC-07: trả false cho stored rỗng", async () => {
      const isValid = await verifyPassword("password", "");
      expect(isValid).toBe(false);
    });

    it("TC-08: trả false cho hash length không đúng", async () => {
      // Salt đúng 32 chars nhưng hash chỉ 10 chars (quá ngắn)
      const isValid = await verifyPassword(
        "password",
        "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4:shortHash"
      );
      expect(isValid).toBe(false);
    });

    it("TC-09: round-trip với unicode password", async () => {
      const unicodePassword = "mật_khẩu_việt_🔐_日本語";
      const stored = await hashPassword(unicodePassword);
      const isValid = await verifyPassword(unicodePassword, stored);
      expect(isValid).toBe(true);
    });

    it("TC-10b: round-trip với password rỗng", async () => {
      const stored = await hashPassword("");
      const isValid = await verifyPassword("", stored);
      expect(isValid).toBe(true);
    });

    it("TC-06b: trả false cho stored có nhiều dấu ':'", async () => {
      // Format "salt:hash:extra" — split sẽ chia thành 3 phần,
      // code chỉ lấy 2 phần đầu nên hash phần có thể bị sai length
      const isValid = await verifyPassword("password", "aaaa:bbbb:cccc");
      expect(isValid).toBe(false);
    });

    it("TC-06c: trả false khi salt là non-hex chars", async () => {
      // Salt không phải hex → Buffer.from(saltHex, "hex") sẽ parse sai
      const isValid = await verifyPassword(
        "password",
        "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz:" + "a".repeat(128)
      );
      expect(isValid).toBe(false);
    });
  });

  // =============================================
  // TC-11: Named exports
  // =============================================
  describe("exports", () => {
    it("TC-11: hashPassword và verifyPassword là named exports", async () => {
      expect(typeof hashPassword).toBe("function");
      expect(typeof verifyPassword).toBe("function");
    });
  });
});
