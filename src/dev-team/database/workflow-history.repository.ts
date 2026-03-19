/**
 * Workflow History Repository
 * ============================================================================
 * Cung cấp các hàm CRUD để tương tác với 4 bảng workflow history trong PostgreSQL:
 *   - workflow_runs       (+ created_by, status 'rejected')
 *   - workflow_phases
 *   - workflow_approvals
 *   - workflow_events     (+ human_feedback, JSONB input/output)
 *
 * Cập nhật cho US-01:
 *   - createWorkflowRun() → thêm created_by
 *   - createWorkflowEvent() → thêm human_feedback, JSONB input/output
 *   - updateWorkflowRunStatus() → hỗ trợ 'rejected'
 *   - getPhaseAvgDurations() — THÊM MỚI (AC4)
 *   - getApprovalRates() — THÊM MỚI (AC4)
 *   - getRevisionCountPerRun() — THÊM MỚI (AC4)
 *   - getWorkflowAnalyticsSummary() — THÊM MỚI (AC4)
 *
 * Design decisions:
 * - Mỗi hàm sử dụng pool.query() trực tiếp (không cần transaction cho single INSERT/UPDATE)
 * - Trả về entity đã tạo/cập nhật (RETURNING *)
 * - Sử dụng parameterized queries để chống SQL injection
 * - Graceful degradation: nếu DB lỗi, log warning và tiếp tục (không crash workflow) (BR-04)
 * - Events là append-only: KHÔNG UPDATE, KHÔNG DELETE (BR-01)
 */

import { pool } from "../../config/database.config.js";
import { logger } from "../../utils/logger.js";
import type {
  WorkflowRun,
  WorkflowPhase,
  WorkflowApproval,
  WorkflowEvent,
  CreateWorkflowRunInput,
  CreateWorkflowPhaseInput,
  CompleteWorkflowPhaseInput,
  CreateWorkflowApprovalInput,
  CreateWorkflowEventInput,
  WorkflowRunStatus,
  WorkflowPhaseStatus,
  PhaseAvgDuration,
  ApprovalRateByPhase,
  RevisionCountPerRun,
  WorkflowAnalyticsSummary,
} from "./types.js";

// ============================================================================
// WORKFLOW RUNS
// ============================================================================

/**
 * Tạo một workflow run mới khi PM bắt đầu workflow
 * @param input - thread_id, feature_request, created_by và metadata tùy chọn
 * @returns WorkflowRun đã tạo hoặc null nếu lỗi (BR-04)
 */
export async function createWorkflowRun(
  input: CreateWorkflowRunInput
): Promise<WorkflowRun | null> {
  try {
    const metadata = input.metadata ? JSON.stringify(input.metadata) : "{}";
    const createdBy = input.created_by || "system";
    const result = await pool.query<WorkflowRun>(
      `INSERT INTO workflow_runs (thread_id, feature_request, status, created_by, started_at, metadata)
       VALUES ($1, $2, 'running', $3, NOW(), $4::jsonb)
       RETURNING *`,
      [input.thread_id, input.feature_request, createdBy, metadata]
    );
    logger.info(`📊 [WorkflowHistory] Created workflow run: ${result.rows[0].id}`);
    return result.rows[0];
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to create workflow run:", error);
    return null;
  }
}

/**
 * Cập nhật trạng thái workflow run (completed, failed, hoặc rejected)
 * Tính toán total_duration_ms tự động (BR-02)
 * @param workflowRunId - UUID của workflow run
 * @param status - 'completed', 'failed' hoặc 'rejected'
 * @returns WorkflowRun đã cập nhật hoặc null nếu lỗi
 */
export async function updateWorkflowRunStatus(
  workflowRunId: string,
  status: Extract<WorkflowRunStatus, "completed" | "failed" | "rejected">
): Promise<WorkflowRun | null> {
  try {
    const result = await pool.query<WorkflowRun>(
      `UPDATE workflow_runs
       SET status = $1,
           completed_at = NOW(),
           total_duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
       WHERE id = $2
       RETURNING *`,
      [status, workflowRunId]
    );

    if (result.rows.length === 0) {
      logger.warn(`⚠️ [WorkflowHistory] Workflow run not found: ${workflowRunId}`);
      return null;
    }

    logger.info(
      `📊 [WorkflowHistory] Workflow run ${workflowRunId} → ${status} (${result.rows[0].total_duration_ms}ms)`
    );
    return result.rows[0];
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to update workflow run status:", error);
    return null;
  }
}

/**
 * Cập nhật metadata JSONB của workflow run (merge vào metadata hiện tại)
 * @param workflowRunId - UUID của workflow run
 * @param metadata - Object metadata cần merge
 * @returns WorkflowRun đã cập nhật hoặc null
 */
export async function updateWorkflowRunMetadata(
  workflowRunId: string,
  metadata: Record<string, unknown>
): Promise<WorkflowRun | null> {
  try {
    const result = await pool.query<WorkflowRun>(
      `UPDATE workflow_runs
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(metadata), workflowRunId]
    );

    if (result.rows.length === 0) {
      logger.warn(`⚠️ [WorkflowHistory] Workflow run not found for metadata update: ${workflowRunId}`);
      return null;
    }

    logger.info(`📊 [WorkflowHistory] Updated metadata for workflow run: ${workflowRunId}`);
    return result.rows[0];
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to update workflow run metadata:", error);
    return null;
  }
}

/**
 * Lấy workflow run theo thread_id
 * @param threadId - thread_id của LangGraph
 * @returns WorkflowRun hoặc null
 */
export async function getWorkflowRunByThreadId(
  threadId: string
): Promise<WorkflowRun | null> {
  try {
    const result = await pool.query<WorkflowRun>(
      `SELECT * FROM workflow_runs WHERE thread_id = $1 ORDER BY started_at DESC LIMIT 1`,
      [threadId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to get workflow run by thread_id:", error);
    return null;
  }
}

/**
 * Lấy workflow run theo ID
 * @param id - UUID của workflow run
 * @returns WorkflowRun hoặc null
 */
export async function getWorkflowRunById(
  id: string
): Promise<WorkflowRun | null> {
  try {
    const result = await pool.query<WorkflowRun>(
      `SELECT * FROM workflow_runs WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to get workflow run:", error);
    return null;
  }
}

/**
 * Liệt kê tất cả workflow runs, mới nhất trước
 * @param limit - Số lượng tối đa
 * @param offset - Vị trí bắt đầu (phân trang)
 * @returns Mảng WorkflowRun
 */
export async function listWorkflowRuns(
  limit: number = 20,
  offset: number = 0
): Promise<WorkflowRun[]> {
  try {
    const result = await pool.query<WorkflowRun>(
      `SELECT * FROM workflow_runs ORDER BY started_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to list workflow runs:", error);
    return [];
  }
}

// ============================================================================
// WORKFLOW PHASES
// ============================================================================

/**
 * Tạo phase mới khi agent bắt đầu xử lý (BR-05: tạo record MỚI, không update record cũ)
 * @param input - Thông tin phase (workflow_run_id, phase_name, agent_name, input_summary, metadata)
 * @returns WorkflowPhase đã tạo hoặc null nếu lỗi
 */
export async function createWorkflowPhase(
  input: CreateWorkflowPhaseInput
): Promise<WorkflowPhase | null> {
  try {
    const metadata = input.metadata ? JSON.stringify(input.metadata) : "{}";
    const result = await pool.query<WorkflowPhase>(
      `INSERT INTO workflow_phases (workflow_run_id, phase_name, agent_name, status, input_summary, started_at, retry_count, metadata)
       VALUES ($1, $2, $3, 'in_progress', $4, NOW(), 0, $5::jsonb)
       RETURNING *`,
      [
        input.workflow_run_id,
        input.phase_name,
        input.agent_name,
        input.input_summary || null,
        metadata,
      ]
    );
    logger.info(
      `📊 [WorkflowHistory] Phase started: ${input.phase_name} (agent: ${input.agent_name})`
    );
    return result.rows[0];
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to create workflow phase:", error);
    return null;
  }
}

/**
 * Đánh dấu phase hoàn thành, tính duration_ms tự động (BR-02)
 * @param phaseId - UUID của phase
 * @param input - output_summary và metadata tùy chọn
 * @returns WorkflowPhase đã cập nhật hoặc null
 */
export async function completeWorkflowPhase(
  phaseId: string,
  input: CompleteWorkflowPhaseInput
): Promise<WorkflowPhase | null> {
  try {
    // Nếu có metadata bổ sung, merge vào
    const metadataClause = input.metadata
      ? `, metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb`
      : "";
    const params: unknown[] = [input.output_summary || null, phaseId];
    if (input.metadata) {
      params.push(JSON.stringify(input.metadata));
    }

    const result = await pool.query<WorkflowPhase>(
      `UPDATE workflow_phases
       SET status = 'completed',
           output_summary = $1,
           completed_at = NOW(),
           duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
           ${metadataClause}
       WHERE id = $2
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      logger.warn(`⚠️ [WorkflowHistory] Phase not found: ${phaseId}`);
      return null;
    }

    logger.info(
      `📊 [WorkflowHistory] Phase completed: ${result.rows[0].phase_name} (${result.rows[0].duration_ms}ms)`
    );
    return result.rows[0];
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to complete workflow phase:", error);
    return null;
  }
}

/**
 * Cập nhật trạng thái phase (rejected, revised, etc.)
 * Nếu status = 'rejected', tự động tăng retry_count +1 (BR-03)
 * @param phaseId - UUID của phase
 * @param status - Trạng thái mới
 * @returns WorkflowPhase đã cập nhật hoặc null
 */
export async function updateWorkflowPhaseStatus(
  phaseId: string,
  status: WorkflowPhaseStatus
): Promise<WorkflowPhase | null> {
  try {
    // Nếu bị rejected, tăng retry_count luôn trong cùng query (BR-03)
    const retryClause = status === "rejected"
      ? ", retry_count = retry_count + 1"
      : "";

    const result = await pool.query<WorkflowPhase>(
      `UPDATE workflow_phases
       SET status = $1
           ${retryClause}
       WHERE id = $2
       RETURNING *`,
      [status, phaseId]
    );

    if (result.rows.length === 0) {
      logger.warn(`⚠️ [WorkflowHistory] Phase not found for status update: ${phaseId}`);
      return null;
    }

    logger.info(`📊 [WorkflowHistory] Phase ${phaseId} → ${status}`);
    return result.rows[0];
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to update phase status:", error);
    return null;
  }
}

/**
 * Tăng retry_count của phase lên 1
 * @param phaseId - UUID của phase
 * @returns WorkflowPhase đã cập nhật hoặc null
 */
export async function incrementPhaseRetryCount(
  phaseId: string
): Promise<WorkflowPhase | null> {
  try {
    const result = await pool.query<WorkflowPhase>(
      `UPDATE workflow_phases
       SET retry_count = retry_count + 1
       WHERE id = $1
       RETURNING *`,
      [phaseId]
    );

    if (result.rows.length === 0) {
      logger.warn(`⚠️ [WorkflowHistory] Phase not found for retry increment: ${phaseId}`);
      return null;
    }

    logger.info(
      `📊 [WorkflowHistory] Phase ${phaseId} retry_count → ${result.rows[0].retry_count}`
    );
    return result.rows[0];
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to increment phase retry count:", error);
    return null;
  }
}

/**
 * Lấy tất cả phases của một workflow run
 * @param workflowRunId - UUID của workflow run
 * @returns Mảng WorkflowPhase theo thứ tự thời gian
 */
export async function getPhasesByWorkflowRunId(
  workflowRunId: string
): Promise<WorkflowPhase[]> {
  try {
    const result = await pool.query<WorkflowPhase>(
      `SELECT * FROM workflow_phases
       WHERE workflow_run_id = $1
       ORDER BY started_at ASC`,
      [workflowRunId]
    );
    return result.rows;
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to get phases:", error);
    return [];
  }
}

/**
 * Lấy phase gần nhất (completed hoặc in_progress) của một workflow run
 * Dùng để xác định phase_id khi tạo approval record
 * @param workflowRunId - UUID của workflow run
 * @returns WorkflowPhase hoặc null
 */
export async function getLatestPhase(
  workflowRunId: string
): Promise<WorkflowPhase | null> {
  try {
    const result = await pool.query<WorkflowPhase>(
      `SELECT * FROM workflow_phases
       WHERE workflow_run_id = $1
       ORDER BY started_at DESC
       LIMIT 1`,
      [workflowRunId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to get latest phase:", error);
    return null;
  }
}

// ============================================================================
// WORKFLOW APPROVALS
// ============================================================================

/**
 * Ghi nhận quyết định approval/reject
 * @param input - Thông tin approval (phase_id, type, decision, feedback, metadata)
 * @returns WorkflowApproval đã tạo hoặc null
 */
export async function createWorkflowApproval(
  input: CreateWorkflowApprovalInput
): Promise<WorkflowApproval | null> {
  try {
    const metadata = input.metadata ? JSON.stringify(input.metadata) : "{}";
    const result = await pool.query<WorkflowApproval>(
      `INSERT INTO workflow_approvals (workflow_phase_id, approval_type, decision, feedback, decided_at, metadata)
       VALUES ($1, $2, $3, $4, NOW(), $5::jsonb)
       RETURNING *`,
      [
        input.workflow_phase_id,
        input.approval_type,
        input.decision,
        input.feedback || null,
        metadata,
      ]
    );
    logger.info(
      `📊 [WorkflowHistory] Approval recorded: ${input.approval_type} → ${input.decision}`
    );
    return result.rows[0];
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to create approval:", error);
    return null;
  }
}

/**
 * Lấy tất cả approvals của một phase
 * @param phaseId - UUID của phase
 * @returns Mảng WorkflowApproval
 */
export async function getApprovalsByPhaseId(
  phaseId: string
): Promise<WorkflowApproval[]> {
  try {
    const result = await pool.query<WorkflowApproval>(
      `SELECT * FROM workflow_approvals
       WHERE workflow_phase_id = $1
       ORDER BY decided_at ASC`,
      [phaseId]
    );
    return result.rows;
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to get approvals:", error);
    return [];
  }
}

/**
 * Lấy tất cả approvals của một workflow run (JOIN qua workflow_phases)
 * @param workflowRunId - UUID của workflow run
 * @returns Mảng WorkflowApproval
 */
export async function getApprovalsByWorkflowRunId(
  workflowRunId: string
): Promise<WorkflowApproval[]> {
  try {
    const result = await pool.query<WorkflowApproval>(
      `SELECT wa.* FROM workflow_approvals wa
       JOIN workflow_phases wp ON wa.workflow_phase_id = wp.id
       WHERE wp.workflow_run_id = $1
       ORDER BY wa.decided_at ASC`,
      [workflowRunId]
    );
    return result.rows;
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to get approvals for workflow:", error);
    return [];
  }
}

// ============================================================================
// WORKFLOW EVENTS (Append-only event log — BR-01: KHÔNG UPDATE, KHÔNG DELETE)
// ============================================================================

/**
 * Ghi nhận một event mới vào workflow_events (append-only)
 * Cập nhật: input_data/output_data là JSONB, thêm human_feedback (AC2)
 * @param input - Thông tin event
 * @returns WorkflowEvent đã tạo hoặc null nếu lỗi (BR-04)
 */
export async function createWorkflowEvent(
  input: CreateWorkflowEventInput
): Promise<WorkflowEvent | null> {
  try {
    const metadata = input.metadata ? JSON.stringify(input.metadata) : "{}";
    const inputData = input.input_data ? JSON.stringify(input.input_data) : null;
    const outputData = input.output_data ? JSON.stringify(input.output_data) : null;
    const result = await pool.query<WorkflowEvent>(
      `INSERT INTO workflow_events (
         workflow_run_id, workflow_phase_id, event_type,
         agent_name, input_data, output_data, human_feedback,
         duration_ms, metadata, created_at
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9::jsonb, NOW())
       RETURNING *`,
      [
        input.workflow_run_id,
        input.workflow_phase_id || null,
        input.event_type,
        input.agent_name || null,
        inputData,
        outputData,
        input.human_feedback || null,
        input.duration_ms || null,
        metadata,
      ]
    );
    logger.info(
      `📊 [WorkflowHistory] Event recorded: ${input.event_type}${input.agent_name ? ` (agent: ${input.agent_name})` : ""}`
    );
    return result.rows[0];
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to create workflow event:", error);
    return null;
  }
}

/**
 * Lấy tất cả events của một workflow run (theo thứ tự thời gian tăng dần)
 * @param workflowRunId - UUID của workflow run
 * @returns Mảng WorkflowEvent
 */
export async function getEventsByWorkflowRunId(
  workflowRunId: string
): Promise<WorkflowEvent[]> {
  try {
    const result = await pool.query<WorkflowEvent>(
      `SELECT * FROM workflow_events
       WHERE workflow_run_id = $1
       ORDER BY created_at ASC`,
      [workflowRunId]
    );
    return result.rows;
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to get events by workflow run:", error);
    return [];
  }
}

/**
 * Lấy tất cả events của một phase cụ thể
 * @param phaseId - UUID của phase
 * @returns Mảng WorkflowEvent
 */
export async function getEventsByPhaseId(
  phaseId: string
): Promise<WorkflowEvent[]> {
  try {
    const result = await pool.query<WorkflowEvent>(
      `SELECT * FROM workflow_events
       WHERE workflow_phase_id = $1
       ORDER BY created_at ASC`,
      [phaseId]
    );
    return result.rows;
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to get events by phase:", error);
    return [];
  }
}

/**
 * Lấy events theo loại event cho một workflow run
 * @param workflowRunId - UUID của workflow run
 * @param eventType - Loại event cần lọc
 * @returns Mảng WorkflowEvent
 */
export async function getEventsByType(
  workflowRunId: string,
  eventType: string
): Promise<WorkflowEvent[]> {
  try {
    const result = await pool.query<WorkflowEvent>(
      `SELECT * FROM workflow_events
       WHERE workflow_run_id = $1 AND event_type = $2
       ORDER BY created_at ASC`,
      [workflowRunId, eventType]
    );
    return result.rows;
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to get events by type:", error);
    return [];
  }
}

/**
 * Lấy timeline events cho UI (toàn bộ events theo thứ tự thời gian)
 * Alias cho getEventsByWorkflowRunId — rõ ý nghĩa hơn cho UI layer
 * @param workflowRunId - UUID của workflow run
 * @returns Mảng WorkflowEvent
 */
export async function getEventTimeline(
  workflowRunId: string
): Promise<WorkflowEvent[]> {
  return getEventsByWorkflowRunId(workflowRunId);
}

// ============================================================================
// QUERY HELPERS — THỐNG KÊ CƠ BẢN (Legacy, giữ backward-compatible)
// ============================================================================

/** Thống kê tổng quan workflow (legacy — giữ lại cho backward compatibility) */
export interface WorkflowStats {
  total_runs: number;
  running: number;
  completed: number;
  failed: number;
  rejected: number;
  avg_duration_ms: number | null;
  avg_retry_count: number | null;
  total_events: number;
}

/**
 * Lấy thống kê tổng quan về workflow runs
 * Cập nhật: thêm rejected count
 * @returns WorkflowStats
 */
export async function getWorkflowStats(): Promise<WorkflowStats> {
  try {
    const result = await pool.query<WorkflowStats>(
      `SELECT
         (SELECT COUNT(*)::int FROM workflow_runs) AS total_runs,
         (SELECT COUNT(*)::int FROM workflow_runs WHERE status = 'running') AS running,
         (SELECT COUNT(*)::int FROM workflow_runs WHERE status = 'completed') AS completed,
         (SELECT COUNT(*)::int FROM workflow_runs WHERE status = 'failed') AS failed,
         (SELECT COUNT(*)::int FROM workflow_runs WHERE status = 'rejected') AS rejected,
         (SELECT AVG(total_duration_ms) FROM workflow_runs WHERE status = 'completed') AS avg_duration_ms,
         (SELECT AVG(retry_count)::numeric FROM workflow_phases) AS avg_retry_count,
         (SELECT COUNT(*)::int FROM workflow_events) AS total_events`
    );
    return (
      result.rows[0] || {
        total_runs: 0,
        running: 0,
        completed: 0,
        failed: 0,
        rejected: 0,
        avg_duration_ms: null,
        avg_retry_count: null,
        total_events: 0,
      }
    );
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to get stats:", error);
    return {
      total_runs: 0,
      running: 0,
      completed: 0,
      failed: 0,
      rejected: 0,
      avg_duration_ms: null,
      avg_retry_count: null,
      total_events: 0,
    };
  }
}

/** Thống kê retry theo phase name */
export interface PhaseRetryStats {
  phase_name: string;
  total_retries: number;
  avg_retries: number | null;
  max_retries: number;
}

/**
 * Lấy thống kê retry theo phase cho một workflow run
 * @param workflowRunId - UUID của workflow run
 * @returns Mảng PhaseRetryStats
 */
export async function getPhaseRetryStats(
  workflowRunId: string
): Promise<PhaseRetryStats[]> {
  try {
    const result = await pool.query<PhaseRetryStats>(
      `SELECT
         phase_name,
         SUM(retry_count)::int AS total_retries,
         AVG(retry_count)::numeric AS avg_retries,
         MAX(retry_count)::int AS max_retries
       FROM workflow_phases
       WHERE workflow_run_id = $1
       GROUP BY phase_name
       ORDER BY phase_name`,
      [workflowRunId]
    );
    return result.rows;
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to get phase retry stats:", error);
    return [];
  }
}

/** Chi tiết đầy đủ của một workflow run (bao gồm phases, approvals, và events) */
export interface WorkflowRunDetail {
  run: WorkflowRun;
  phases: Array<WorkflowPhase & { approvals: WorkflowApproval[] }>;
  events: WorkflowEvent[];
}

/**
 * Lấy chi tiết đầy đủ một workflow run bao gồm phases, approvals, và events
 * @param workflowRunId - UUID của workflow run
 * @returns WorkflowRunDetail hoặc null
 */
export async function getWorkflowRunDetail(
  workflowRunId: string
): Promise<WorkflowRunDetail | null> {
  try {
    const run = await getWorkflowRunById(workflowRunId);
    if (!run) return null;

    const phases = await getPhasesByWorkflowRunId(workflowRunId);
    const phasesWithApprovals = await Promise.all(
      phases.map(async (phase) => {
        const approvals = await getApprovalsByPhaseId(phase.id);
        return { ...phase, approvals };
      })
    );

    const events = await getEventsByWorkflowRunId(workflowRunId);

    return { run, phases: phasesWithApprovals, events };
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to get workflow run detail:", error);
    return null;
  }
}

// ============================================================================
// ANALYTICS QUERIES — MỚI cho US-01 (AC4)
// ============================================================================

/**
 * Thời gian trung bình mỗi phase (AC4)
 * Chỉ tính các phase đã completed và có duration_ms
 * @returns Mảng PhaseAvgDuration
 */
export async function getPhaseAvgDurations(): Promise<PhaseAvgDuration[]> {
  try {
    const result = await pool.query<PhaseAvgDuration>(
      `SELECT
         phase_name,
         AVG(duration_ms)::BIGINT as avg_duration_ms,
         MIN(duration_ms)::BIGINT as min_duration_ms,
         MAX(duration_ms)::BIGINT as max_duration_ms,
         COUNT(*)::INTEGER as total_executions
       FROM workflow_phases
       WHERE status = 'completed' AND duration_ms IS NOT NULL
       GROUP BY phase_name
       ORDER BY phase_name`
    );
    return result.rows;
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to get phase avg durations:", error);
    return [];
  }
}

/**
 * Tỷ lệ approve/reject theo loại approval gate (AC4)
 * @returns Mảng ApprovalRateByPhase
 */
export async function getApprovalRates(): Promise<ApprovalRateByPhase[]> {
  try {
    const result = await pool.query<ApprovalRateByPhase>(
      `SELECT
         approval_type,
         COUNT(*)::INTEGER as total_decisions,
         COUNT(*) FILTER (WHERE decision = 'approved')::INTEGER as approved_count,
         COUNT(*) FILTER (WHERE decision = 'rejected')::INTEGER as rejected_count,
         ROUND(
           COUNT(*) FILTER (WHERE decision = 'approved')::NUMERIC / NULLIF(COUNT(*), 0) * 100,
           2
         )::NUMERIC as approval_rate_percent
       FROM workflow_approvals
       GROUP BY approval_type
       ORDER BY approval_type`
    );
    return result.rows;
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to get approval rates:", error);
    return [];
  }
}

/**
 * Revision count cho mỗi workflow run (AC4)
 * Tổng số lần reject across all phases cho mỗi run
 * @param limit - Số lượng tối đa
 * @param offset - Vị trí bắt đầu (phân trang)
 * @returns Mảng RevisionCountPerRun
 */
export async function getRevisionCountPerRun(
  limit: number = 20,
  offset: number = 0
): Promise<RevisionCountPerRun[]> {
  try {
    // Lấy danh sách runs kèm tổng revisions
    const result = await pool.query<{
      workflow_run_id: string;
      feature_request: string;
      status: string;
      total_revisions: number;
    }>(
      `SELECT
         wr.id as workflow_run_id,
         wr.feature_request,
         wr.status,
         COALESCE(SUM(wp.retry_count), 0)::INTEGER as total_revisions
       FROM workflow_runs wr
       LEFT JOIN workflow_phases wp ON wr.id = wp.workflow_run_id
       GROUP BY wr.id, wr.feature_request, wr.status
       ORDER BY wr.started_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    // Cho mỗi run, lấy revisions_by_phase
    const runs: RevisionCountPerRun[] = await Promise.all(
      result.rows.map(async (row) => {
        const phaseRetries = await pool.query<{
          phase_name: string;
          retry_count: number;
        }>(
          `SELECT phase_name, SUM(retry_count)::INTEGER as retry_count
           FROM workflow_phases
           WHERE workflow_run_id = $1
           GROUP BY phase_name`,
          [row.workflow_run_id]
        );

        const revisionsByPhase: Record<string, number> = {};
        for (const pr of phaseRetries.rows) {
          revisionsByPhase[pr.phase_name] = pr.retry_count;
        }

        return {
          workflow_run_id: row.workflow_run_id,
          feature_request: row.feature_request,
          status: row.status as WorkflowRunStatus,
          total_revisions: row.total_revisions,
          revisions_by_phase: revisionsByPhase,
        };
      })
    );

    return runs;
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to get revision count per run:", error);
    return [];
  }
}

/**
 * Tổng quan Dashboard — Analytics Summary (AC4)
 * Bao gồm: total runs, status breakdown, avg duration, avg phases, total events, date range
 * @returns WorkflowAnalyticsSummary
 */
export async function getWorkflowAnalyticsSummary(): Promise<WorkflowAnalyticsSummary> {
  const defaultSummary: WorkflowAnalyticsSummary = {
    total_runs: 0,
    running_count: 0,
    completed_count: 0,
    failed_count: 0,
    rejected_count: 0,
    avg_total_duration_ms: null,
    avg_phases_per_run: 0,
    total_events: 0,
    date_range: { earliest: null, latest: null },
  };

  try {
    const result = await pool.query<{
      total_runs: number;
      running_count: number;
      completed_count: number;
      failed_count: number;
      rejected_count: number;
      avg_total_duration_ms: number | null;
      avg_phases_per_run: number;
      total_events: number;
      earliest: Date | null;
      latest: Date | null;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM workflow_runs) AS total_runs,
         (SELECT COUNT(*)::int FROM workflow_runs WHERE status = 'running') AS running_count,
         (SELECT COUNT(*)::int FROM workflow_runs WHERE status = 'completed') AS completed_count,
         (SELECT COUNT(*)::int FROM workflow_runs WHERE status = 'failed') AS failed_count,
         (SELECT COUNT(*)::int FROM workflow_runs WHERE status = 'rejected') AS rejected_count,
         (SELECT AVG(total_duration_ms) FROM workflow_runs WHERE status = 'completed') AS avg_total_duration_ms,
         (SELECT COALESCE(AVG(phase_count), 0)::NUMERIC FROM (
           SELECT COUNT(*)::NUMERIC as phase_count
           FROM workflow_phases
           GROUP BY workflow_run_id
         ) sub) AS avg_phases_per_run,
         (SELECT COUNT(*)::int FROM workflow_events) AS total_events,
         (SELECT MIN(started_at) FROM workflow_runs) AS earliest,
         (SELECT MAX(started_at) FROM workflow_runs) AS latest`
    );

    if (result.rows.length === 0) {
      return defaultSummary;
    }

    const row = result.rows[0];
    return {
      total_runs: row.total_runs,
      running_count: row.running_count,
      completed_count: row.completed_count,
      failed_count: row.failed_count,
      rejected_count: row.rejected_count,
      avg_total_duration_ms: row.avg_total_duration_ms,
      avg_phases_per_run: Number(row.avg_phases_per_run) || 0,
      total_events: row.total_events,
      date_range: {
        earliest: row.earliest,
        latest: row.latest,
      },
    };
  } catch (error) {
    logger.warn("⚠️ [WorkflowHistory] Failed to get analytics summary:", error);
    return defaultSummary;
  }
}
