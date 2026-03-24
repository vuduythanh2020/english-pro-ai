/**
 * Unit Tests — user.repository.ts: findUserByGoogleId + createGoogleUser (US-03)
 * ============================================================================
 * Bổ sung test cho 2 hàm mới thêm trong US-03:
 * - findUserByGoogleId(): SELECT user theo google_id
 * - createGoogleUser(): INSERT Google user mới (password_hash=NULL)
 *
 * Strategy: Mock pool.query() giống user.repository.test.ts hiện tại.
 *
 * Coverage:
 * - TC-R01: findUserByGoogleId happy path → return UserRow
 * - TC-R02: findUserByGoogleId — không tìm thấy → return null
 * - TC-R03: findUserByGoogleId — DB error → return null
 * - TC-R04: findUserByGoogleId — SQL chứa google_id, auth_provider, password_hash
 * - TC-R05: createGoogleUser happy path → return UserRecord (KHÔNG có password_hash)
 * - TC-R06: createGoogleUser — SQL INSERT đúng params
 * - TC-R07: createGoogleUser — duplicate (23505) → return null
 * - TC-R08: createGoogleUser — DB error → return null
 * - TC-R09: createGoogleUser — RETURNING không chứa password_hash (BR-01)
 * - TC-R10: createGoogleUser — RETURNING chứa role, auth_provider
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pool.query trước khi import repository
const mockQuery = vi.fn();
vi.mock("../../config/database.config.js", () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { findUserByGoogleId, createGoogleUser } from "./user.repository.js";
import type { UserRow, UserRecord } from "./types.js";

// =============================================
// Fixtures
// =============================================

const mockGoogleUserRow: UserRow = {
  id: "google-user-id-001",
  email: "googleuser@gmail.com",
  role: "user",
  auth_provider: "google",
  name: "Google User",
  profession: null,
  english_level: "intermediate",
  goals: null,
  created_at: new Date("2024-01-15T00:00:00Z"),
  updated_at: new Date("2024-01-15T00:00:00Z"),
  password_hash: null,
  google_id: "google-sub-123456",
};

const mockGoogleUserRecord: UserRecord = {
  id: "google-user-id-001",
  email: "googleuser@gmail.com",
  role: "user",
  auth_provider: "google",
  name: "Google User",
  profession: null,
  english_level: "intermediate",
  goals: null,
  created_at: new Date("2024-01-15T00:00:00Z"),
  updated_at: new Date("2024-01-15T00:00:00Z"),
};

describe("user.repository — US-03 Google OAuth functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =============================================
  // findUserByGoogleId()
  // =============================================
  describe("findUserByGoogleId()", () => {
    it("TC-R01: happy path — return UserRow", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockGoogleUserRow] });

      const result = await findUserByGoogleId("google-sub-123456");

      expect(result).toEqual(mockGoogleUserRow);
      expect(result!.google_id).toBe("google-sub-123456");
      expect(result!.auth_provider).toBe("google");
      expect(result!.password_hash).toBeNull();
    });

    it("TC-R02: không tìm thấy → return null", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await findUserByGoogleId("nonexistent-google-id");

      expect(result).toBeNull();
    });

    it("TC-R03: DB error → return null (graceful degradation)", async () => {
      mockQuery.mockRejectedValueOnce(new Error("connection refused"));

      const result = await findUserByGoogleId("google-sub-123");

      expect(result).toBeNull();
    });

    it("TC-R04: SQL query chứa google_id, auth_provider, password_hash", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockGoogleUserRow] });

      await findUserByGoogleId("google-sub-123456");

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];

      expect(sql).toContain("google_id");
      expect(sql).toContain("auth_provider");
      expect(sql).toContain("password_hash");
      expect(sql).toContain("WHERE google_id = $1");
      expect(params[0]).toBe("google-sub-123456");
    });

    it("TC-R04b: SQL SELECT bao gồm tất cả cột cần thiết cho UserRow", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockGoogleUserRow] });

      await findUserByGoogleId("sub");

      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain("id");
      expect(sql).toContain("email");
      expect(sql).toContain("role");
      expect(sql).toContain("name");
      expect(sql).toContain("profession");
      expect(sql).toContain("english_level");
      expect(sql).toContain("goals");
      expect(sql).toContain("created_at");
      expect(sql).toContain("updated_at");
    });
  });

  // =============================================
  // createGoogleUser()
  // =============================================
  describe("createGoogleUser()", () => {
    it("TC-R05: happy path — return UserRecord (KHÔNG có password_hash)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockGoogleUserRecord] });

      const result = await createGoogleUser({
        email: "googleuser@gmail.com",
        name: "Google User",
        googleId: "google-sub-123456",
      });

      expect(result).toEqual(mockGoogleUserRecord);
      expect(result!.auth_provider).toBe("google");
      expect(result!.role).toBe("user");
      // UserRecord KHÔNG có password_hash
      expect("password_hash" in result!).toBe(false);
    });

    it("TC-R06: SQL INSERT đúng params", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockGoogleUserRecord] });

      await createGoogleUser({
        email: "test@gmail.com",
        name: "Test Name",
        googleId: "sub-xyz",
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];

      // SQL chứa INSERT INTO users
      expect(sql).toContain("INSERT INTO users");
      // SQL chứa auth_provider = 'google'
      expect(sql).toContain("'google'");
      // SQL chứa password_hash = NULL
      expect(sql).toContain("NULL");

      // Params
      expect(params[0]).toBe("test@gmail.com");
      expect(params[1]).toBe("Test Name");
      expect(params[2]).toBe("sub-xyz");
    });

    it("TC-R07: duplicate (23505) → return null", async () => {
      const dupError = new Error("duplicate key value violates unique constraint");
      (dupError as NodeJS.ErrnoException).code = "23505";
      mockQuery.mockRejectedValueOnce(dupError);

      const result = await createGoogleUser({
        email: "existing@gmail.com",
        name: "Dup User",
        googleId: "sub-dup",
      });

      expect(result).toBeNull();
    });

    it("TC-R08: DB error khác → return null", async () => {
      mockQuery.mockRejectedValueOnce(new Error("table does not exist"));

      const result = await createGoogleUser({
        email: "test@gmail.com",
        name: "Test",
        googleId: "sub-123",
      });

      expect(result).toBeNull();
    });

    it("TC-R09: RETURNING không chứa password_hash (BR-01)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockGoogleUserRecord] });

      await createGoogleUser({
        email: "test@gmail.com",
        name: "Test",
        googleId: "sub-123",
      });

      const sql: string = mockQuery.mock.calls[0][0];
      const returningPart = sql.substring(sql.indexOf("RETURNING"));

      expect(returningPart).not.toContain("password_hash");
    });

    it("TC-R10: RETURNING chứa role, auth_provider", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockGoogleUserRecord] });

      await createGoogleUser({
        email: "test@gmail.com",
        name: "Test",
        googleId: "sub-123",
      });

      const sql: string = mockQuery.mock.calls[0][0];
      const returningPart = sql.substring(sql.indexOf("RETURNING"));

      expect(returningPart).toContain("role");
      expect(returningPart).toContain("auth_provider");
    });

    it("TC-R11: SQL INSERT chứa english_level = 'intermediate' (default)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockGoogleUserRecord] });

      await createGoogleUser({
        email: "test@gmail.com",
        name: "Test",
        googleId: "sub-123",
      });

      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain("'intermediate'");
    });
  });

  // =============================================
  // Named exports
  // =============================================
  describe("exports", () => {
    it("TC-R12: findUserByGoogleId và createGoogleUser là named exports", () => {
      expect(typeof findUserByGoogleId).toBe("function");
      expect(typeof createGoogleUser).toBe("function");
    });
  });
});
