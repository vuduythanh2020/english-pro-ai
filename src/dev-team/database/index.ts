/**
 * Barrel export cho dev-team/database module
 * ============================================================================
 * Re-export tất cả types và repository functions để sử dụng từ bên ngoài.
 * Cập nhật cho US-01: thêm analytics types và functions mới.
 */

// Types — Entity interfaces
export type {
  WorkflowRunStatus,
  WorkflowPhaseName,
  WorkflowAgentName,
  WorkflowPhaseStatus,
  ApprovalType,
  ApprovalDecision,
  WorkflowEventType,
  WorkflowRun,
  WorkflowPhase,
  WorkflowApproval,
  WorkflowEvent,
  CreateWorkflowRunInput,
  CreateWorkflowPhaseInput,
  CompleteWorkflowPhaseInput,
  CreateWorkflowApprovalInput,
  CreateWorkflowEventInput,
  WorkflowRunMetadata,
  WorkflowPhaseMetadata,
  // Analytics types (MỚI — US-01 AC5)
  PhaseAvgDuration,
  ApprovalRateByPhase,
  RevisionCountPerRun,
  WorkflowAnalyticsSummary,
} from "./types.js";

// Constants
export {
  PHASE_AGENT_MAP,
  PHASE_APPROVAL_MAP,
  EVENT_TYPE_LABELS,
} from "./types.js";

// Repository functions
export {
  // Workflow Runs
  createWorkflowRun,
  updateWorkflowRunStatus,
  updateWorkflowRunMetadata,
  getWorkflowRunByThreadId,
  getWorkflowRunById,
  listWorkflowRuns,
  // Workflow Phases
  createWorkflowPhase,
  completeWorkflowPhase,
  updateWorkflowPhaseStatus,
  incrementPhaseRetryCount,
  getPhasesByWorkflowRunId,
  getLatestPhase,
  // Workflow Approvals
  createWorkflowApproval,
  getApprovalsByPhaseId,
  getApprovalsByWorkflowRunId,
  // Workflow Events
  createWorkflowEvent,
  getEventsByWorkflowRunId,
  getEventsByPhaseId,
  getEventsByType,
  getEventTimeline,
  // Stats & Queries (Legacy)
  getWorkflowStats,
  getPhaseRetryStats,
  getWorkflowRunDetail,
  // Analytics Queries (MỚI — US-01 AC4)
  getPhaseAvgDurations,
  getApprovalRates,
  getRevisionCountPerRun,
  getWorkflowAnalyticsSummary,
} from "./workflow-history.repository.js";

// Stats types (Legacy + MỚI)
export type {
  WorkflowStats,
  PhaseRetryStats,
  WorkflowRunDetail,
} from "./workflow-history.repository.js";
