-- ============================================================================
-- Migration 001: Workflow History Tables
-- ============================================================================
-- Tạo hệ thống bảng lưu lịch sử workflow Dev Team
-- Idempotent: sử dụng IF NOT EXISTS, safe to run multiple times
-- ============================================================================

-- ============================================================================
-- BẢNG 1: workflow_runs
-- Lưu thông tin mỗi lần chạy workflow
-- ============================================================================
CREATE TABLE IF NOT EXISTS workflow_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       VARCHAR(255) NOT NULL,
  feature_request TEXT NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'completed', 'failed')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  total_duration_ms BIGINT
);

-- Index trên các cột thường query
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs (status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_started_at ON workflow_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_thread_id ON workflow_runs (thread_id);

-- ============================================================================
-- BẢNG 2: workflow_phases
-- Lưu chi tiết từng phase trong một workflow run
-- ============================================================================
CREATE TABLE IF NOT EXISTS workflow_phases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id   UUID NOT NULL
                      REFERENCES workflow_runs(id) ON DELETE CASCADE,
  phase_name        VARCHAR(30) NOT NULL
                      CHECK (phase_name IN ('requirements', 'design', 'development', 'testing')),
  agent_name        VARCHAR(30) NOT NULL
                      CHECK (agent_name IN ('po', 'ba', 'dev', 'tester')),
  status            VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                      CHECK (status IN ('in_progress', 'completed', 'rejected', 'revised')),
  input_summary     TEXT,
  output_summary    TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  duration_ms       BIGINT
);

-- Index trên các cột thường query
CREATE INDEX IF NOT EXISTS idx_workflow_phases_run_id ON workflow_phases (workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_workflow_phases_phase_name ON workflow_phases (phase_name);
CREATE INDEX IF NOT EXISTS idx_workflow_phases_status ON workflow_phases (status);
CREATE INDEX IF NOT EXISTS idx_workflow_phases_started_at ON workflow_phases (started_at DESC);

-- ============================================================================
-- BẢNG 3: workflow_approvals
-- Lưu lịch sử duyệt/reject tại mỗi approval gate
-- ============================================================================
CREATE TABLE IF NOT EXISTS workflow_approvals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_phase_id   UUID NOT NULL
                        REFERENCES workflow_phases(id) ON DELETE CASCADE,
  approval_type       VARCHAR(30) NOT NULL
                        CHECK (approval_type IN (
                          'requirements_approval',
                          'design_approval',
                          'code_review',
                          'release_approval'
                        )),
  decision            VARCHAR(20) NOT NULL
                        CHECK (decision IN ('approved', 'rejected')),
  feedback            TEXT,
  decided_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index trên các cột thường query
CREATE INDEX IF NOT EXISTS idx_workflow_approvals_phase_id ON workflow_approvals (workflow_phase_id);
CREATE INDEX IF NOT EXISTS idx_workflow_approvals_decision ON workflow_approvals (decision);
CREATE INDEX IF NOT EXISTS idx_workflow_approvals_type ON workflow_approvals (approval_type);
CREATE INDEX IF NOT EXISTS idx_workflow_approvals_decided_at ON workflow_approvals (decided_at DESC);
