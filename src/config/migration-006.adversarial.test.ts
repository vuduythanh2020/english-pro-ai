/**
 * Adversarial Tests cho Migration 006: OAuth Provider Support
 * =============================================================
 * Tester Agent viết — kiểm tra sâu hơn các edge cases, logic SQL,
 * backward compatibility, và đảm bảo migration tuân thủ design doc.
 *
 * Các test nhóm:
 * 1. SQL Syntax & Structure Deep Validation
 * 2. Idempotent Pattern Verification (chi tiết hơn)
 * 3. Constraint Logic Correctness
 * 4. Backward Compatibility Checks
 * 5. Cross-Migration Consistency
 * 6. Security & Edge Cases
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Đọc migration files
const migrationsDir = resolve(__dirname, "../migrations");
const migration006Path = resolve(migrationsDir, "006_oauth_provider.sql");
const migration004Path = resolve(migrationsDir, "004_users.sql");
const migration005Path = resolve(migrationsDir, "005_user_roles.sql");

let sql006: string;
let sql004: string;
let sql005: string;

try {
  sql006 = readFileSync(migration006Path, "utf-8");
} catch {
  sql006 = "";
}
try {
  sql004 = readFileSync(migration004Path, "utf-8");
} catch {
  sql004 = "";
}
try {
  sql005 = readFileSync(migration005Path, "utf-8");
} catch {
  sql005 = "";
}

/**
 * Helper: Extract DO $$ ... END $$; blocks from SQL.
 * Chỉ match các DO $$ block thực tế (bắt đầu từ đầu dòng hoặc sau whitespace),
 * KHÔNG match "DO $$" xuất hiện trong comment (sau "--").
 *
 * Pattern: tìm "DO $$" ở đầu dòng (có thể có whitespace trước),
 * rồi lấy tất cả content đến "END $$" tiếp theo.
 */
function extractDoBlocks(sql: string): string[] {
  const blocks: string[] = [];
  // Xóa tất cả comment lines trước khi parse
  const lines = sql.split("\n");
  const cleanedLines = lines.map((line) => {
    const commentIdx = line.indexOf("--");
    if (commentIdx >= 0) {
      return line.substring(0, commentIdx);
    }
    return line;
  });
  const cleanedSql = cleanedLines.join("\n");

  // Match DO $$ ... END $$
  const regex = /DO\s+\$\$[\s\S]*?END\s+\$\$/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(cleanedSql)) !== null) {
    blocks.push(match[0]);
  }
  return blocks;
}

// Helper: Extract standalone SQL statements (outside DO $$ blocks)
function extractStandaloneStatements(sql: string): string[] {
  // Remove all DO $$ blocks first (including the trailing semicolon)
  let cleaned = sql.replace(/DO\s+\$\$[\s\S]*?END\s+\$\$;?/g, "");
  // Remove comments
  cleaned = cleaned.replace(/--[^\n]*/g, "");
  // Split by semicolons and filter empty
  return cleaned
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

describe("Adversarial: Migration 006 — OAuth Provider Support", () => {
  // ========================================================================
  // 1. SQL Structure Deep Validation
  // ========================================================================
  describe("1. SQL Structure Deep Validation", () => {
    it("should have exactly 5 DO $$ blocks", () => {
      const doBlocks = extractDoBlocks(sql006);
      expect(doBlocks).toHaveLength(5);
    });

    it("should have exactly 2 standalone CREATE INDEX statements", () => {
      const stmts = extractStandaloneStatements(sql006);
      const createIndexStmts = stmts.filter((s) =>
        /^CREATE\s+(UNIQUE\s+)?INDEX/i.test(s)
      );
      expect(createIndexStmts).toHaveLength(2);
    });

    it("DO $$ blocks should properly close with END $$", () => {
      const doBlocks = extractDoBlocks(sql006);
      for (const block of doBlocks) {
        expect(block).toMatch(/END\s+\$\$/);
      }
    });

    it("each DO $$ block should contain BEGIN...END", () => {
      const doBlocks = extractDoBlocks(sql006);
      for (const block of doBlocks) {
        expect(block).toMatch(/\bBEGIN\b/);
        expect(block).toMatch(/\bEND\b/);
      }
    });

    it("Block 1 (auth_provider) should be the first DO $$ block", () => {
      const doBlocks = extractDoBlocks(sql006);
      expect(doBlocks[0]).toContain("auth_provider");
      expect(doBlocks[0]).toContain("ADD COLUMN");
    });

    it("Block 2 (google_id) should be the second DO $$ block", () => {
      const doBlocks = extractDoBlocks(sql006);
      expect(doBlocks[1]).toContain("google_id");
      expect(doBlocks[1]).toContain("ADD COLUMN");
    });

    it("Block 3 (password_hash) should be the third DO $$ block", () => {
      const doBlocks = extractDoBlocks(sql006);
      expect(doBlocks[2]).toContain("password_hash");
      expect(doBlocks[2]).toContain("DROP NOT NULL");
    });

    it("Block 4 (chk_auth_provider) should be the fourth DO $$ block", () => {
      const doBlocks = extractDoBlocks(sql006);
      expect(doBlocks[3]).toContain("chk_auth_provider");
    });

    it("Block 5 (chk_local_password) should be the fifth DO $$ block", () => {
      const doBlocks = extractDoBlocks(sql006);
      expect(doBlocks[4]).toContain("chk_local_password");
    });
  });

  // ========================================================================
  // 2. Idempotent Pattern Verification (chi tiết)
  // ========================================================================
  describe("2. Idempotent Pattern Deep Verification", () => {
    it("Block 1 (auth_provider): should check information_schema.columns for auth_provider", () => {
      const doBlocks = extractDoBlocks(sql006);
      const block = doBlocks[0];
      expect(block).toContain("information_schema.columns");
      expect(block).toContain("column_name");
      expect(block).toContain("auth_provider");
    });

    it("Block 2 (google_id): should check information_schema.columns for google_id", () => {
      const doBlocks = extractDoBlocks(sql006);
      const block = doBlocks[1];
      expect(block).toContain("information_schema.columns");
      expect(block).toContain("column_name");
      expect(block).toContain("google_id");
    });

    it("Block 3 (password_hash): should SELECT is_nullable INTO variable and check = 'NO' before DROP NOT NULL", () => {
      const doBlocks = extractDoBlocks(sql006);
      const block = doBlocks[2];
      // Block SELECTs is_nullable INTO col_nullable, then checks col_nullable = 'NO'
      expect(block).toContain("is_nullable");
      expect(block).toContain("INTO");
      // The variable col_nullable is checked against 'NO'
      expect(block).toContain("= 'NO'");
    });

    it("Block 4 (chk_auth_provider): should check information_schema.check_constraints", () => {
      const doBlocks = extractDoBlocks(sql006);
      const block = doBlocks[3];
      expect(block).toContain("information_schema.check_constraints");
      expect(block).toContain("chk_auth_provider");
    });

    it("Block 5 (chk_local_password): should check information_schema.check_constraints", () => {
      const doBlocks = extractDoBlocks(sql006);
      const block = doBlocks[4];
      expect(block).toContain("information_schema.check_constraints");
      expect(block).toContain("chk_local_password");
    });

    it("All column check blocks (1, 2, 3) should filter by table_schema = 'public' AND table_name = 'users'", () => {
      const doBlocks = extractDoBlocks(sql006);
      // Blocks 0, 1, 2 check columns
      for (let i = 0; i <= 2; i++) {
        expect(doBlocks[i]).toContain("table_schema = 'public'");
        expect(doBlocks[i]).toContain("table_name = 'users'");
      }
    });

    it("Constraint check blocks (4, 5) should filter by constraint_schema = 'public'", () => {
      const doBlocks = extractDoBlocks(sql006);
      // Blocks 3, 4 check constraints
      for (let i = 3; i <= 4; i++) {
        expect(doBlocks[i]).toContain("constraint_schema = 'public'");
      }
    });
  });

  // ========================================================================
  // 3. Constraint Logic Correctness
  // ========================================================================
  describe("3. Constraint Logic Correctness", () => {
    it("chk_auth_provider should use IN() with exactly 'local' and 'google'", () => {
      const match = sql006.match(
        /CONSTRAINT\s+chk_auth_provider\s+CHECK\s*\(\s*auth_provider\s+IN\s*\(([^)]+)\)\s*\)/i
      );
      expect(match).not.toBeNull();
      if (match) {
        const values = match[1].split(",").map((v) => v.trim());
        expect(values).toHaveLength(2);
        expect(values).toContain("'local'");
        expect(values).toContain("'google'");
      }
    });

    it("chk_local_password should use implication logic pattern (A != 'local' OR B IS NOT NULL)", () => {
      const match = sql006.match(
        /CONSTRAINT\s+chk_local_password\s+CHECK\s*\(([^)]+)\)/i
      );
      expect(match).not.toBeNull();
      if (match) {
        const logic = match[1].trim();
        // Should be: auth_provider != 'local' OR password_hash IS NOT NULL
        expect(logic).toMatch(/auth_provider\s*!=\s*'local'/i);
        expect(logic).toMatch(/OR/i);
        expect(logic).toMatch(/password_hash\s+IS\s+NOT\s+NULL/i);
      }
    });

    it("chk_local_password logic should correctly encode: local → password required", () => {
      // The implication A → B is ¬A ∨ B
      // auth_provider = 'local' → password_hash IS NOT NULL
      // becomes: auth_provider != 'local' OR password_hash IS NOT NULL
      const match = sql006.match(
        /CONSTRAINT\s+chk_local_password\s+CHECK\s*\(([^)]+)\)/i
      );
      expect(match).not.toBeNull();
      if (match) {
        const logic = match[1];
        // Ensure it's NOT the inverted logic
        expect(logic).not.toMatch(/auth_provider\s*=\s*'local'\s+AND/i);
        expect(logic).not.toMatch(/password_hash\s+IS\s+NULL/i);
      }
    });

    it("google_id should be VARCHAR(255) — same as email and password_hash column sizes", () => {
      // Consistency check: migration 004 uses VARCHAR(255) for email and password_hash
      expect(sql004).toMatch(/email\s+VARCHAR\(255\)/i);
      expect(sql004).toMatch(/password_hash\s+VARCHAR\(255\)/i);
      expect(sql006).toMatch(/google_id\s+VARCHAR\(255\)/i);
    });
  });

  // ========================================================================
  // 4. Backward Compatibility Checks
  // ========================================================================
  describe("4. Backward Compatibility Checks", () => {
    it("auth_provider DEFAULT 'local' ensures existing users are not affected", () => {
      // When adding a NOT NULL column with DEFAULT, PostgreSQL sets all existing rows to DEFAULT
      expect(sql006).toMatch(/auth_provider\s+VARCHAR\(20\)\s+NOT\s+NULL\s+DEFAULT\s+'local'/i);
    });

    it("google_id should be nullable (no NOT NULL keyword in ADD COLUMN)", () => {
      const doBlocks = extractDoBlocks(sql006);
      const googleIdBlock = doBlocks[1];
      const addColLine = googleIdBlock.match(/ADD\s+COLUMN\s+google_id[^;]*/i);
      expect(addColLine).not.toBeNull();
      if (addColLine) {
        // Should NOT contain NOT NULL
        expect(addColLine[0]).not.toMatch(/\bNOT\s+NULL\b/i);
      }
    });

    it("password_hash DROP NOT NULL should come AFTER auth_provider DEFAULT 'local' (order matters for constraint)", () => {
      // Block 3 (password_hash) should come after Block 1 (auth_provider)
      const idx_auth = sql006.indexOf("ADD COLUMN auth_provider");
      const idx_password = sql006.indexOf("DROP NOT NULL");
      expect(idx_auth).toBeGreaterThan(-1);
      expect(idx_password).toBeGreaterThan(-1);
      expect(idx_password).toBeGreaterThan(idx_auth);
    });

    it("chk_local_password constraint should come AFTER password_hash DROP NOT NULL", () => {
      const idx_drop = sql006.indexOf("DROP NOT NULL");
      const idx_chk = sql006.indexOf("chk_local_password");
      expect(idx_drop).toBeGreaterThan(-1);
      expect(idx_chk).toBeGreaterThan(-1);
      expect(idx_chk).toBeGreaterThan(idx_drop);
    });

    it("createUser() in user.repository.ts does NOT INSERT auth_provider — DB DEFAULT handles it", () => {
      const repoPath = resolve(__dirname, "../api/auth/user.repository.ts");
      const repoContent = readFileSync(repoPath, "utf-8");

      // The INSERT query should NOT include auth_provider column
      const insertMatch = repoContent.match(/INSERT\s+INTO\s+users\s*\(([^)]+)\)/i);
      expect(insertMatch).not.toBeNull();
      if (insertMatch) {
        expect(insertMatch[1]).not.toContain("auth_provider");
        expect(insertMatch[1]).not.toContain("google_id");
      }
    });

    it("UserRow type does NOT include auth_provider or google_id yet (no breaking change to types)", () => {
      // US-01 is DDL only — types.ts should NOT be modified yet
      const typesPath = resolve(__dirname, "../api/auth/types.ts");
      const typesContent = readFileSync(typesPath, "utf-8");
      expect(typesContent).not.toContain("auth_provider");
      expect(typesContent).not.toContain("google_id");
    });
  });

  // ========================================================================
  // 5. Cross-Migration Consistency
  // ========================================================================
  describe("5. Cross-Migration Consistency", () => {
    it("migration 006 pattern should match migration 005 DO $$ pattern", () => {
      expect(sql005).toContain("DO $$");
      expect(sql005).toContain("information_schema");
      expect(sql006).toContain("DO $$");
      expect(sql006).toContain("information_schema");
    });

    it("migration 006 should reference table 'users' (same table as 004 and 005)", () => {
      expect(sql004).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+users/i);
      expect(sql005).toMatch(/ALTER\s+TABLE\s+users/i);
      expect(sql006).toMatch(/ALTER\s+TABLE\s+users/i);
    });

    it("index naming convention should be consistent across migrations", () => {
      // Migration 004: idx_users_email, idx_users_created_at
      expect(sql004).toContain("idx_users_email");
      expect(sql004).toContain("idx_users_created_at");
      // Migration 005: idx_users_role
      expect(sql005).toContain("idx_users_role");
      // Migration 006: idx_users_google_id, idx_users_auth_provider
      expect(sql006).toContain("idx_users_google_id");
      expect(sql006).toContain("idx_users_auth_provider");
    });

    it("constraint naming convention should be consistent across migrations", () => {
      // Migration 005: chk_users_role
      expect(sql005).toContain("chk_users_role");
      // Migration 006: chk_auth_provider, chk_local_password
      expect(sql006).toContain("chk_auth_provider");
      expect(sql006).toContain("chk_local_password");
    });

    it("all migration files should follow numeric prefix naming pattern", () => {
      const files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      for (const file of files) {
        expect(file).toMatch(/^\d{3}_[\w]+\.sql$/);
      }
    });

    it("migration file sizes should be reasonable (not empty, not huge)", () => {
      const files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      for (const file of files) {
        const content = readFileSync(resolve(migrationsDir, file), "utf-8");
        expect(content.length).toBeGreaterThan(50);
        expect(content.length).toBeLessThan(20000);
      }
    });
  });

  // ========================================================================
  // 6. Security & Edge Cases
  // ========================================================================
  describe("6. Security & Edge Cases", () => {
    it("should NOT contain GRANT, REVOKE or other permission statements", () => {
      expect(sql006).not.toMatch(/\bGRANT\b/i);
      expect(sql006).not.toMatch(/\bREVOKE\b/i);
    });

    it("should NOT contain raw string concatenation (SQL injection risk)", () => {
      expect(sql006).not.toMatch(/EXECUTE\s+'/i);
      expect(sql006).not.toContain("||");
    });

    it("should NOT use EXECUTE dynamic SQL", () => {
      expect(sql006).not.toMatch(/\bEXECUTE\b/i);
    });

    it("should NOT contain transaction control statements (let migration runner handle it)", () => {
      // Note: 'BEGIN' used in PL/pgSQL blocks is structural, not transaction control
      // Transaction control = standalone BEGIN; COMMIT; ROLLBACK;
      expect(sql006).not.toMatch(/\bCOMMIT\b/i);
      expect(sql006).not.toMatch(/\bROLLBACK\b/i);
    });

    it("should NOT alter any column other than password_hash", () => {
      const alterColumnMatches = sql006.match(/ALTER\s+COLUMN\s+(\w+)/gi);
      if (alterColumnMatches) {
        for (const match of alterColumnMatches) {
          expect(match).toMatch(/ALTER\s+COLUMN\s+password_hash/i);
        }
      }
    });

    it("google_id index should be UNIQUE (prevents duplicate Google accounts)", () => {
      expect(sql006).toMatch(/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_users_google_id/i);
    });

    it("auth_provider index should NOT be UNIQUE (multiple users can share same provider)", () => {
      const authProviderIndexMatch = sql006.match(
        /CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+idx_users_auth_provider/i
      );
      expect(authProviderIndexMatch).not.toBeNull();
      if (authProviderIndexMatch) {
        expect(authProviderIndexMatch[1]).toBeUndefined(); // No UNIQUE keyword
      }
    });

    it("auth_provider VARCHAR(20) should be large enough for current and future providers", () => {
      const match = sql006.match(/auth_provider\s+VARCHAR\((\d+)\)/i);
      expect(match).not.toBeNull();
      if (match) {
        const size = parseInt(match[1], 10);
        expect(size).toBeGreaterThanOrEqual(20);
      }
    });
  });

  // ========================================================================
  // 7. Dev Test File Completeness
  // ========================================================================
  describe("7. Dev Test File Completeness Verification", () => {
    it("migration-006.test.ts should exist and be the Dev's test file", () => {
      const devTestPath = resolve(__dirname, "migration-006.test.ts");
      expect(existsSync(devTestPath)).toBe(true);
    });

    it("Dev test file should cover all acceptance criteria (AC1-AC8)", () => {
      const devTestPath = resolve(__dirname, "migration-006.test.ts");
      const devTestContent = readFileSync(devTestPath, "utf-8");
      expect(devTestContent).toContain("AC1");
      expect(devTestContent).toContain("AC2");
      expect(devTestContent).toContain("AC3");
      expect(devTestContent).toContain("AC4");
      expect(devTestContent).toContain("AC5");
      expect(devTestContent).toContain("AC6");
      expect(devTestContent).toContain("AC7");
      expect(devTestContent).toContain("AC8");
    });

    it("migration-004.test.ts should use flexible count (toBeGreaterThanOrEqual)", () => {
      const test004Path = resolve(__dirname, "migration-004.test.ts");
      const content = readFileSync(test004Path, "utf-8");
      expect(content).toContain("toBeGreaterThanOrEqual");
    });

    it("migration-005.test.ts should use flexible count (toBeGreaterThanOrEqual)", () => {
      const test005Path = resolve(__dirname, "migration-005.test.ts");
      const content = readFileSync(test005Path, "utf-8");
      expect(content).toContain("toBeGreaterThanOrEqual");
    });
  });
});
