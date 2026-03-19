-- ============================================================================
-- WORKFLOW HISTORY DATABASE SCHEMA (Reference Document)
-- ============================================================================
-- Hệ thống ghi lịch sử & theo dõi workflow Dev Team
-- Bao gồm 4 bảng chính:
--   1. workflow_runs      — Thông tin mỗi lần chạy workflow
--   2. workflow_phases    — Từng phase (requirements/design/development/testing)
--   3. workflow_approvals — Lịch sử duyệt/reject tại approval gates
--   4. workflow_events    — Append-only event log chi tiết
--
-- Cập nhật US-01:
--   - workflow_runs: +created_by, status thêm 'rejected'
--   - workflow_events: +human_feedback, input_data/output_data → JSONB
--   - Composite indexes cho analytics queries
--
-- Sử dụng gen_random_uuid() (PostgreSQL 13+) cho primary key UUID
-- Mọi timestamp đều dùng TIMESTAMPTZ để đảm bảo nhất quán múi giờ
-- Metadata JSONB trên mọi bảng để linh hoạt mở rộng
-- ============================================================================

-- ============================================================================
-- BẢNG 1: workflow_runs
-- Lưu thông tin mỗi lần chạy workflow
-- ============================================================================
CREATE TABLE IF NOT EXISTS workflow_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id         VARCHAR(255) NOT NULL,
  feature_request   TEXT NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running', 'completed', 'failed', 'rejected')),
  created_by        VARCHAR(100) NOT NULL DEFAULT 'system',
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  total_duration_ms BIGINT,
  metadata          JSONB DEFAULT '{}',

  -- Constraints: completed_at chỉ NOT NULL khi status != 'running' (BR-06)
  CONSTRAINT chk_workflow_runs_completed CHECK (
    (status = 'running' AND completed_at IS NULL)
    OR (status IN ('completed', 'failed', 'rejected') AND completed_at IS NOT NULL)
  )
);

-- Index trên các cột thường query
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs (status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_started_at ON workflow_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_thread_id ON workflow_runs (thread_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_created_by ON workflow_runs (created_by);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status_started ON workflow_runs (status, started_at DESC);

-- ============================================================================
-- BẢNG 2: workflow_phases
-- Lưu chi tiết từng phase trong một workflow run
-- Mỗi phase có thể xuất hiện nhiều lần (khi bị reject và chạy lại — BR-05)
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
  duration_ms       BIGINT,
  retry_count       INTEGER NOT NULL DEFAULT 0,
  metadata          JSONB DEFAULT '{}'
);

-- Index trên các cột thường query
CREATE INDEX IF NOT EXISTS idx_workflow_phases_run_id ON workflow_phases (workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_workflow_phases_phase_name ON workflow_phases (phase_name);
CREATE INDEX IF NOT EXISTS idx_workflow_phases_status ON workflow_phases (status);
CREATE INDEX IF NOT EXISTS idx_workflow_phases_started_at ON workflow_phases (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_phases_run_phase_status ON workflow_phases (workflow_run_id, phase_name, status);

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
  decided_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata            JSONB DEFAULT '{}'
);

-- Index trên các cột thường query
CREATE INDEX IF NOT EXISTS idx_workflow_approvals_phase_id ON workflow_approvals (workflow_phase_id);
CREATE INDEX IF NOT EXISTS idx_workflow_approvals_decision ON workflow_approvals (decision);
CREATE INDEX IF NOT EXISTS idx_workflow_approvals_type ON workflow_approvals (approval_type);
CREATE INDEX IF NOT EXISTS idx_workflow_approvals_decided_at ON workflow_approvals (decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_approvals_type_decision ON workflow_approvals (approval_type, decision);

-- ============================================================================
-- BẢNG 4: workflow_events (Append-only event log — BR-01)
-- Ghi nhận mọi sự kiện xảy ra trong workflow
-- Không UPDATE, không DELETE — chỉ INSERT
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
  input_data        JSONB,
  output_data       JSONB,
  human_feedback    TEXT,
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

-- Composite indexes cho analytics queries (AC3)
CREATE INDEX IF NOT EXISTS idx_workflow_events_run_created
  ON workflow_events (workflow_run_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_workflow_events_phase_event_type
  ON workflow_events (workflow_phase_id, event_type);
CREATE INDEX IF NOT EXISTS idx_workflow_events_run_phase_type
  ON workflow_events (workflow_run_id, workflow_phase_id, event_type);
