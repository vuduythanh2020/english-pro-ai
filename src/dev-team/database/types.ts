/**
 * TypeScript types cho hệ thống Workflow History & Analytics
 * ============================================================================
 * Mapping 1:1 với PostgreSQL schema (sau migration 003):
 *   - workflow_runs       (+ created_by, status 'rejected')
 *   - workflow_phases
 *   - workflow_approvals
 *   - workflow_events     (+ human_feedback, input_data/output_data → JSONB)
 *
 * Bao gồm:
 *   - Entity interfaces (DB rows)
 *   - Input types (CREATE/UPDATE)
 *   - Analytics response types (Dashboard)
 *   - Metadata types (JSONB gợi ý)
 *   - Mapping helpers
 */

// ============================================================================
// Enum-like types (tương ứng CHECK constraints trong DB)
// ============================================================================

/** Trạng thái của một workflow run — bao gồm 'rejected' (AC1) */
export type WorkflowRunStatus = "running" | "completed" | "failed" | "rejected";

/** Tên phase trong workflow */
export type WorkflowPhaseName = "requirements" | "design" | "development" | "testing";

/** Tên agent tương ứng với mỗi phase */
export type WorkflowAgentName = "po" | "ba" | "dev" | "tester";

/** Trạng thái của một phase */
export type WorkflowPhaseStatus = "in_progress" | "completed" | "rejected" | "revised";

/** Loại approval gate */
export type ApprovalType =
  | "requirements_approval"
  | "design_approval"
  | "code_review"
  | "release_approval";

/** Quyết định tại approval gate */
export type ApprovalDecision = "approved" | "rejected";

/** Loại event trong workflow (append-only log) */
export type WorkflowEventType =
  | "workflow_started"
  | "workflow_completed"
  | "workflow_failed"
  | "agent_start"
  | "agent_complete"
  | "approval_request"
  | "approved"
  | "rejected"
  | "feedback_given";

// ============================================================================
// Entity Interfaces (tương ứng với các bảng trong DB)
// ============================================================================

/** Record trong bảng workflow_runs — cập nhật thêm created_by (AC1) */
export interface WorkflowRun {
  id: string;
  thread_id: string;
  feature_request: string;
  status: WorkflowRunStatus;
  created_by: string;
  started_at: Date;
  completed_at: Date | null;
  total_duration_ms: number | null;
  metadata: Record<string, unknown>;
}

/** Record trong bảng workflow_phases */
export interface WorkflowPhase {
  id: string;
  workflow_run_id: string;
  phase_name: WorkflowPhaseName;
  agent_name: WorkflowAgentName;
  status: WorkflowPhaseStatus;
  input_summary: string | null;
  output_summary: string | null;
  started_at: Date;
  completed_at: Date | null;
  duration_ms: number | null;
  retry_count: number;
  metadata: Record<string, unknown>;
}

/** Record trong bảng workflow_approvals */
export interface WorkflowApproval {
  id: string;
  workflow_phase_id: string;
  approval_type: ApprovalType;
  decision: ApprovalDecision;
  feedback: string | null;
  decided_at: Date;
  metadata: Record<string, unknown>;
}

/**
 * Record trong bảng workflow_events (append-only event log)
 * Cập nhật: input_data/output_data → JSONB, thêm human_feedback (AC2)
 */
export interface WorkflowEvent {
  id: string;
  workflow_run_id: string;
  workflow_phase_id: string | null;
  event_type: WorkflowEventType;
  agent_name: WorkflowAgentName | null;
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
  human_feedback: string | null;
  duration_ms: number | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

// ============================================================================
// Input types (dùng khi tạo mới record, không cần id và timestamps auto-gen)
// ============================================================================

/** Input để tạo workflow run mới — thêm created_by (AC1) */
export interface CreateWorkflowRunInput {
  thread_id: string;
  feature_request: string;
  created_by?: string;
  metadata?: Record<string, unknown>;
}

/** Input để tạo workflow phase mới */
export interface CreateWorkflowPhaseInput {
  workflow_run_id: string;
  phase_name: WorkflowPhaseName;
  agent_name: WorkflowAgentName;
  input_summary?: string;
  metadata?: Record<string, unknown>;
}

/** Input để cập nhật khi phase hoàn thành */
export interface CompleteWorkflowPhaseInput {
  output_summary?: string;
  metadata?: Record<string, unknown>;
}

/** Input để tạo workflow approval mới */
export interface CreateWorkflowApprovalInput {
  workflow_phase_id: string;
  approval_type: ApprovalType;
  decision: ApprovalDecision;
  feedback?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Input để tạo workflow event mới
 * Cập nhật: input_data/output_data → Record, thêm human_feedback (AC2)
 */
export interface CreateWorkflowEventInput {
  workflow_run_id: string;
  workflow_phase_id?: string;
  event_type: WorkflowEventType;
  agent_name?: WorkflowAgentName;
  input_data?: Record<string, unknown>;
  output_data?: Record<string, unknown>;
  human_feedback?: string;
  duration_ms?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Analytics Response Types (AC4, AC5 — cho Dashboard)
// ============================================================================

/** Thời gian trung bình mỗi phase */
export interface PhaseAvgDuration {
  phase_name: WorkflowPhaseName;
  avg_duration_ms: number;
  min_duration_ms: number;
  max_duration_ms: number;
  total_executions: number;
}

/** Tỷ lệ approve/reject theo loại approval gate */
export interface ApprovalRateByPhase {
  approval_type: ApprovalType;
  total_decisions: number;
  approved_count: number;
  rejected_count: number;
  approval_rate_percent: number;
}

/** Revision count cho mỗi workflow run */
export interface RevisionCountPerRun {
  workflow_run_id: string;
  feature_request: string;
  status: WorkflowRunStatus;
  total_revisions: number;
  revisions_by_phase: Record<string, number>;
}

/** Tổng quan Dashboard — Analytics Summary */
export interface WorkflowAnalyticsSummary {
  total_runs: number;
  running_count: number;
  completed_count: number;
  failed_count: number;
  rejected_count: number;
  avg_total_duration_ms: number | null;
  avg_phases_per_run: number;
  total_events: number;
  date_range: {
    earliest: Date | null;
    latest: Date | null;
  };
}

// ============================================================================
// Metadata types (cho JSONB columns — gợi ý cấu trúc, không bắt buộc)
// ============================================================================

/** Metadata mở rộng cho workflow_runs */
export interface WorkflowRunMetadata {
  total_story_points?: number;
  total_user_stories?: number;
  total_lines_of_code?: number;
  total_test_cases?: number;
  [key: string]: unknown;
}

/** Metadata mở rộng cho workflow_phases */
export interface WorkflowPhaseMetadata {
  story_points?: number;
  lines_of_code?: number;
  test_cases?: number;
  retry_reasons?: string[];
  [key: string]: unknown;
}

// ============================================================================
// Mapping helpers
// ============================================================================

/** Map từ phase name sang agent name */
export const PHASE_AGENT_MAP: Record<WorkflowPhaseName, WorkflowAgentName> = {
  requirements: "po",
  design: "ba",
  development: "dev",
  testing: "tester",
} as const;

/** Map từ phase name sang approval type */
export const PHASE_APPROVAL_MAP: Record<WorkflowPhaseName, ApprovalType> = {
  requirements: "requirements_approval",
  design: "design_approval",
  development: "code_review",
  testing: "release_approval",
} as const;

/** Map từ event type sang mô tả tiếng Việt (dùng cho logging/UI) */
export const EVENT_TYPE_LABELS: Record<WorkflowEventType, string> = {
  workflow_started: "Workflow bắt đầu",
  workflow_completed: "Workflow hoàn thành",
  workflow_failed: "Workflow thất bại",
  agent_start: "Agent bắt đầu xử lý",
  agent_complete: "Agent hoàn thành",
  approval_request: "Yêu cầu duyệt",
  approved: "Đã duyệt",
  rejected: "Bị từ chối",
  feedback_given: "Feedback từ PM",
} as const;
