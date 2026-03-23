/**
 * Unit Tests cho types.ts — US-02
 * =============================================
 * Kiểm tra các interface và type definitions.
 * Vì TypeScript types bị erase lúc runtime, test ở đây kiểm tra:
 * - Compile-time type compatibility (nếu test biên dịch được → types đúng)
 * - Runtime shape validation cho các object thỏa mãn interface
 * - Named exports (AC5)
 * - EnglishLevel values khớp DB CHECK constraint (BR-08)
 *
 * Test Coverage:
 * - TC-01: UserRecord interface — đúng shape, KHÔNG có password_hash (AC1, BR-01)
 * - TC-02: UserRow extends UserRecord — CÓ password_hash (AC1)
 * - TC-03: CreateUserInput — required và optional fields (AC1)
 * - TC-04: AuthResponse — user + token (AC4)
 * - TC-05: EnglishLevel — 5 giá trị hợp lệ khớp DB CHECK (BR-08)
 * - TC-06: Named exports (AC5)
 */

import { describe, it, expect } from "vitest";
import type {
  EnglishLevel,
  UserRecord,
  UserRow,
  CreateUserInput,
  AuthResponse,
} from "./types.js";

describe("auth/types", () => {
  // =============================================
  // TC-01: UserRecord
  // =============================================
  describe("UserRecord", () => {
    it("TC-01: đúng shape, KHÔNG có password_hash", () => {
      const user: UserRecord = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        email: "test@example.com",
        name: "Test User",
        profession: "Developer",
        english_level: "intermediate",
        goals: ["business", "technical"],
        created_at: new Date(),
        updated_at: new Date(),
      };

      expect(user.id).toBeDefined();
      expect(user.email).toBe("test@example.com");
      expect(user.name).toBe("Test User");
      expect(user.profession).toBe("Developer");
      expect(user.english_level).toBe("intermediate");
      expect(user.goals).toEqual(["business", "technical"]);
      expect(user.created_at).toBeInstanceOf(Date);
      expect(user.updated_at).toBeInstanceOf(Date);

      // TypeScript compile-time: UserRecord KHÔNG có field password_hash
      // Nếu thêm password_hash vào object literal ở trên, tsc sẽ báo lỗi
      expect("password_hash" in user).toBe(false);
    });

    it("TC-01b: profession và goals có thể là null", () => {
      const user: UserRecord = {
        id: "test-id",
        email: "test@example.com",
        name: "Test",
        profession: null,
        english_level: "beginner",
        goals: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      expect(user.profession).toBeNull();
      expect(user.goals).toBeNull();
    });
  });

  // =============================================
  // TC-02: UserRow extends UserRecord
  // =============================================
  describe("UserRow", () => {
    it("TC-02: extends UserRecord, CÓ password_hash", () => {
      const row: UserRow = {
        id: "test-id",
        email: "test@example.com",
        name: "Test",
        profession: null,
        english_level: "advanced",
        goals: null,
        created_at: new Date(),
        updated_at: new Date(),
        password_hash: "salt:hash",
      };

      // Có tất cả fields của UserRecord
      expect(row.id).toBeDefined();
      expect(row.email).toBeDefined();
      expect(row.name).toBeDefined();

      // PLUS password_hash
      expect(row.password_hash).toBe("salt:hash");
    });

    it("TC-02b: UserRow assignable to UserRecord (extends relationship)", () => {
      const row: UserRow = {
        id: "test-id",
        email: "test@example.com",
        name: "Test",
        profession: null,
        english_level: "intermediate",
        goals: null,
        created_at: new Date(),
        updated_at: new Date(),
        password_hash: "salt:hash",
      };

      // UserRow extends UserRecord → assignable (compile-time check)
      const record: UserRecord = row;
      expect(record.email).toBe("test@example.com");
    });
  });

  // =============================================
  // TC-03: CreateUserInput
  // =============================================
  describe("CreateUserInput", () => {
    it("TC-03: required fields only", () => {
      const input: CreateUserInput = {
        email: "user@test.com",
        passwordHash: "salt:hash",
        name: "User",
      };

      expect(input.email).toBe("user@test.com");
      expect(input.passwordHash).toBe("salt:hash");
      expect(input.name).toBe("User");
      // Optional fields should be undefined
      expect(input.profession).toBeUndefined();
      expect(input.englishLevel).toBeUndefined();
      expect(input.goals).toBeUndefined();
    });

    it("TC-03b: với tất cả optional fields", () => {
      const input: CreateUserInput = {
        email: "user@test.com",
        passwordHash: "salt:hash",
        name: "User",
        profession: "Engineer",
        englishLevel: "upper-intermediate",
        goals: ["career", "travel"],
      };

      expect(input.profession).toBe("Engineer");
      expect(input.englishLevel).toBe("upper-intermediate");
      expect(input.goals).toEqual(["career", "travel"]);
    });
  });

  // =============================================
  // TC-04: AuthResponse
  // =============================================
  describe("AuthResponse", () => {
    it("TC-04: có user (UserRecord) và token (string)", () => {
      const response: AuthResponse = {
        user: {
          id: "test-id",
          email: "test@example.com",
          name: "Test",
          profession: null,
          english_level: "intermediate",
          goals: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
        token: "jwt-token-here",
      };

      expect(response.user).toBeDefined();
      expect(response.token).toBe("jwt-token-here");
      expect(response.user.email).toBe("test@example.com");
      // user bên trong AuthResponse là UserRecord → KHÔNG có password_hash
      expect("password_hash" in response.user).toBe(false);
    });
  });

  // =============================================
  // TC-05: EnglishLevel
  // =============================================
  describe("EnglishLevel", () => {
    it("TC-05: tất cả 5 giá trị hợp lệ khớp DB CHECK constraint (BR-08)", () => {
      const validLevels: EnglishLevel[] = [
        "beginner",
        "elementary",
        "intermediate",
        "upper-intermediate",
        "advanced",
      ];

      expect(validLevels).toHaveLength(5);

      // Mỗi giá trị phải là string
      validLevels.forEach((level) => {
        expect(typeof level).toBe("string");
      });

      // Kiểm tra giá trị cụ thể
      expect(validLevels).toContain("beginner");
      expect(validLevels).toContain("elementary");
      expect(validLevels).toContain("intermediate");
      expect(validLevels).toContain("upper-intermediate");
      expect(validLevels).toContain("advanced");
    });
  });

  // =============================================
  // TC-06: Named exports
  // =============================================
  describe("exports", () => {
    it("TC-06: tất cả types là named exports (AC5)", async () => {
      // Dynamic import để kiểm tra module exports
      const module = await import("./types.js");

      // Types bị erase runtime, nhưng module phải import được không lỗi
      expect(module).toBeDefined();
    });
  });
});
