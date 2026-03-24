/**
 * Unit Tests cho Migration 006: OAuth Provider Support
 * =====================================================
 * Kiểm tra nội dung file SQL migration đảm bảo:
 * - AC1: Idempotent — sử dụng DO $$ block kiểm tra IF NOT EXISTS
 * - AC2: Thêm cột auth_provider VARCHAR(20) NOT NULL DEFAULT 'local' + CHECK constraint
 * - AC3: Thêm cột google_id VARCHAR(255) với UNIQUE enforcement
 * - AC4: ALTER password_hash thành nullable + CHECK constraint chk_local_password
 * - AC5: Index trên google_id
 * - AC6: Index trên auth_provider
 * - AC7: Không ảnh hưởng data hiện có (DDL only, no DML)
 * - AC8: File ordering — sort alphabetically sau 005_user_roles.sql
 *
 * Theo pattern của migration-005.test.ts: static analysis SQL content,
 * không cần DB thật.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Đọc file migration 006
const migration006Path = resolve(__dirname, "../migrations/006_oauth_provider.sql");
let migration006Content: string;

try {
  migration006Content = readFileSync(migration006Path, "utf-8");
} catch {
  migration006Content = "";
}

// ============================================================================
// TEST: File tồn tại và có nội dung
// ============================================================================
describe("US-01: Migration 006 - OAuth Provider Support", () => {
  it("TC-01: migration file 006_oauth_provider.sql should exist", () => {
    expect(existsSync(migration006Path)).toBe(true);
  });

  it("TC-02: migration file should have meaningful content (> 100 chars)", () => {
    expect(migration006Content.length).toBeGreaterThan(100);
  });

  // ==========================================================================
  // AC1: Idempotent — DO $$ block + IF NOT EXISTS
  // ==========================================================================
  describe("AC1: Idempotent migration", () => {
    it("TC-03: should use DO $$ blocks for safety when re-run", () => {
      const doBlockCount = (migration006Content.match(/DO \$\$/g) || []).length;
      expect(doBlockCount).toBeGreaterThanOrEqual(5);
    });

    it("TC-04: should check information_schema before ALTER", () => {
      expect(migration006Content).toContain("information_schema");
      // Should check both columns and check_constraints
      expect(migration006Content).toContain("information_schema.columns");
      expect(migration006Content).toContain("information_schema.check_constraints");
    });

    it("TC-05: should NOT contain DROP TABLE statements", () => {
      expect(migration006Content).not.toMatch(/\bDROP\s+TABLE\b/i);
    });

    it("TC-05b: should NOT contain DROP INDEX statements", () => {
      expect(migration006Content).not.toMatch(/\bDROP\s+INDEX\b/i);
    });

    it("TC-05c: should NOT contain DROP COLUMN statements", () => {
      expect(migration006Content).not.toMatch(/\bDROP\s+COLUMN\b/i);
    });

    it("TC-06: should NOT contain TRUNCATE or DELETE statements", () => {
      expect(migration006Content).not.toMatch(/\bTRUNCATE\b/i);
      expect(migration006Content).not.toMatch(/\bDELETE\b/i);
    });
  });

  // ==========================================================================
  // AC2: auth_provider column
  // ==========================================================================
  describe("AC2: auth_provider column", () => {
    it("TC-07: should ADD COLUMN auth_provider", () => {
      expect(migration006Content).toMatch(/ADD\s+COLUMN\s+auth_provider/i);
    });

    it("TC-08: auth_provider should be VARCHAR(20)", () => {
      expect(migration006Content).toMatch(/auth_provider\s+VARCHAR\(20\)/i);
    });

    it("TC-09: auth_provider should have NOT NULL DEFAULT 'local'", () => {
      // Check that both NOT NULL and DEFAULT 'local' appear in the auth_provider ADD COLUMN context
      const authProviderBlock = migration006Content.match(
        /ADD\s+COLUMN\s+auth_provider\s+VARCHAR\(20\)[^;]+/i
      );
      expect(authProviderBlock).not.toBeNull();
      if (authProviderBlock) {
        expect(authProviderBlock[0]).toMatch(/NOT\s+NULL/i);
        expect(authProviderBlock[0]).toMatch(/DEFAULT\s+'local'/i);
      }
    });

    it("TC-10: should have CHECK constraint for 'local' and 'google' values", () => {
      expect(migration006Content).toContain("CHECK");
      expect(migration006Content).toContain("'local'");
      expect(migration006Content).toContain("'google'");
    });

    it("TC-11: CHECK constraint should be named chk_auth_provider", () => {
      expect(migration006Content).toContain("chk_auth_provider");
    });

    it("TC-33: CHECK chk_auth_provider should allow exactly 2 values", () => {
      const checkMatch = migration006Content.match(
        /CONSTRAINT\s+chk_auth_provider\s+CHECK\s*\(\s*auth_provider\s+IN\s*\(([^)]+)\)\s*\)/i
      );
      expect(checkMatch).not.toBeNull();
      if (checkMatch) {
        const quotedValues = checkMatch[1].match(/'[^']+'/g);
        expect(quotedValues).not.toBeNull();
        expect(quotedValues!).toHaveLength(2);
        expect(quotedValues![0]).toBe("'local'");
        expect(quotedValues![1]).toBe("'google'");
      }
    });
  });

  // ==========================================================================
  // AC3: google_id column
  // ==========================================================================
  describe("AC3: google_id column", () => {
    it("TC-12: should ADD COLUMN google_id", () => {
      expect(migration006Content).toMatch(/ADD\s+COLUMN\s+google_id/i);
    });

    it("TC-13: google_id should be VARCHAR(255)", () => {
      expect(migration006Content).toMatch(/google_id\s+VARCHAR\(255\)/i);
    });

    it("TC-14: google_id should have UNIQUE enforcement (via unique index)", () => {
      // UNIQUE enforced by CREATE UNIQUE INDEX
      expect(migration006Content).toMatch(/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_users_google_id/i);
    });

    it("TC-14b: google_id column definition should NOT have inline UNIQUE (enforced by named index)", () => {
      // The ADD COLUMN should not have UNIQUE keyword — it's handled by the named index
      const addColumnBlock = migration006Content.match(
        /ADD\s+COLUMN\s+google_id\s+VARCHAR\(255\)[^;]*/i
      );
      expect(addColumnBlock).not.toBeNull();
      if (addColumnBlock) {
        expect(addColumnBlock[0]).not.toMatch(/\bUNIQUE\b/i);
      }
    });
  });

  // ==========================================================================
  // AC4: password_hash nullable + CHECK constraint
  // ==========================================================================
  describe("AC4: password_hash nullable", () => {
    it("TC-15: should ALTER password_hash DROP NOT NULL", () => {
      expect(migration006Content).toMatch(/password_hash\s+DROP\s+NOT\s+NULL/i);
    });

    it("TC-15b: should check is_nullable before dropping NOT NULL (idempotent)", () => {
      expect(migration006Content).toContain("is_nullable");
    });

    it("TC-16: should have CHECK constraint named chk_local_password", () => {
      expect(migration006Content).toContain("chk_local_password");
    });

    it("TC-17: chk_local_password should use logic: auth_provider != 'local' OR password_hash IS NOT NULL", () => {
      expect(migration006Content).toMatch(
        /auth_provider\s*!=\s*'local'\s+OR\s+password_hash\s+IS\s+NOT\s+NULL/i
      );
    });

    it("TC-34: CHECK chk_local_password should contain password_hash IS NOT NULL", () => {
      const checkBlock = migration006Content.match(
        /CONSTRAINT\s+chk_local_password\s+CHECK\s*\([^)]+\)/i
      );
      expect(checkBlock).not.toBeNull();
      if (checkBlock) {
        expect(checkBlock[0]).toMatch(/password_hash\s+IS\s+NOT\s+NULL/i);
      }
    });
  });

  // ==========================================================================
  // AC5: Index google_id
  // ==========================================================================
  describe("AC5: Index on google_id", () => {
    it("TC-18: should CREATE INDEX idx_users_google_id", () => {
      expect(migration006Content).toContain("idx_users_google_id");
    });

    it("TC-19: index should be on column google_id", () => {
      expect(migration006Content).toMatch(/idx_users_google_id\s+ON\s+users\s*\(\s*google_id\s*\)/i);
    });

    it("TC-20: should use IF NOT EXISTS for google_id index", () => {
      expect(migration006Content).toMatch(
        /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_users_google_id/i
      );
    });
  });

  // ==========================================================================
  // AC6: Index auth_provider
  // ==========================================================================
  describe("AC6: Index on auth_provider", () => {
    it("TC-21: should CREATE INDEX idx_users_auth_provider", () => {
      expect(migration006Content).toContain("idx_users_auth_provider");
    });

    it("TC-22: index should be on column auth_provider", () => {
      expect(migration006Content).toMatch(
        /idx_users_auth_provider\s+ON\s+users\s*\(\s*auth_provider\s*\)/i
      );
    });

    it("TC-23: should use IF NOT EXISTS for auth_provider index", () => {
      expect(migration006Content).toMatch(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_users_auth_provider/i
      );
    });
  });

  // ==========================================================================
  // AC7: No data impact (DDL only)
  // ==========================================================================
  describe("AC7: No data impact", () => {
    it("TC-24: should NOT contain INSERT statements", () => {
      expect(migration006Content).not.toMatch(/\bINSERT\b/i);
    });

    it("TC-25: should NOT contain standalone UPDATE statements", () => {
      const lines = migration006Content.split("\n");
      const standAloneUpdates = lines.filter(
        (line) =>
          /^\s*UPDATE\b/i.test(line) &&
          !line.trim().startsWith("--")
      );
      expect(standAloneUpdates).toHaveLength(0);
    });

    it("TC-26: DEFAULT 'local' ensures existing users automatically get auth_provider = 'local'", () => {
      expect(migration006Content).toMatch(/DEFAULT\s+'local'/i);
    });
  });

  // ==========================================================================
  // AC8: File ordering
  // ==========================================================================
  describe("AC8: File ordering", () => {
    it("TC-27: should sort alphabetically after 005_user_roles.sql", () => {
      const migrationsDir = resolve(__dirname, "../migrations");
      const files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      const idx005 = files.indexOf("005_user_roles.sql");
      const idx006 = files.indexOf("006_oauth_provider.sql");

      expect(idx005).toBeGreaterThanOrEqual(0);
      expect(idx006).toBeGreaterThanOrEqual(0);
      expect(idx006).toBeGreaterThan(idx005);
    });

    it("TC-28: migration files count should be exactly 6", () => {
      const migrationsDir = resolve(__dirname, "../migrations");
      const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
      expect(files).toHaveLength(6);
    });

    it("TC-29: all 6 migration files should exist in correct order", () => {
      const migrationsDir = resolve(__dirname, "../migrations");
      const files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      expect(files[0]).toBe("001_workflow_history.sql");
      expect(files[1]).toBe("002_workflow_events.sql");
      expect(files[2]).toBe("003_schema_enhancements.sql");
      expect(files[3]).toBe("004_users.sql");
      expect(files[4]).toBe("005_user_roles.sql");
      expect(files[5]).toBe("006_oauth_provider.sql");
    });
  });

  // ==========================================================================
  // Convention consistency
  // ==========================================================================
  describe("Convention consistency", () => {
    it("TC-30: should have header comment block", () => {
      expect(migration006Content).toMatch(/^--\s*=+/);
      expect(migration006Content).toContain("Migration 006");
    });

    it("TC-31: should mention idempotent in header comments", () => {
      const lowerContent = migration006Content.toLowerCase();
      const hasIdempotent = lowerContent.includes("idempotent");
      const hasIfNotExists = lowerContent.includes("if not exists");
      expect(hasIdempotent || hasIfNotExists).toBe(true);
    });

    it("TC-32: should only ALTER TABLE users (no new table creation)", () => {
      expect(migration006Content).not.toMatch(/CREATE\s+TABLE/i);
      const alterMatches = migration006Content.match(/ALTER\s+TABLE\s+(\w+)/gi);
      if (alterMatches) {
        alterMatches.forEach((match) => {
          expect(match).toMatch(/ALTER\s+TABLE\s+users/i);
        });
      }
    });

    it("should follow naming convention idx_{table}_{column} for indexes", () => {
      expect(migration006Content).toContain("idx_users_google_id");
      expect(migration006Content).toContain("idx_users_auth_provider");
    });
  });

  // ==========================================================================
  // Edge cases & Security
  // ==========================================================================
  describe("Edge cases & Security", () => {
    it("should NOT create a new table", () => {
      expect(migration006Content).not.toMatch(/CREATE\s+TABLE/i);
    });

    it("should NOT reference other tables with FOREIGN KEY", () => {
      expect(migration006Content).not.toMatch(/\bREFERENCES\b/i);
      expect(migration006Content).not.toMatch(/\bFOREIGN\s+KEY\b/i);
    });

    it("should use constraint_schema = 'public' when checking check_constraints", () => {
      expect(migration006Content).toMatch(/constraint_schema\s*=\s*'public'/i);
    });

    it("should use table_schema = 'public' when checking columns", () => {
      expect(migration006Content).toMatch(/table_schema\s*=\s*'public'/i);
    });
  });
});
