/**
 * Dev Team API Functions — US-04
 * ============================================================================
 * Typed wrapper cho 3 dev-team endpoints của backend:
 * - POST /api/dev-team/start    → startWorkflowApi()
 * - POST /api/dev-team/approve  → approveWorkflowApi()
 * - GET  /api/dev-team/status/:threadId → getWorkflowStatusApi()
 *
 * Sử dụng apiClient (từ client.ts) — tự động gắn Bearer token từ localStorage.
 * Mọi function throw ApiError nếu response.success === false hoặc HTTP error.
 */

import { apiClient } from "./client.ts";

// === Request Types ===

interface StartWorkflowRequest {
  featureRequest: string;
}

interface ApproveRequest {
  threadId: string;
  action: "approve" | "reject";
  feedback?: string;
}

// === Response Types (mirror backend response shapes) ===

interface PendingApproval {
  title?: string;
  content?: string;
  question?: string;
}

interface WorkflowOutput {
  userStories: string | null;
  designDocument: string | null;
  sourceCode: string | null;
  testResults: string | null;
}

interface WorkflowData {
  threadId: string;
  workflowRunId: string | null;
  currentPhase: string;
  status: "waiting_approval" | "processing" | "completed";
  pendingApproval: PendingApproval | null;
  output: WorkflowOutput;
}

// === API Functions ===

/**
 * POST /api/dev-team/start
 * Bắt đầu workflow mới với feature request.
 */
function startWorkflowApi(data: StartWorkflowRequest): Promise<WorkflowData> {
  return apiClient.post<WorkflowData>("/api/dev-team/start", data);
}

/**
 * POST /api/dev-team/approve
 * Approve hoặc reject tại approval gate.
 */
function approveWorkflowApi(data: ApproveRequest): Promise<WorkflowData> {
  return apiClient.post<WorkflowData>("/api/dev-team/approve", data);
}

/**
 * GET /api/dev-team/status/:threadId
 * Lấy trạng thái hiện tại của workflow.
 */
function getWorkflowStatusApi(threadId: string): Promise<WorkflowData> {
  return apiClient.get<WorkflowData>(`/api/dev-team/status/${threadId}`);
}

export { startWorkflowApi, approveWorkflowApi, getWorkflowStatusApi };
export type {
  StartWorkflowRequest,
  ApproveRequest,
  PendingApproval,
  WorkflowOutput,
  WorkflowData,
};
