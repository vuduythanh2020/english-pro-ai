/**
 * Event Logger — DRY helper cho Event Logging (append-only) trong Workflow
 * ============================================================================
 * Tách biệt khỏi tracking-helper.ts (Single Responsibility):
 * - tracking-helper.ts: Phase tracking (create phase + agent_start/agent_complete events)
 * - event-logger.ts: Workflow-level & approval-level events (workflow_started, approval_request, etc.)
 *
 * Design principles:
 * - BR-04: Graceful degradation — mọi lỗi DB chỉ log warning, KHÔNG throw
 * - BR-05: Guard clause — skip khi workflowRunId rỗng
 * - BR-01: Append-only — chỉ INSERT, KHÔNG UPDATE/DELETE
 * - BR-08: feedback_given chỉ ghi khi feedback text khác rỗng
 *
 * US-03: Tích hợp Event Logging xuyên suốt Workflow
 */

import { createWorkflowEvent } from "../database/workflow-history.repository.js";
import type {
  WorkflowEventType,
  WorkflowAgentName,
  ApprovalType,
} from "../database/types.js";
import { logger } from "../../utils/logger.js";

// ============================================================================
// Type definitions
// ============================================================================

/** Params chung cho mọi event logging call */
interface BaseEventParams {
  workflowRunId: string;
  workflowPhaseId?: string;
}

/** Params cho event workflow_started (AC1) */
interface WorkflowStartedParams extends BaseEventParams {
  featureRequest: string;
  threadId: string;
}

/** Params cho event workflow_completed */
interface WorkflowCompletedParams extends BaseEventParams {
  totalStories: number;
  totalDurationMs?: number;
}

/** Params cho event approval_request (AC3 — trước interrupt) */
interface ApprovalRequestParams extends BaseEventParams {
  approvalType: ApprovalType;
  agentName: WorkflowAgentName;
  contentPreview: string; // truncated to 300 chars
}

/** Params cho event approved/rejected (AC3 — sau interrupt) */
interface ApprovalDecisionEventParams extends BaseEventParams {
  approvalType: ApprovalType;
  decision: "approved" | "rejected";
  humanFeedback?: string;
}

// ============================================================================
// Core helper — private, wraps createWorkflowEvent with guard + graceful
// ============================================================================

/**
 * Ghi event an toàn vào workflow_events.
 * - Guard clause: skip khi workflowRunId rỗng (BR-05)
 * - Graceful degradation: catch lỗi DB, chỉ log warning (BR-04)
 * - Append-only: chỉ INSERT (BR-01)
 */
async function safeLogEvent(params: {
  workflowRunId: string;
  workflowPhaseId?: string;
  eventType: WorkflowEventType;
  agentName?: WorkflowAgentName;
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  humanFeedback?: string;
  durationMs?: number;
}): Promise<void> {
  // Guard clause (BR-05)
  if (!params.workflowRunId) {
    logger.warn(
      `⚠️ [EventLogger] Skipping ${params.eventType}: workflowRunId is empty`
    );
    return;
  }

  // Graceful degradation (BR-04)
  try {
    await createWorkflowEvent({
      workflow_run_id: params.workflowRunId,
      workflow_phase_id: params.workflowPhaseId,
      event_type: params.eventType,
      agent_name: params.agentName,
      input_data: params.inputData,
      output_data: params.outputData,
      human_feedback: params.humanFeedback,
      duration_ms: params.durationMs,
    });
    logger.debug(`📋 [EventLogger] ${params.eventType} logged`);
  } catch (error) {
    logger.warn(
      `⚠️ [EventLogger] Failed to log ${params.eventType} (graceful):`,
      error
    );
  }
}

// ============================================================================
// Public API — named exports cho từng loại event
// ============================================================================

/**
 * AC1: Ghi event khi workflow bắt đầu.
 * Gọi tại injectProjectContext, SAU khi createWorkflowRun() thành công.
 *
 * @param p - WorkflowStartedParams với featureRequest và threadId
 */
export async function logWorkflowStarted(
  p: WorkflowStartedParams
): Promise<void> {
  await safeLogEvent({
    workflowRunId: p.workflowRunId,
    eventType: "workflow_started",
    inputData: {
      feature_request: p.featureRequest,
      thread_id: p.threadId,
    },
  });
}

/**
 * Ghi event khi workflow hoàn thành (tất cả stories done).
 * Gọi tại usRouterNode, TRƯỚC khi updateWorkflowRunStatus("completed").
 *
 * @param p - WorkflowCompletedParams với totalStories
 */
export async function logWorkflowCompleted(
  p: WorkflowCompletedParams
): Promise<void> {
  await safeLogEvent({
    workflowRunId: p.workflowRunId,
    eventType: "workflow_completed",
    outputData: {
      total_stories: p.totalStories,
      total_duration_ms: p.totalDurationMs,
    },
  });
}

/**
 * AC3: Ghi event approval_request TRƯỚC khi gọi interrupt().
 * Đánh dấu thời điểm PM bắt đầu review nội dung.
 *
 * @param p - ApprovalRequestParams với approvalType, agentName, contentPreview
 */
export async function logApprovalRequest(
  p: ApprovalRequestParams
): Promise<void> {
  // Truncate content preview to 300 chars
  const preview = p.contentPreview?.slice(0, 300) || "(empty)";
  await safeLogEvent({
    workflowRunId: p.workflowRunId,
    workflowPhaseId: p.workflowPhaseId,
    eventType: "approval_request",
    agentName: p.agentName,
    inputData: {
      approval_type: p.approvalType,
      content_preview: preview,
    },
  });
}

/**
 * AC3: Ghi event approved/rejected SAU khi interrupt() trả về decision.
 * Nếu PM có feedback text → ghi thêm event feedback_given riêng (BR-08).
 *
 * @param p - ApprovalDecisionEventParams với decision và humanFeedback
 */
export async function logApprovalDecision(
  p: ApprovalDecisionEventParams
): Promise<void> {
  // Ghi event approved hoặc rejected
  await safeLogEvent({
    workflowRunId: p.workflowRunId,
    workflowPhaseId: p.workflowPhaseId,
    eventType: p.decision === "approved" ? "approved" : "rejected",
    humanFeedback: p.humanFeedback,
    inputData: {
      approval_type: p.approvalType,
    },
  });

  // BR-08: Ghi event feedback_given riêng nếu có feedback text
  if (p.humanFeedback && p.humanFeedback.trim().length > 0) {
    await safeLogEvent({
      workflowRunId: p.workflowRunId,
      workflowPhaseId: p.workflowPhaseId,
      eventType: "feedback_given",
      humanFeedback: p.humanFeedback,
    });
  }
}
