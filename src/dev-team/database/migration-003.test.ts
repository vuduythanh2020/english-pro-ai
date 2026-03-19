/**
 * Unit Tests cho Migration 003: Schema Enhancements
 * ==================================================
 * Kiểm tra nội dung file SQL migration đảm bảo:
 * - AC1: Thêm created_by, mở rộng status CHECK
 * - AC2: Thêm human_feedback, chuyển input/output → JSONB
 * - AC3: Composite indexes cho analytics
 * - Migration idempotent (IF NOT EXISTS, DO $$ blocks)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Đọc file migration 003
const migration003Path = resolve(__dirname, "../../migrations/003_schema_enhancements.sql");
let migration003Content: string;

try {
  migration003Content = readFileSync(migration003Path, "utf-8");
} catch {
  migration003Content = "";
}

describe("US-01: Migration 003 - Schema Enhancements", () => {
  it("migration file should exist and have content", () => {
    expect(migration003Content.length).toBeGreaterThan(0);
  });

  // ==========================================================================
  // AC1: workflow_runs.created_by
  // ==========================================================================
  describe("AC1: created_by column", () => {
    it("should add created_by column to workflow_runs", () => {
      expect(migration003Content).toContain("created_by");
      expect(migration003Content).toContain("VARCHAR(100)");
      expect(migration003Content).toContain("DEFAULT 'system'");
    });

    it("should check IF NOT EXISTS before adding column", () => {
      // Idempotent check
      expect(migration003Content).toContain("IF NOT EXISTS");
      expect(migration003Content).toContain("column_name = 'created_by'");
    });
  });

  // ==========================================================================
  // AC1: status CHECK constraint — thêm 'rejected'
  // ==========================================================================
  describe("AC1: status constraint with 'rejected'", () => {
    it("should include 'rejected' in workflow_runs status CHECK", () => {
      expect(migration003Content).toContain("'rejected'");
      expect(migration003Content).toContain("workflow_runs_status_check");
    });

    it("should DROP old constraint before adding new one", () => {
      expect(migration003Content).toContain("DROP CONSTRAINT");
      expect(migration003Content).toContain("ADD CONSTRAINT");
    });

    it("should include all 4 statuses in new constraint", () => {
      // The constraint should contain all 4 statuses
      expect(migration003Content).toContain("'running'");
      expect(migration003Content).toContain("'completed'");
      expect(migration003Content).toContain("'failed'");
      expect(migration003Content).toContain("'rejected'");
    });
  });

  // ==========================================================================
  // BR-06: completed_at constraint update
  // ==========================================================================
  describe("BR-06: completed_at CHECK constraint", () => {
    it("should update chk_workflow_runs_completed constraint", () => {
      expect(migration003Content).toContain("chk_workflow_runs_completed");
    });

    it("should allow completed_at NOT NULL when status is rejected", () => {
      // The new constraint should include 'rejected' in the list of statuses 
      // that allow completed_at to be NOT NULL
      const completedConstraintMatch = migration003Content.match(
        /chk_workflow_runs_completed[\s\S]*?CHECK[\s\S]*?'rejected'/
      );
      expect(completedConstraintMatch).not.toBeNull();
    });
  });

  // ==========================================================================
  // AC2: human_feedback column
  // ==========================================================================
  describe("AC2: human_feedback column", () => {
    it("should add human_feedback column to workflow_events", () => {
      expect(migration003Content).toContain("human_feedback");
      expect(migration003Content).toContain("TEXT");
    });

    it("should check IF NOT EXISTS before adding column", () => {
      expect(migration003Content).toContain("column_name = 'human_feedback'");
    });
  });

  // ==========================================================================
  // AC2: input_data / output_data TEXT → JSONB
  // ==========================================================================
  describe("AC2: TEXT → JSONB conversion", () => {
    it("should convert input_data from TEXT to JSONB", () => {
      expect(migration003Content).toContain("input_data");
      expect(migration003Content).toContain("JSONB");
      // Should check if current type is TEXT
      expect(migration003Content).toContain("data_type = 'text'");
    });

    it("should convert output_data from TEXT to JSONB", () => {
      expect(migration003Content).toContain("output_data");
    });

    it("should handle migration of existing data", () => {
      // Should use RENAME + ADD approach or direct ALTER TYPE
      expect(migration003Content).toContain("RENAME COLUMN");
      // Should handle JSON-valid and non-JSON text
      expect(migration003Content).toContain("to_jsonb");
    });
  });

  // ==========================================================================
  // AC3: Composite indexes for analytics
  // ==========================================================================
  describe("AC3: Composite indexes", () => {
    it("should create idx_workflow_events_phase_event_type", () => {
      expect(migration003Content).toContain("idx_workflow_events_phase_event_type");
      expect(migration003Content).toContain("(workflow_phase_id, event_type)");
    });

    it("should create idx_workflow_events_run_phase_type", () => {
      expect(migration003Content).toContain("idx_workflow_events_run_phase_type");
      expect(migration003Content).toContain("(workflow_run_id, workflow_phase_id, event_type)");
    });

    it("should create idx_workflow_runs_created_by", () => {
      expect(migration003Content).toContain("idx_workflow_runs_created_by");
    });

    it("should create idx_workflow_runs_status_started", () => {
      expect(migration003Content).toContain("idx_workflow_runs_status_started");
      expect(migration003Content).toContain("(status, started_at DESC)");
    });

    it("should create idx_workflow_phases_run_phase_status", () => {
      expect(migration003Content).toContain("idx_workflow_phases_run_phase_status");
      expect(migration003Content).toContain("(workflow_run_id, phase_name, status)");
    });

    it("should create idx_workflow_approvals_type_decision", () => {
      expect(migration003Content).toContain("idx_workflow_approvals_type_decision");
      expect(migration003Content).toContain("(approval_type, decision)");
    });

    it("should use IF NOT EXISTS for all indexes", () => {
      // Count CREATE INDEX IF NOT EXISTS occurrences
      const matches = migration003Content.match(/CREATE INDEX IF NOT EXISTS/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(6);
    });
  });

  // ==========================================================================
  // Idempotent checks
  // ==========================================================================
  describe("Idempotent migration", () => {
    it("should use DO $$ blocks for conditional operations", () => {
      const doBlocks = migration003Content.match(/DO \$\$/g);
      expect(doBlocks).not.toBeNull();
      expect(doBlocks!.length).toBeGreaterThanOrEqual(3); // At least 3 DO blocks
    });

    it("should not modify migration 001 or 002 files", () => {
      // This is a structural check — migration003 should be its own file
      expect(migration003Content).not.toContain("Migration 001");
      expect(migration003Content).not.toContain("Migration 002");
    });
  });
});

// ==========================================================================
// Schema.sql Reference Document Checks
// ==========================================================================
describe("US-01: schema.sql Reference Document", () => {
  const schemaPath = resolve(__dirname, "schema.sql");
  let schemaContent: string;

  try {
    schemaContent = readFileSync(schemaPath, "utf-8");
  } catch {
    schemaContent = "";
  }

  it("schema.sql should exist", () => {
    expect(schemaContent.length).toBeGreaterThan(0);
  });

  it("should include created_by in workflow_runs", () => {
    expect(schemaContent).toContain("created_by");
  });

  it("should include 'rejected' status in workflow_runs CHECK", () => {
    expect(schemaContent).toContain("'rejected'");
  });

  it("should define workflow_events with JSONB input_data/output_data", () => {
    // Schema should show JSONB for input_data and output_data  
    expect(schemaContent).toContain("JSONB");
    expect(schemaContent).toContain("input_data");
    expect(schemaContent).toContain("output_data");
  });

  it("should include human_feedback in workflow_events", () => {
    expect(schemaContent).toContain("human_feedback");
  });

  it("should define all 4 tables", () => {
    expect(schemaContent).toContain("workflow_runs");
    expect(schemaContent).toContain("workflow_phases");
    expect(schemaContent).toContain("workflow_approvals");
    expect(schemaContent).toContain("workflow_events");
  });
});
