/**
 * Unit Tests cho database.config.ts — hàm verifyUsersSchema()
 * =============================================================
 * AC5: Bảng users được verify qua hàm verifyUsersSchema()
 *
 * Vì hàm verifyUsersSchema() phụ thuộc vào pg Pool (kết nối DB thực),
 * test này mock module pg để kiểm tra logic mà không cần DB.
 *
 * Kiểm tra:
 * - TC-01: verifyUsersSchema() trả true khi bảng 'users' tồn tại
 * - TC-02: verifyUsersSchema() trả false khi bảng 'users' KHÔNG tồn tại
 * - TC-03: verifyUsersSchema() trả false khi query throw error (graceful)
 * - TC-04: verifyUsersSchema() là named export, có đúng signature
 * - TC-05: verifyWorkflowHistorySchema() KHÔNG bị sửa (vẫn check 4 bảng workflow)
 * - TC-06: initializeDatabase() và closeDatabase() vẫn tồn tại (no regression)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Dùng vi.hoisted() để đảm bảo mock functions được khởi tạo TRƯỚC khi vi.mock() factory chạy
const { mockQuery, mockConnect, mockRelease, mockEnd, mockOn } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockConnect: vi.fn(),
  mockRelease: vi.fn(),
  mockEnd: vi.fn(),
  mockOn: vi.fn(),
}));

vi.mock("pg", () => {
  const MockPool = vi.fn(() => ({
    query: mockQuery,
    connect: mockConnect.mockResolvedValue({
      query: mockQuery,
      release: mockRelease,
    }),
    end: mockEnd,
    on: mockOn,
  }));
  return { default: { Pool: MockPool } };
});

// Mock env module
vi.mock("./env.js", () => ({
  env: { DATABASE_URL: "postgresql://test:test@localhost:5432/testdb" },
}));

// Mock logger để không spam console
vi.mock("../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import SAU khi mock
import {
  verifyUsersSchema,
  verifyWorkflowHistorySchema,
  initializeDatabase,
  closeDatabase,
} from "./database.config.js";

describe("US-01: verifyUsersSchema() — AC5", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // TC-01: Trả true khi bảng users tồn tại
  // ==========================================================================
  describe("TC-01: Table exists → return true", () => {
    it("should return true when users table is found in information_schema", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ table_name: "users" }],
      });

      const result = await verifyUsersSchema();
      expect(result).toBe(true);
    });

    it("should query information_schema.tables with table_name = 'users'", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ table_name: "users" }],
      });

      await verifyUsersSchema();

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const queryArg = mockQuery.mock.calls[0][0] as string;
      expect(queryArg).toContain("information_schema.tables");
      expect(queryArg).toContain("users");
      expect(queryArg).toContain("public");
    });
  });

  // ==========================================================================
  // TC-02: Trả false khi bảng users KHÔNG tồn tại
  // ==========================================================================
  describe("TC-02: Table NOT exists → return false", () => {
    it("should return false when users table is NOT found", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      const result = await verifyUsersSchema();
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // TC-03: Graceful error handling — trả false khi query lỗi
  // ==========================================================================
  describe("TC-03: Error handling → return false", () => {
    it("should return false when query throws error (not crash)", async () => {
      mockQuery.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await verifyUsersSchema();
      expect(result).toBe(false);
    });

    it("should not throw when database is unreachable", async () => {
      mockQuery.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      await expect(verifyUsersSchema()).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // TC-04: Function signature
  // ==========================================================================
  describe("TC-04: Function signature and export", () => {
    it("verifyUsersSchema should be a function", () => {
      expect(typeof verifyUsersSchema).toBe("function");
    });

    it("verifyUsersSchema should return a Promise<boolean>", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = verifyUsersSchema();
      expect(result).toBeInstanceOf(Promise);

      const resolved = await result;
      expect(typeof resolved).toBe("boolean");
    });
  });

  // ==========================================================================
  // TC-05: verifyWorkflowHistorySchema() KHÔNG bị sửa (regression check)
  // ==========================================================================
  describe("TC-05: No regression on verifyWorkflowHistorySchema()", () => {
    it("verifyWorkflowHistorySchema should still be exported", () => {
      expect(typeof verifyWorkflowHistorySchema).toBe("function");
    });

    it("verifyWorkflowHistorySchema should check 4 workflow tables (not users)", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { table_name: "workflow_approvals" },
          { table_name: "workflow_events" },
          { table_name: "workflow_phases" },
          { table_name: "workflow_runs" },
        ],
      });

      const result = await verifyWorkflowHistorySchema();
      expect(result).toBe(true);

      // Should query for workflow tables, not users
      const queryArg = mockQuery.mock.calls[0][0] as string;
      expect(queryArg).toContain("workflow_runs");
      expect(queryArg).toContain("workflow_phases");
      expect(queryArg).toContain("workflow_approvals");
      expect(queryArg).toContain("workflow_events");
    });

    it("verifyWorkflowHistorySchema should return false when missing tables", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { table_name: "workflow_runs" },
          // Missing 3 tables
        ],
      });

      const result = await verifyWorkflowHistorySchema();
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // TC-06: Other exports still exist (no regression)
  // ==========================================================================
  describe("TC-06: No regression on other exports", () => {
    it("initializeDatabase should still be exported as a function", () => {
      expect(typeof initializeDatabase).toBe("function");
    });

    it("closeDatabase should still be exported as a function", () => {
      expect(typeof closeDatabase).toBe("function");
    });
  });
});
