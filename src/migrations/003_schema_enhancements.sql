-- ============================================================================
-- Migration 003: Schema Enhancements cho Workflow History & Analytics
-- ============================================================================
-- Bổ sung các cột và indexes cần thiết cho US-01:
--   - workflow_runs.created_by (PM identifier)
--   - workflow_runs.status CHECK mở rộng thêm 'rejected'
--   - workflow_events.human_feedback (feedback PM riêng biệt)
--   - workflow_events.input_data & output_data chuyển từ TEXT → JSONB
--   - Composite indexes cho analytics queries
--
-- Idempotent: sử dụng IF NOT EXISTS và DO $$ blocks
-- Backward compatible: KHÔNG sửa migration 001/002
-- ============================================================================

-- ============================================================================
-- 1. Thêm cột created_by vào workflow_runs (AC1)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_runs' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE workflow_runs ADD COLUMN created_by VARCHAR(100) NOT NULL DEFAULT 'system';
  END IF;
END $$;

-- ============================================================================
-- 2. Mở rộng CHECK constraint cho workflow_runs.status (thêm 'rejected')
-- PostgreSQL không hỗ trợ ALTER CHECK trực tiếp → DROP + ADD
-- ============================================================================
DO $$
BEGIN
  -- Drop constraint cũ nếu tồn tại
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'workflow_runs_status_check'
  ) THEN
    ALTER TABLE workflow_runs DROP CONSTRAINT workflow_runs_status_check;
  END IF;

  -- Tạo constraint mới bao gồm 'rejected'
  ALTER TABLE workflow_runs ADD CONSTRAINT workflow_runs_status_check
    CHECK (status IN ('running', 'completed', 'failed', 'rejected'));
END $$;

-- ============================================================================
-- 3. Cập nhật CHECK constraint cho completed_at (BR-06)
-- completed_at chỉ NOT NULL khi status = completed | failed | rejected
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_workflow_runs_completed'
  ) THEN
    ALTER TABLE workflow_runs DROP CONSTRAINT chk_workflow_runs_completed;
  END IF;

  ALTER TABLE workflow_runs ADD CONSTRAINT chk_workflow_runs_completed CHECK (
    (status = 'running' AND completed_at IS NULL)
    OR (status IN ('completed', 'failed', 'rejected') AND completed_at IS NOT NULL)
  );
END $$;

-- ============================================================================
-- 4. Thêm cột human_feedback vào workflow_events (AC2)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_events' AND column_name = 'human_feedback'
  ) THEN
    ALTER TABLE workflow_events ADD COLUMN human_feedback TEXT;
  END IF;
END $$;

-- ============================================================================
-- 5. Chuyển input_data và output_data sang JSONB (AC2)
-- Migrate dữ liệu cũ: nếu text là JSON hợp lệ → cast, ngược lại wrap thành JSON string
-- ============================================================================
DO $$
BEGIN
  -- Chuyển input_data TEXT → JSONB
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_events'
      AND column_name = 'input_data'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE workflow_events RENAME COLUMN input_data TO input_data_old;
    ALTER TABLE workflow_events ADD COLUMN input_data JSONB;
    UPDATE workflow_events
    SET input_data = CASE
      WHEN input_data_old IS NULL THEN NULL
      WHEN input_data_old ~ '^\s*[\{\[]' THEN input_data_old::jsonb
      ELSE to_jsonb(input_data_old)
    END;
    ALTER TABLE workflow_events DROP COLUMN input_data_old;
  END IF;

  -- Chuyển output_data TEXT → JSONB
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_events'
      AND column_name = 'output_data'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE workflow_events RENAME COLUMN output_data TO output_data_old;
    ALTER TABLE workflow_events ADD COLUMN output_data JSONB;
    UPDATE workflow_events
    SET output_data = CASE
      WHEN output_data_old IS NULL THEN NULL
      WHEN output_data_old ~ '^\s*[\{\[]' THEN output_data_old::jsonb
      ELSE to_jsonb(output_data_old)
    END;
    ALTER TABLE workflow_events DROP COLUMN output_data_old;
  END IF;
END $$;

-- ============================================================================
-- 6. Composite indexes cho analytics queries (AC3)
-- ============================================================================

-- Index cho truy vấn: "tỷ lệ reject mỗi phase" (phase + event_type)
CREATE INDEX IF NOT EXISTS idx_workflow_events_phase_event_type
  ON workflow_events (workflow_phase_id, event_type);

-- Index cho truy vấn: "revision count mỗi run" (run + phase + event_type)
CREATE INDEX IF NOT EXISTS idx_workflow_events_run_phase_type
  ON workflow_events (workflow_run_id, workflow_phase_id, event_type);

-- Index cho lọc workflow theo PM identifier
CREATE INDEX IF NOT EXISTS idx_workflow_runs_created_by
  ON workflow_runs (created_by);

-- Composite index cho dashboard listing: status + thời gian
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status_started
  ON workflow_runs (status, started_at DESC);

-- Index cho truy vấn thống kê phase: run + phase + status
CREATE INDEX IF NOT EXISTS idx_workflow_phases_run_phase_status
  ON workflow_phases (workflow_run_id, phase_name, status);

-- Index cho analytics trên approvals: type + decision
CREATE INDEX IF NOT EXISTS idx_workflow_approvals_type_decision
  ON workflow_approvals (approval_type, decision);
