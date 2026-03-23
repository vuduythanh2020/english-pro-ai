/**
 * Unit Tests cho user.repository.ts — US-02
 * =============================================
 * Mock PostgreSQL pool.query() để test logic repository mà không cần DB thật.
 * Theo pattern của workflow-history.repository.test.ts.
 *
 * Test Coverage:
 * - TC-01: createUser() — happy path, trả UserRecord không có password_hash (AC1, BR-01)
 * - TC-02: createUser() — duplicate email (code 23505) → return null (BR-02)
 * - TC-03: createUser() — DB error khác → return null (graceful degradation)
 * - TC-04: createUser() — optional fields default (profession=null, englishLevel='intermediate', goals=null)
 * - TC-05: createUser() — tất cả optional fields được truyền
 * - TC-06: findUserByEmail() — happy path, trả UserRow CÓ password_hash (AC1)
 * - TC-07: findUserByEmail() — không tìm thấy → return null (AC1)
 * - TC-08: findUserByEmail() — DB error → return null (graceful)
 * - TC-09: findUserById() — happy path, trả UserRecord KHÔNG có password_hash (AC1, BR-01)
 * - TC-10: findUserById() — không tìm thấy → return null (AC1)
 * - TC-11: findUserById() — DB error → return null (graceful)
 * - TC-12: SQL queries — RETURNING không chứa password_hash cho createUser và findUserById (BR-01)
 * - TC-13: Named exports (AC5)
 * - TC-14: createUser() — goals array truyền đúng (BR-07)
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Mock pool.query trước khi import repository
const mockQuery = vi.fn();
vi.mock("../../config/database.config.js", () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

// Mock logger để tránh console output nhiễu
vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { createUser, findUserByEmail, findUserById } from "./user.repository.js";
import type { UserRecord, UserRow } from "./types.js";

// =============================================
// Fixtures
// =============================================
const mockUserRecord: UserRecord = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "test@example.com",
  name: "Test User",
  profession: "Developer",
  english_level: "intermediate",
  goals: ["business", "technical"],
  created_at: new Date("2024-01-01T00:00:00Z"),
  updated_at: new Date("2024-01-01T00:00:00Z"),
};

const mockUserRow: UserRow = {
  ...mockUserRecord,
  password_hash: "abcdef1234567890abcdef1234567890:0123456789abcdef",
};

describe("user.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =============================================
  // createUser()
  // =============================================
  describe("createUser()", () => {
    it("TC-01: happy path — trả UserRecord không có password_hash (BR-01)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockUserRecord] });

      const result = await createUser({
        email: "test@example.com",
        passwordHash: "salt:hash",
        name: "Test User",
        profession: "Developer",
        englishLevel: "intermediate",
        goals: ["business", "technical"],
      });

      expect(result).toEqual(mockUserRecord);
      // Verify SQL được gọi
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      // SQL KHÔNG chứa password_hash trong RETURNING
      expect(sql).toContain("RETURNING");
      expect(sql).toContain("email");
      expect(sql).toContain("name");
      // Kiểm tra RETURNING clause không liệt kê password_hash
      const returningClause = sql.substring(sql.indexOf("RETURNING"));
      expect(returningClause).not.toContain("password_hash");
      // Params đúng thứ tự
      expect(params[0]).toBe("test@example.com");
      expect(params[1]).toBe("salt:hash");
      expect(params[2]).toBe("Test User");
      expect(params[3]).toBe("Developer");
      expect(params[4]).toBe("intermediate");
      expect(params[5]).toEqual(["business", "technical"]);
    });

    it("TC-02: duplicate email (code 23505) → return null (BR-02)", async () => {
      const dupError = new Error("duplicate key value violates unique constraint");
      (dupError as NodeJS.ErrnoException).code = "23505";
      mockQuery.mockRejectedValueOnce(dupError);

      const result = await createUser({
        email: "existing@example.com",
        passwordHash: "salt:hash",
        name: "Dup User",
      });

      expect(result).toBeNull();
    });

    it("TC-03: DB error khác → return null (graceful degradation)", async () => {
      mockQuery.mockRejectedValueOnce(new Error("connection refused"));

      const result = await createUser({
        email: "test@example.com",
        passwordHash: "salt:hash",
        name: "Test User",
      });

      expect(result).toBeNull();
    });

    it("TC-04: optional fields default — profession=null, englishLevel='intermediate', goals=null", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          ...mockUserRecord,
          profession: null,
          english_level: "intermediate",
          goals: null,
        }],
      });

      await createUser({
        email: "test@example.com",
        passwordHash: "salt:hash",
        name: "Test User",
        // Không truyền profession, englishLevel, goals
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const params = mockQuery.mock.calls[0][1];
      expect(params[3]).toBeNull();           // profession → null
      expect(params[4]).toBe("intermediate"); // englishLevel → default
      expect(params[5]).toBeNull();           // goals → null
    });

    it("TC-05: tất cả optional fields được truyền", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockUserRecord] });

      await createUser({
        email: "test@example.com",
        passwordHash: "salt:hash",
        name: "Test User",
        profession: "Engineer",
        englishLevel: "advanced",
        goals: ["career", "travel"],
      });

      const params = mockQuery.mock.calls[0][1];
      expect(params[3]).toBe("Engineer");
      expect(params[4]).toBe("advanced");
      expect(params[5]).toEqual(["career", "travel"]);
    });

    it("TC-14: goals array truyền đúng trong params (BR-07)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockUserRecord] });

      await createUser({
        email: "test@example.com",
        passwordHash: "salt:hash",
        name: "Test",
        goals: ["goal1", "goal2", "goal3"],
      });

      const [sql, params] = mockQuery.mock.calls[0];
      // SQL chứa ::text[] cast
      expect(sql).toContain("::text[]");
      // goals param là JS array
      expect(params[5]).toEqual(["goal1", "goal2", "goal3"]);
    });
  });

  // =============================================
  // findUserByEmail()
  // =============================================
  describe("findUserByEmail()", () => {
    it("TC-06: happy path — trả UserRow CÓ password_hash (cho login flow)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockUserRow] });

      const result = await findUserByEmail("test@example.com");

      expect(result).toEqual(mockUserRow);
      expect(result!.password_hash).toBeDefined();
      expect(result!.email).toBe("test@example.com");

      // Verify SQL SELECT bao gồm password_hash
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain("password_hash");
      expect(sql).toContain("WHERE email = $1");

      // Verify params
      const params = mockQuery.mock.calls[0][1];
      expect(params[0]).toBe("test@example.com");
    });

    it("TC-07: không tìm thấy → return null", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await findUserByEmail("nonexistent@example.com");
      expect(result).toBeNull();
    });

    it("TC-08: DB error → return null (graceful)", async () => {
      mockQuery.mockRejectedValueOnce(new Error("timeout"));

      const result = await findUserByEmail("test@example.com");
      expect(result).toBeNull();
    });
  });

  // =============================================
  // findUserById()
  // =============================================
  describe("findUserById()", () => {
    it("TC-09: happy path — trả UserRecord KHÔNG có password_hash (BR-01)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockUserRecord] });

      const result = await findUserById("550e8400-e29b-41d4-a716-446655440000");

      expect(result).toEqual(mockUserRecord);
      // Kết quả KHÔNG chứa password_hash
      expect("password_hash" in result!).toBe(false);

      // Verify SQL SELECT không chứa password_hash
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).not.toContain("password_hash");
      expect(sql).toContain("WHERE id = $1");
    });

    it("TC-10: không tìm thấy → return null", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await findUserById("nonexistent-id");
      expect(result).toBeNull();
    });

    it("TC-11: DB error → return null (graceful)", async () => {
      mockQuery.mockRejectedValueOnce(new Error("connection reset"));

      const result = await findUserById("test-id");
      expect(result).toBeNull();
    });
  });

  // =============================================
  // TC-12: SQL security — RETURNING và SELECT không lộ password_hash
  // =============================================
  describe("SQL security (BR-01)", () => {
    it("TC-12a: createUser RETURNING không chứa password_hash", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockUserRecord] });

      await createUser({
        email: "test@example.com",
        passwordHash: "salt:hash",
        name: "Test",
      });

      const sql: string = mockQuery.mock.calls[0][0];
      const returningPart = sql.substring(sql.indexOf("RETURNING"));
      expect(returningPart).not.toContain("password_hash");
    });

    it("TC-12b: findUserById SELECT không chứa password_hash", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockUserRecord] });

      await findUserById("test-id");

      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).not.toContain("password_hash");
      // Nhưng vẫn có các cột cần thiết
      expect(sql).toContain("id");
      expect(sql).toContain("email");
      expect(sql).toContain("name");
    });

    it("TC-12c: findUserByEmail SELECT CÓ password_hash (cần cho xác thực)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockUserRow] });

      await findUserByEmail("test@example.com");

      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain("password_hash");
    });
  });

  // =============================================
  // TC-13: Named exports
  // =============================================
  describe("exports", () => {
    it("TC-13: createUser, findUserByEmail, findUserById là named exports", () => {
      expect(typeof createUser).toBe("function");
      expect(typeof findUserByEmail).toBe("function");
      expect(typeof findUserById).toBe("function");
    });
  });
});
