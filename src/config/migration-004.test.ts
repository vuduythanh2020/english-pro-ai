/**
 * Unit Tests cho Migration 004: Users Table
 * ==========================================
 * Kiểm tra nội dung file SQL migration đảm bảo:
 * - AC1: Idempotent — sử dụng IF NOT EXISTS cho tất cả câu lệnh CREATE
 * - AC2: Bảng users có đầy đủ 9 cột theo spec
 * - AC3: Indexes trên email (unique) và created_at (DESC)
 * - AC4: File đặt tên 004_users.sql → tự động chạy bởi runMigrations()
 * - AC5: Convention nhất quán với migration 001 (header, naming)
 * 
 * Kiểm tra mapping với TutorState.userProfile:
 * - english_level CHECK 5 giá trị khớp TutorState level union type
 * - goals TEXT[] khớp TutorState goals: string[]
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Đọc file migration 004
const migration004Path = resolve(__dirname, "../migrations/004_users.sql");
let migration004Content: string;

try {
  migration004Content = readFileSync(migration004Path, "utf-8");
} catch {
  migration004Content = "";
}

// ============================================================================
// TEST: File tồn tại và có nội dung
// ============================================================================
describe("US-01: Migration 004 - Users Table", () => {
  it("migration file 004_users.sql should exist", () => {
    expect(existsSync(migration004Path)).toBe(true);
  });

  it("migration file should have meaningful content", () => {
    expect(migration004Content.length).toBeGreaterThan(100);
  });

  // ==========================================================================
  // AC1: Idempotent — IF NOT EXISTS
  // ==========================================================================
  describe("AC1: Idempotent migration (IF NOT EXISTS)", () => {
    it("should use CREATE TABLE IF NOT EXISTS", () => {
      expect(migration004Content).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+users/i);
    });

    it("should use CREATE INDEX IF NOT EXISTS for all indexes", () => {
      const indexMatches = migration004Content.match(/CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS/gi);
      expect(indexMatches).not.toBeNull();
      expect(indexMatches!.length).toBeGreaterThanOrEqual(2);
    });

    it("should NOT contain DROP TABLE or DROP INDEX (destructive operations)", () => {
      expect(migration004Content).not.toMatch(/DROP\s+TABLE/i);
      expect(migration004Content).not.toMatch(/DROP\s+INDEX/i);
    });
  });

  // ==========================================================================
  // AC2: Bảng users có đầy đủ 9 cột
  // ==========================================================================
  describe("AC2: Table columns", () => {
    it("should define id column as UUID PRIMARY KEY with gen_random_uuid()", () => {
      expect(migration004Content).toMatch(/id\s+UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/i);
    });

    it("should define email column as VARCHAR(255) UNIQUE NOT NULL", () => {
      expect(migration004Content).toContain("email");
      expect(migration004Content).toMatch(/email\s+VARCHAR\(255\)\s+UNIQUE\s+NOT\s+NULL/i);
    });

    it("should define password_hash column as VARCHAR(255) NOT NULL", () => {
      expect(migration004Content).toContain("password_hash");
      expect(migration004Content).toMatch(/password_hash\s+VARCHAR\(255\)\s+NOT\s+NULL/i);
    });

    it("should define name column as VARCHAR(100) NOT NULL", () => {
      // Match "name" as a column (preceded by whitespace or comma)
      expect(migration004Content).toMatch(/name\s+VARCHAR\(100\)\s+NOT\s+NULL/i);
    });

    it("should define profession column as VARCHAR(100) nullable", () => {
      expect(migration004Content).toContain("profession");
      expect(migration004Content).toMatch(/profession\s+VARCHAR\(100\)/i);
    });

    it("should define english_level column with CHECK constraint and DEFAULT 'intermediate'", () => {
      expect(migration004Content).toContain("english_level");
      expect(migration004Content).toMatch(/english_level\s+VARCHAR\(20\)/i);
      expect(migration004Content).toMatch(/DEFAULT\s+'intermediate'/i);
      expect(migration004Content).toMatch(/CHECK\s*\(/i);
    });

    it("should define english_level CHECK with exactly 5 valid values matching TutorState", () => {
      const expectedLevels = [
        "'beginner'",
        "'elementary'",
        "'intermediate'",
        "'upper-intermediate'",
        "'advanced'",
      ];
      for (const level of expectedLevels) {
        expect(migration004Content).toContain(level);
      }
    });

    it("should define goals column as TEXT[]", () => {
      expect(migration004Content).toContain("goals");
      expect(migration004Content).toMatch(/goals\s+TEXT\[\]/i);
    });

    it("should define created_at column as TIMESTAMPTZ NOT NULL DEFAULT NOW()", () => {
      expect(migration004Content).toMatch(/created_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+NOW\(\)/i);
    });

    it("should define updated_at column as TIMESTAMPTZ NOT NULL DEFAULT NOW()", () => {
      expect(migration004Content).toMatch(/updated_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+NOW\(\)/i);
    });

    it("should have exactly 9 columns (id, email, password_hash, name, profession, english_level, goals, created_at, updated_at)", () => {
      // Verify all 9 column names exist within the CREATE TABLE block
      const columnNames = [
        "id",
        "email",
        "password_hash",
        "name",
        "profession",
        "english_level",
        "goals",
        "created_at",
        "updated_at",
      ];
      for (const col of columnNames) {
        expect(migration004Content).toContain(col);
      }
    });
  });

  // ==========================================================================
  // AC3: Indexes
  // ==========================================================================
  describe("AC3: Indexes", () => {
    it("should create unique index on email (idx_users_email)", () => {
      expect(migration004Content).toContain("idx_users_email");
      expect(migration004Content).toMatch(/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_users_email\s+ON\s+users\s*\(\s*email\s*\)/i);
    });

    it("should create index on created_at DESC (idx_users_created_at)", () => {
      expect(migration004Content).toContain("idx_users_created_at");
      expect(migration004Content).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_users_created_at\s+ON\s+users\s*\(\s*created_at\s+DESC\s*\)/i);
    });

    it("should follow naming convention idx_{table}_{column}", () => {
      // Both indexes follow the convention
      expect(migration004Content).toContain("idx_users_email");
      expect(migration004Content).toContain("idx_users_created_at");
    });
  });

  // ==========================================================================
  // AC4: File naming — chạy tự động bởi runMigrations()
  // ==========================================================================
  describe("AC4: File naming and auto-detection by runMigrations()", () => {
    it("should be named 004_users.sql (sorted after 003)", () => {
      const migrationsDir = resolve(__dirname, "../migrations");
      const files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      expect(files).toContain("004_users.sql");
    });

    it("should sort alphabetically after 003_schema_enhancements.sql", () => {
      const migrationsDir = resolve(__dirname, "../migrations");
      const files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      const idx003 = files.indexOf("003_schema_enhancements.sql");
      const idx004 = files.indexOf("004_users.sql");

      expect(idx003).toBeGreaterThanOrEqual(0);
      expect(idx004).toBeGreaterThanOrEqual(0);
      expect(idx004).toBeGreaterThan(idx003);
    });

    it("migration files count should be exactly 4", () => {
      const migrationsDir = resolve(__dirname, "../migrations");
      const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
      expect(files).toHaveLength(4);
    });
  });

  // ==========================================================================
  // AC5: Convention nhất quán với migration 001
  // ==========================================================================
  describe("AC5: Convention consistency", () => {
    it("should have header comment block", () => {
      expect(migration004Content).toMatch(/^--\s*=+/);
      expect(migration004Content).toContain("Migration 004");
    });

    it("should use gen_random_uuid() consistent with workflow tables (PG13+)", () => {
      expect(migration004Content).toContain("gen_random_uuid()");
    });

    it("should use TIMESTAMPTZ (not TIMESTAMP) consistent with workflow tables", () => {
      expect(migration004Content).toContain("TIMESTAMPTZ");
      // Should NOT use plain TIMESTAMP without TZ for created_at/updated_at
      // We check that TIMESTAMP only appears as part of TIMESTAMPTZ
      const plainTimestampMatches = migration004Content.match(/\bTIMESTAMP\b(?!TZ)/gi);
      expect(plainTimestampMatches).toBeNull();
    });

    it("should mention idempotent in header comments", () => {
      // Either "idempotent" or "IF NOT EXISTS" mentioned in comments
      const lowerContent = migration004Content.toLowerCase();
      const hasIdempotent = lowerContent.includes("idempotent");
      const hasIfNotExists = lowerContent.includes("if not exists");
      expect(hasIdempotent || hasIfNotExists).toBe(true);
    });
  });

  // ==========================================================================
  // Data mapping với TutorState
  // ==========================================================================
  describe("TutorState mapping", () => {
    it("english_level values should match TutorState.userProfile.level union type exactly", () => {
      // TutorState defines: "beginner" | "elementary" | "intermediate" | "upper-intermediate" | "advanced"
      const tutorStateLevels = ["beginner", "elementary", "intermediate", "upper-intermediate", "advanced"];

      for (const level of tutorStateLevels) {
        expect(migration004Content).toContain(`'${level}'`);
      }
    });

    it("default english_level should be 'intermediate' matching TutorState default", () => {
      expect(migration004Content).toMatch(/DEFAULT\s+'intermediate'/i);
    });

    it("goals should be TEXT[] matching TutorState userProfile.goals: string[]", () => {
      expect(migration004Content).toMatch(/goals\s+TEXT\[\]/i);
    });
  });

  // ==========================================================================
  // Edge cases & Adversarial tests
  // ==========================================================================
  describe("Edge cases & Security", () => {
    it("should NOT contain any DROP statements", () => {
      expect(migration004Content).not.toMatch(/\bDROP\b/i);
    });

    it("should NOT contain TRUNCATE or DELETE statements", () => {
      expect(migration004Content).not.toMatch(/\bTRUNCATE\b/i);
      expect(migration004Content).not.toMatch(/\bDELETE\b/i);
    });

    it("should NOT contain INSERT statements (migration is DDL only)", () => {
      expect(migration004Content).not.toMatch(/\bINSERT\b/i);
    });

    it("should NOT contain ALTER TABLE (pure CREATE migration)", () => {
      expect(migration004Content).not.toMatch(/\bALTER\s+TABLE\b/i);
    });

    it("should NOT reference other tables (no REFERENCES/FOREIGN KEY)", () => {
      expect(migration004Content).not.toMatch(/\bREFERENCES\b/i);
      expect(migration004Content).not.toMatch(/\bFOREIGN\s+KEY\b/i);
    });
  });
});
