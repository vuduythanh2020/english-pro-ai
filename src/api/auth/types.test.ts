/**
 * Unit Tests cho types.ts — US-03 + US-02 + US-01 (Google OAuth + User Roles)
 * =============================================
 * Kiểm tra các interface và type definitions.
 * Vì TypeScript types bị erase lúc runtime, test ở đây kiểm tra:
 * - Compile-time type compatibility (nếu test biên dịch được → types đúng)
 * - Runtime shape validation cho các object thỏa mãn interface
 * - Named exports (AC5)
 * - EnglishLevel values khớp DB CHECK constraint (BR-08)
 * - UserRole values khớp DB CHECK constraint chk_users_role (migration 005)
 * - AuthProvider values khớp DB CHECK constraint chk_auth_provider (migration 006)
 *
 * Test Coverage:
 * - TC-01: UserRecord interface — đúng shape, KHÔNG có password_hash (AC1, BR-01), CÓ role, CÓ auth_provider
 * - TC-02: UserRow extends UserRecord — CÓ password_hash (nullable), CÓ google_id (AC1)
 * - TC-03: CreateUserInput — required và optional fields (AC1), KHÔNG có role
 * - TC-04: AuthResponse — user + token (AC4)
 * - TC-05: EnglishLevel — 5 giá trị hợp lệ khớp DB CHECK (BR-08)
 * - TC-06: Named exports (AC5) — bao gồm UserRole, AuthProvider
 * - TC-07: GoogleUserInfo — shape cho Google profile
 * - TC-08: CreateGoogleUserInput — shape cho tạo Google user
 */

import { describe, it, expect } from "vitest";
import type {
  EnglishLevel,
  UserRole,
  AuthProvider,
  UserRecord,
  UserRow,
  CreateUserInput,
  CreateGoogleUserInput,
  GoogleUserInfo,
  AuthResponse,
} from "./types.js";

describe("auth/types", () => {
  // =============================================
  // TC-01: UserRecord
  // =============================================
  describe("UserRecord", () => {
    it("TC-01: đúng shape, KHÔNG có password_hash, CÓ role, CÓ auth_provider", () => {
      const user: UserRecord = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        email: "test@example.com",
        role: "user",
        auth_provider: "local",
        name: "Test User",
        profession: "Developer",
        english_level: "intermediate",
        goals: ["business", "technical"],
        created_at: new Date(),
        updated_at: new Date(),
      };

      expect(user.id).toBeDefined();
      expect(user.email).toBe("test@example.com");
      expect(user.role).toBe("user");
      expect(user.auth_provider).toBe("local");
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
        role: "user",
        auth_provider: "local",
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

    it("TC-01c: role có thể là 'admin'", () => {
      const admin: UserRecord = {
        id: "test-id",
        email: "admin@example.com",
        role: "admin",
        auth_provider: "local",
        name: "Admin User",
        profession: null,
        english_level: "advanced",
        goals: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      expect(admin.role).toBe("admin");
    });

    it("TC-01d: auth_provider có thể là 'google'", () => {
      const googleUser: UserRecord = {
        id: "test-id",
        email: "google@example.com",
        role: "user",
        auth_provider: "google",
        name: "Google User",
        profession: null,
        english_level: "intermediate",
        goals: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      expect(googleUser.auth_provider).toBe("google");
    });
  });

  // =============================================
  // TC-02: UserRow extends UserRecord
  // =============================================
  describe("UserRow", () => {
    it("TC-02: extends UserRecord, CÓ password_hash và google_id", () => {
      const row: UserRow = {
        id: "test-id",
        email: "test@example.com",
        role: "user",
        auth_provider: "local",
        name: "Test",
        profession: null,
        english_level: "advanced",
        goals: null,
        created_at: new Date(),
        updated_at: new Date(),
        password_hash: "salt:hash",
        google_id: null,
      };

      // Có tất cả fields của UserRecord
      expect(row.id).toBeDefined();
      expect(row.email).toBeDefined();
      expect(row.name).toBeDefined();
      expect(row.role).toBe("user");
      expect(row.auth_provider).toBe("local");

      // PLUS password_hash và google_id
      expect(row.password_hash).toBe("salt:hash");
      expect(row.google_id).toBeNull();
    });

    it("TC-02b: UserRow assignable to UserRecord (extends relationship)", () => {
      const row: UserRow = {
        id: "test-id",
        email: "test@example.com",
        role: "user",
        auth_provider: "local",
        name: "Test",
        profession: null,
        english_level: "intermediate",
        goals: null,
        created_at: new Date(),
        updated_at: new Date(),
        password_hash: "salt:hash",
        google_id: null,
      };

      // UserRow extends UserRecord → assignable (compile-time check)
      const record: UserRecord = row;
      expect(record.email).toBe("test@example.com");
    });

    it("TC-02c: Google UserRow — password_hash null, google_id set", () => {
      const row: UserRow = {
        id: "test-id",
        email: "google@example.com",
        role: "user",
        auth_provider: "google",
        name: "Google User",
        profession: null,
        english_level: "intermediate",
        goals: null,
        created_at: new Date(),
        updated_at: new Date(),
        password_hash: null,
        google_id: "google-sub-123",
      };

      expect(row.password_hash).toBeNull();
      expect(row.google_id).toBe("google-sub-123");
      expect(row.auth_provider).toBe("google");
    });
  });

  // =============================================
  // TC-03: CreateUserInput
  // =============================================
  describe("CreateUserInput", () => {
    it("TC-03: required fields only, KHÔNG có role", () => {
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
      // role KHÔNG có trong CreateUserInput
      expect("role" in input).toBe(false);
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
  // TC-07: GoogleUserInfo
  // =============================================
  describe("GoogleUserInfo", () => {
    it("TC-07: đúng shape cho Google profile", () => {
      const info: GoogleUserInfo = {
        id: "google-sub-123456",
        email: "user@gmail.com",
        name: "Google User",
        picture: "https://lh3.googleusercontent.com/photo.jpg",
        verified_email: true,
      };

      expect(info.id).toBe("google-sub-123456");
      expect(info.email).toBe("user@gmail.com");
      expect(info.name).toBe("Google User");
      expect(info.picture).toBeDefined();
      expect(info.verified_email).toBe(true);
    });

    it("TC-07b: optional fields có thể undefined", () => {
      const info: GoogleUserInfo = {
        id: "google-sub-789",
        email: "user@gmail.com",
        name: "User",
      };

      expect(info.picture).toBeUndefined();
      expect(info.verified_email).toBeUndefined();
    });
  });

  // =============================================
  // TC-08: CreateGoogleUserInput
  // =============================================
  describe("CreateGoogleUserInput", () => {
    it("TC-08: đúng shape, KHÔNG có passwordHash", () => {
      const input: CreateGoogleUserInput = {
        email: "user@gmail.com",
        name: "Google User",
        googleId: "google-sub-123",
      };

      expect(input.email).toBe("user@gmail.com");
      expect(input.name).toBe("Google User");
      expect(input.googleId).toBe("google-sub-123");
      expect("passwordHash" in input).toBe(false);
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
          role: "user",
          auth_provider: "local",
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
      expect(response.user.role).toBe("user");
      expect(response.user.auth_provider).toBe("local");
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
  // TC-05b: UserRole
  // =============================================
  describe("UserRole", () => {
    it("TC-05b: chỉ có 2 giá trị hợp lệ khớp DB CHECK constraint chk_users_role", () => {
      const validRoles: UserRole[] = ["user", "admin"];

      expect(validRoles).toHaveLength(2);

      validRoles.forEach((role) => {
        expect(typeof role).toBe("string");
      });

      expect(validRoles).toContain("user");
      expect(validRoles).toContain("admin");
    });
  });

  // =============================================
  // TC-05c: AuthProvider
  // =============================================
  describe("AuthProvider", () => {
    it("TC-05c: chỉ có 2 giá trị hợp lệ khớp DB CHECK constraint chk_auth_provider", () => {
      const validProviders: AuthProvider[] = ["local", "google"];

      expect(validProviders).toHaveLength(2);

      validProviders.forEach((provider) => {
        expect(typeof provider).toBe("string");
      });

      expect(validProviders).toContain("local");
      expect(validProviders).toContain("google");
    });
  });

  // =============================================
  // TC-06: Named exports
  // =============================================
  describe("exports", () => {
    it("TC-06: tất cả types là named exports (AC5), bao gồm UserRole, AuthProvider", async () => {
      // Dynamic import để kiểm tra module exports
      const module = await import("./types.js");

      // Types bị erase runtime, nhưng module phải import được không lỗi
      expect(module).toBeDefined();
    });
  });
});
