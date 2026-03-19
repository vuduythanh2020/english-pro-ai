-- ============================================================================
-- Migration 002: Add workflow_events table + metadata columns + retry_count
-- ============================================================================
-- Bổ sung bảng workflow_events (append-only event log) và các cột mới
-- cho workflow_runs, workflow_phases, workflow_approvals
-- Idempotent: sử dụng IF NOT EXISTS và DO $$ blocks
-- ============================================================================

-- ============================================================================
-- BẢNG MỚI: workflow_events (Append-only event log)
-- Ghi nhận mọi sự kiện xảy ra trong workflow
-- ============================================================================
CREATE TABLE IF NOT EXISTS workflow_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id   UUID NOT NULL
                      REFERENCES workflow_runs(id) ON DELETE CASCADE,
  workflow_phase_id UUID
                      REFERENCES workflow_phases(id) ON DELETE SET NULL,
  event_type        VARCHAR(30) NOT NULL
                      CHECK (event_type IN (
                        'workflow_started',
                        'workflow_completed',
                        'workflow_failed',
                        'agent_start',
                        'agent_complete',
                        'approval_request',
                        'approved',
                        'rejected',
                        'feedback_given'
                      )),
  agent_name        VARCHAR(30)
                      CHECK (agent_name IS NULL OR agent_name IN ('po', 'ba', 'dev', 'tester')),
  input_data        TEXT,
  output_data       TEXT,
  duration_ms       BIGINT,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes cho workflow_events
CREATE INDEX IF NOT EXISTS idx_workflow_events_run_id ON workflow_events (workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_phase_id ON workflow_events (workflow_phase_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_event_type ON workflow_events (event_type);
CREATE INDEX IF NOT EXISTS idx_workflow_events_agent_name ON workflow_events (agent_name);
CREATE INDEX IF NOT EXISTS idx_workflow_events_created_at ON workflow_events (created_at DESC);

-- Composite index cho query phổ biến: lấy events của 1 run theo thời gian
CREATE INDEX IF NOT EXISTS idx_workflow_events_run_created
  ON workflow_events (workflow_run_id, created_at ASC);

-- ============================================================================
-- ALTER bảng workflow_phases: thêm retry_count và metadata
-- ============================================================================
DO $$
BEGIN
  -- Thêm cột retry_count nếu chưa có
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_phases' AND column_name = 'retry_count'
  ) THEN
    ALTER TABLE workflow_phases ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
  END IF;

  -- Thêm cột metadata nếu chưa có
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_phases' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE workflow_phases ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;
END $$;

-- ============================================================================
-- ALTER bảng workflow_runs: thêm metadata
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_runs' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE workflow_runs ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;
END $$;

-- ============================================================================
-- ALTER bảng workflow_approvals: thêm metadata
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_approvals' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE workflow_approvals ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;
END $$;
