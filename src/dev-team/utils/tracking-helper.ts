/**
 * Tracking Helper — DRY utility cho Phase Tracking trong 4 agent nodes
 * ============================================================================
 * Tập trung logic ghi workflow phase tracking vào database,
 * tránh duplicate code giữa PO, BA, DEV, TESTER agents.
 *
 * Sử dụng trực tiếp repository functions từ ./database/workflow-history.repository.js
 * KHÔNG tạo repository mới (AC6).
 *
 * Graceful degradation (BR-04):
 * - Nếu DB lỗi → log warning, return phaseId = "", workflow tiếp tục bình thường
 * - Agent KHÔNG BAO GIỜ throw error vì tracking
 *
 * US-03 Enhancement:
 * - Mở rộng input_data / output_data trong agent_start / agent_complete events
 *   để kèm agent_name, workflow_phase_id, phase_name (AC2)
 */

import {
  createWorkflowPhase,
  completeWorkflowPhase,
  createWorkflowEvent,
} from "../database/workflow-history.repository.js";
import type {
  WorkflowPhaseName,
  WorkflowAgentName,
} from "../database/types.js";
import { logger } from "../../utils/logger.js";

// ============================================================================
// Types
// ============================================================================

/** Cấu hình để bắt đầu tracking 1 phase */
export interface PhaseTrackingConfig {
  workflowRunId: string;
  phaseName: WorkflowPhaseName;
  agentName: WorkflowAgentName;
  inputSummary: string;
}

/** Kết quả sau khi bắt đầu tracking */
export interface PhaseTrackingResult {
  /** UUID của phase record, hoặc "" nếu tracking fail (graceful degradation) */
  phaseId: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Truncate text tối đa `maxLen` ký tự (AC4).
 * Nếu vượt quá → cắt và thêm "... (truncated)".
 * Xử lý edge case: text rỗng hoặc undefined → return "(empty)".
 *
 * @param text - Chuỗi cần truncate
 * @param maxLen - Độ dài tối đa (mặc định 500)
 * @returns Chuỗi đã truncate
 */
export function truncateSummary(text: string | undefined | null, maxLen: number = 500): string {
  if (!text || text.trim().length === 0) {
    return "(empty)";
  }
  if (text.length <= maxLen) {
    return text;
  }
  return text.slice(0, maxLen) + "... (truncated)";
}

// ============================================================================
// Phase Tracking Functions
// ============================================================================

/**
 * Bắt đầu tracking phase mới cho agent (AC1, AC2, AC3, AC5).
 *
 * - Guard clause: skip nếu workflowRunId rỗng (AC2)
 * - Luôn tạo record MỚI (BR-05, AC5) — không check humanFeedback
 * - Ghi event "agent_start" kèm input summary + agent metadata (US-03 AC2)
 * - Wrap toàn bộ trong try/catch (BR-04 graceful degradation)
 *
 * @param config - PhaseTrackingConfig với workflowRunId, phaseName, agentName, inputSummary
 * @returns PhaseTrackingResult với phaseId (hoặc "" nếu fail)
 */
export async function startPhaseTracking(
  config: PhaseTrackingConfig
): Promise<PhaseTrackingResult> {
  // Guard clause (AC2): skip nếu workflowRunId rỗng
  if (!config.workflowRunId) {
    logger.warn(`⚠️ [PhaseTracking] Skipping tracking: workflowRunId is empty`);
    return { phaseId: "" };
  }

  try {
    // Truncate input summary (AC4)
    const truncatedInput = truncateSummary(config.inputSummary);

    // Tạo phase record MỚI (AC1, AC5 — luôn CREATE, không UPDATE)
    const phase = await createWorkflowPhase({
      workflow_run_id: config.workflowRunId,
      phase_name: config.phaseName,
      agent_name: config.agentName,
      input_summary: truncatedInput,
    });

    if (!phase) {
      logger.warn(
        `⚠️ [PhaseTracking] DB error during phase creation (graceful degradation): ` +
        `${config.agentName}/${config.phaseName}`
      );
      return { phaseId: "" };
    }

    const phaseId = phase.id;

    // Ghi event "agent_start" — US-03 AC2: bổ sung agent_name, workflow_phase_id, phase_name
    await createWorkflowEvent({
      workflow_run_id: config.workflowRunId,
      workflow_phase_id: phaseId,
      event_type: "agent_start",
      agent_name: config.agentName,
      input_data: {
        summary: truncatedInput,
        agent_name: config.agentName,
        workflow_phase_id: phaseId,
        phase_name: config.phaseName,
      },
    });

    logger.info(
      `📊 [PhaseTracking] ${config.agentName.toUpperCase()} Agent started phase: ` +
      `${config.phaseName} (phaseId: ${phaseId})`
    );

    return { phaseId };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.warn(
      `⚠️ [PhaseTracking] DB error during phase tracking (graceful degradation): ${errMsg}`
    );
    return { phaseId: "" };
  }
}

/**
 * Hoàn thành tracking phase cho agent (AC1, AC2, AC4).
 *
 * - Guard clause: skip nếu phaseId hoặc workflowRunId rỗng (AC2)
 * - Gọi completeWorkflowPhase() để update status + output_summary
 * - Ghi event "agent_complete" kèm output summary + agent metadata (US-03 AC2)
 * - Wrap toàn bộ trong try/catch (BR-04)
 *
 * @param workflowRunId - UUID của workflow run
 * @param phaseId - UUID của phase (từ startPhaseTracking)
 * @param agentName - Tên agent
 * @param outputSummary - Tóm tắt output (sẽ được truncate 500 ký tự)
 */
export async function completePhaseTracking(
  workflowRunId: string,
  phaseId: string,
  agentName: WorkflowAgentName,
  outputSummary: string
): Promise<void> {
  // Guard clause: skip nếu phaseId hoặc workflowRunId rỗng
  if (!phaseId || !workflowRunId) {
    return;
  }

  try {
    // Truncate output summary (AC4)
    const truncatedOutput = truncateSummary(outputSummary);

    // Đánh dấu phase hoàn thành (BR-02: duration_ms tính tự động trong DB)
    await completeWorkflowPhase(phaseId, {
      output_summary: truncatedOutput,
    });

    // Ghi event "agent_complete" — US-03 AC2: bổ sung agent_name, workflow_phase_id
    await createWorkflowEvent({
      workflow_run_id: workflowRunId,
      workflow_phase_id: phaseId,
      event_type: "agent_complete",
      agent_name: agentName,
      output_data: {
        summary: truncatedOutput,
        agent_name: agentName,
        workflow_phase_id: phaseId,
      },
    });

    logger.info(
      `📊 [PhaseTracking] ${agentName.toUpperCase()} Agent completed phase (phaseId: ${phaseId})`
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.warn(
      `⚠️ [PhaseTracking] DB error during complete tracking (graceful degradation): ${errMsg}`
    );
    // KHÔNG throw — workflow tiếp tục bình thường (BR-04)
  }
}
