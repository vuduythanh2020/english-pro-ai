/**
 * Unit Tests cho Migration 005: User Roles
 * ==========================================
 * Kiểm tra nội dung file SQL migration đảm bảo:
 * - AC1: Idempotent — sử dụng DO $$ block an toàn khi chạy lại
 * - AC1: Thêm cột role VARCHAR(20) NOT NULL DEFAULT 'user'
 * - AC1: CHECK constraint cho phép 2 giá trị: 'user' và 'admin'
 * - AC1: Index idx_users_role trên cột role
 * - AC5: Test logic migration (static SQL analysis)
 *
 * Theo pattern của migration-004.test.ts: static analysis SQL content,
 * không cần DB thật.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Đọc file migration 005
const migration005Path = resolve(__dirname, "../migrations/005_user_roles.sql");
let migration005Content: string;

try {
  migration005Content = readFileSync(migration005Path, "utf-8");
} catch {
  migration005Content = "";
}

// ============================================================================
// TEST: File tồn tại và có nội dung
// ============================================================================
describe("US-01: Migration 005 - User Roles", () => {
  it("TC-01: migration file 005_user_roles.sql should exist", () => {
    expect(existsSync(migration005Path)).toBe(true);
  });

  it("TC-02: migration file should have meaningful content (> 100 chars)", () => {
    expect(migration005Content.length).toBeGreaterThan(100);
  });

  // ==========================================================================
  // AC1: Idempotent — DO $$ block hoặc IF NOT EXISTS
  // ==========================================================================
  describe("AC1: Idempotent migration", () => {
    it("TC-03: should use DO $$ block or IF NOT EXISTS for safety when re-run", () => {
      const hasDoBlock = migration005Content.includes("DO $$");
      const hasIfNotExists = /IF\s+NOT\s+EXISTS/i.test(migration005Content);
      expect(hasDoBlock || hasIfNotExists).toBe(true);
    });

    it("TC-03b: should use DO $$ block for ALTER TABLE ADD COLUMN (idempotent pattern)", () => {
      // ALTER TABLE ADD COLUMN nằm bên trong DO $$ block
      expect(migration005Content).toContain("DO $$");
      expect(migration005Content).toContain("ALTER TABLE");
      expect(migration005Content).toContain("ADD COLUMN");
    });

    it("TC-03c: should check information_schema before altering table", () => {
      expect(migration005Content).toContain("information_schema");
    });

    it("TC-04: should NOT contain DROP statements (no destructive operations)", () => {
      expect(migration005Content).not.toMatch(/\bDROP\s+TABLE\b/i);
      expect(migration005Content).not.toMatch(/\bDROP\s+INDEX\b/i);
      expect(migration005Content).not.toMatch(/\bDROP\s+COLUMN\b/i);
    });

    it("should NOT contain TRUNCATE or DELETE statements", () => {
      expect(migration005Content).not.toMatch(/\bTRUNCATE\b/i);
      expect(migration005Content).not.toMatch(/\bDELETE\b/i);
    });
  });

  // ==========================================================================
  // AC1: Column definition
  // ==========================================================================
  describe("AC1: Column definition", () => {
    it("TC-05: should add column 'role' with VARCHAR(20)", () => {
      expect(migration005Content).toMatch(/role\s+VARCHAR\(20\)/i);
    });

    it("TC-06: should have NOT NULL DEFAULT 'user'", () => {
      expect(migration005Content).toMatch(/NOT\s+NULL/i);
      expect(migration005Content).toMatch(/DEFAULT\s+'user'/i);
    });

    it("TC-06b: should ALTER TABLE users (correct table name)", () => {
      expect(migration005Content).toMatch(/ALTER\s+TABLE\s+users/i);
    });
  });

  // ==========================================================================
  // AC1: CHECK constraint
  // ==========================================================================
  describe("AC1: CHECK constraint", () => {
    it("TC-07: should have CHECK constraint for 'user' and 'admin' values", () => {
      expect(migration005Content).toContain("CHECK");
      expect(migration005Content).toContain("'user'");
      expect(migration005Content).toContain("'admin'");
    });

    it("TC-07b: CHECK constraint should be named chk_users_role", () => {
      expect(migration005Content).toContain("chk_users_role");
    });

    it("TC-07c: CHECK constraint creation should be idempotent (IF NOT EXISTS check)", () => {
      // Verify there's a check for constraint existence before adding it
      expect(migration005Content).toContain("check_constraints");
      expect(migration005Content).toContain("chk_users_role");
    });

    it("TC-07d: should use role IN ('user', 'admin') pattern", () => {
      expect(migration005Content).toMatch(/role\s+IN\s*\(\s*'user'\s*,\s*'admin'\s*\)/i);
    });
  });

  // ==========================================================================
  // AC1: Index
  // ==========================================================================
  describe("AC1: Index", () => {
    it("TC-08: should create index idx_users_role on column role", () => {
      expect(migration005Content).toContain("idx_users_role");
    });

    it("TC-08b: index creation should use IF NOT EXISTS", () => {
      expect(migration005Content).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_users_role/i);
    });

    it("TC-08c: index should be on table users, column role", () => {
      expect(migration005Content).toMatch(/idx_users_role\s+ON\s+users\s*\(\s*role\s*\)/i);
    });
  });

  // ==========================================================================
  // File naming and auto-detection
  // ==========================================================================
  describe("File naming and auto-detection by runMigrations()", () => {
    it("TC-09: should sort alphabetically after 004_users.sql", () => {
      const migrationsDir = resolve(__dirname, "../migrations");
      const files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      const idx004 = files.indexOf("004_users.sql");
      const idx005 = files.indexOf("005_user_roles.sql");

      expect(idx004).toBeGreaterThanOrEqual(0);
      expect(idx005).toBeGreaterThanOrEqual(0);
      expect(idx005).toBeGreaterThan(idx004);
    });

    it("TC-10: migration files count should be at least 5", () => {
      const migrationsDir = resolve(__dirname, "../migrations");
      const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
      expect(files.length).toBeGreaterThanOrEqual(5);
    });

    it("TC-10b: first 5 migration files should exist in correct order", () => {
      const migrationsDir = resolve(__dirname, "../migrations");
      const files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      expect(files[0]).toBe("001_workflow_history.sql");
      expect(files[1]).toBe("002_workflow_events.sql");
      expect(files[2]).toBe("003_schema_enhancements.sql");
      expect(files[3]).toBe("004_users.sql");
      expect(files[4]).toBe("005_user_roles.sql");
    });
  });

  // ==========================================================================
  // Convention consistency (với migration 004)
  // ==========================================================================
  describe("Convention consistency", () => {
    it("should have header comment block", () => {
      expect(migration005Content).toMatch(/^--\s*=+/);
      expect(migration005Content).toContain("Migration 005");
    });

    it("should mention idempotent in header comments", () => {
      const lowerContent = migration005Content.toLowerCase();
      const hasIdempotent = lowerContent.includes("idempotent");
      const hasIfNotExists = lowerContent.includes("if not exists");
      expect(hasIdempotent || hasIfNotExists).toBe(true);
    });

    it("should follow naming pattern: 005_{description}.sql", () => {
      const migrationsDir = resolve(__dirname, "../migrations");
      const files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      expect(files).toContain("005_user_roles.sql");
    });
  });

  // ==========================================================================
  // AC5: Migration logic tests (static SQL analysis)
  // ==========================================================================
  describe("AC5: Migration logic verification", () => {
    it("TC-11: INSERT without role → DB should assign DEFAULT 'user' (verified by DEFAULT clause)", () => {
      // Verify migration sets DEFAULT 'user' so INSERT without role works
      expect(migration005Content).toMatch(/DEFAULT\s+'user'/i);
      // No INSERT in migration itself (DDL only)
      expect(migration005Content).not.toMatch(/\bINSERT\b/i);
    });

    it("TC-12: UPDATE role to 'admin' should be allowed (verified by CHECK constraint includes 'admin')", () => {
      // CHECK constraint includes 'admin' as a valid value
      expect(migration005Content).toContain("'admin'");
      expect(migration005Content).toMatch(/role\s+IN\s*\(\s*'user'\s*,\s*'admin'\s*\)/i);
    });

    it("TC-13: Invalid role values should be rejected (verified by CHECK constraint)", () => {
      // CHECK constraint only allows 'user' and 'admin'
      // Any other value like 'superadmin' would be rejected by DB
      const checkMatch = migration005Content.match(/CHECK\s*\(\s*role\s+IN\s*\(([^)]+)\)\s*\)/i);
      expect(checkMatch).not.toBeNull();

      if (checkMatch) {
        const allowedValues = checkMatch[1];
        // Only 'user' and 'admin' should be in the CHECK constraint
        expect(allowedValues).toContain("'user'");
        expect(allowedValues).toContain("'admin'");
        // Should NOT contain other values
        expect(allowedValues).not.toContain("'superadmin'");
        expect(allowedValues).not.toContain("'moderator'");
        expect(allowedValues).not.toContain("'guest'");
      }
    });

    it("TC-13b: CHECK constraint should restrict to exactly 2 values", () => {
      const checkMatch = migration005Content.match(/CHECK\s*\(\s*role\s+IN\s*\(([^)]+)\)\s*\)/i);
      expect(checkMatch).not.toBeNull();

      if (checkMatch) {
        // Count number of quoted values
        const quotedValues = checkMatch[1].match(/'[^']+'/g);
        expect(quotedValues).not.toBeNull();
        expect(quotedValues!).toHaveLength(2);
      }
    });
  });

  // ==========================================================================
  // Edge cases & Security
  // ==========================================================================
  describe("Edge cases & Security", () => {
    it("should NOT contain any INSERT statements (DDL only migration)", () => {
      expect(migration005Content).not.toMatch(/\bINSERT\b/i);
    });

    it("should NOT contain UPDATE statements (DDL only migration)", () => {
      // Migration should only add column/constraint/index, not modify data
      // UPDATE within DO $$ block is allowed for IF NOT EXISTS check, but not standalone
      const lines = migration005Content.split("\n");
      const standAloneUpdates = lines.filter(
        (line) =>
          /^\s*UPDATE\b/i.test(line) &&
          !line.trim().startsWith("--")
      );
      expect(standAloneUpdates).toHaveLength(0);
    });

    it("should NOT reference any table other than users", () => {
      // The migration should only modify the users table
      const alterMatches = migration005Content.match(/ALTER\s+TABLE\s+(\w+)/gi);
      if (alterMatches) {
        alterMatches.forEach((match) => {
          expect(match).toMatch(/ALTER\s+TABLE\s+users/i);
        });
      }
    });

    it("should NOT create a new table (only modifies existing users table)", () => {
      expect(migration005Content).not.toMatch(/CREATE\s+TABLE/i);
    });
  });
});
