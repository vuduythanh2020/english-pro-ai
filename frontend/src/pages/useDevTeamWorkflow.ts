/**
 * useDevTeamWorkflow Hook — US-04
 * ============================================================================
 * Custom hook đóng gói toàn bộ state management + API interaction cho DevTeamPage.
 *
 * Features:
 * - startWorkflow(): gọi POST /api/dev-team/start với Bearer token
 * - handleApproval(): gọi POST /api/dev-team/approve
 * - Polling: tự động poll GET /api/dev-team/status khi status === "processing"
 * - Auth error handling: 401 → logout + redirect /login, 403 → redirect /chat
 * - Completion detection: currentPhase === "done" → status "completed"
 * - Reset: cho phép start workflow mới sau khi hoàn tất
 *
 * Tách khỏi component để giữ DevTeamPage.tsx clean (presentation only).
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.tsx";
import {
  startWorkflowApi,
  approveWorkflowApi,
  getWorkflowStatusApi,
} from "../api/dev-team.api.ts";
import { ApiError } from "../api/client.ts";
import type { PendingApproval, WorkflowOutput } from "../api/dev-team.api.ts";

// === Types ===

type WorkflowStatus =
  | "idle"
  | "loading"
  | "waiting_approval"
  | "processing"
  | "completed"
  | "error";

interface WorkflowState {
  threadId: string | null;
  workflowRunId: string | null;
  currentPhase: string;
  status: WorkflowStatus;
  pendingApproval: PendingApproval | null;
  output: WorkflowOutput;
  error: string | null;
}

interface UseDevTeamWorkflowReturn {
  // State
  workflow: WorkflowState;
  featureRequest: string;
  feedback: string;
  isLoading: boolean;
  rejectWarning: boolean;
  pollingExhausted: boolean;

  // Setters
  setFeatureRequest: (value: string) => void;
  setFeedback: (value: string) => void;

  // Actions
  startWorkflow: () => Promise<void>;
  handleApproval: (action: "approve" | "reject") => Promise<void>;
  resetWorkflow: () => void;
  refreshStatus: () => Promise<void>;
}

// === Constants ===

const INITIAL_OUTPUT: WorkflowOutput = {
  userStories: null,
  designDocument: null,
  sourceCode: null,
  testResults: null,
};

const INITIAL_WORKFLOW: WorkflowState = {
  threadId: null,
  workflowRunId: null,
  currentPhase: "",
  status: "idle",
  pendingApproval: null,
  output: { ...INITIAL_OUTPUT },
  error: null,
};

const POLLING_INTERVAL_MS = 3000;
const POLLING_MAX_ATTEMPTS = 100; // 5 minutes at 3s interval

// === Hook ===

function useDevTeamWorkflow(): UseDevTeamWorkflowReturn {
  const navigate = useNavigate();
  const { logout } = useAuth();

  // State
  const [workflow, setWorkflow] = useState<WorkflowState>({ ...INITIAL_WORKFLOW });
  const [featureRequest, setFeatureRequest] = useState("");
  const [feedback, setFeedback] = useState("");
  const [rejectWarning, setRejectWarning] = useState(false);
  const [pollingExhausted, setPollingExhausted] = useState(false);

  // Refs for polling
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingCountRef = useRef(0);

  // Computed
  const isLoading = workflow.status === "loading";

  // === Auth error handler (shared across all API calls) ===
  const handleAuthError = useCallback(
    (error: unknown): boolean => {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          logout();
          navigate("/login");
          return true;
        }
        if (error.status === 403) {
          setWorkflow((prev) => ({
            ...prev,
            status: "error",
            error: "Bạn không có quyền truy cập tính năng này.",
          }));
          navigate("/chat");
          return true;
        }
      }
      return false;
    },
    [logout, navigate],
  );

  // === Polling logic ===
  const stopPolling = useCallback(() => {
    if (pollingRef.current !== null) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    pollingCountRef.current = 0;
  }, []);

  const startPolling = useCallback(
    (threadId: string) => {
      // Clear any existing polling
      stopPolling();
      setPollingExhausted(false);
      pollingCountRef.current = 0;

      pollingRef.current = setInterval(async () => {
        pollingCountRef.current += 1;

        // Check max attempts (BR-07)
        if (pollingCountRef.current >= POLLING_MAX_ATTEMPTS) {
          stopPolling();
          setPollingExhausted(true);
          return;
        }

        try {
          const data = await getWorkflowStatusApi(threadId);

          if (data.status !== "processing") {
            stopPolling();

            const resolvedStatus: WorkflowStatus =
              data.status === "completed" || data.currentPhase === "done"
                ? "completed"
                : data.status === "waiting_approval"
                  ? "waiting_approval"
                  : "processing";

            setWorkflow((prev) => ({
              ...prev,
              currentPhase: data.currentPhase,
              status: resolvedStatus,
              pendingApproval: data.pendingApproval,
              output: data.output,
              error: null,
            }));
          }
        } catch (error) {
          if (handleAuthError(error)) {
            stopPolling();
            return;
          }
          // Network error during polling — don't crash, just log
          console.error("Polling error:", error);
        }
      }, POLLING_INTERVAL_MS);
    },
    [stopPolling, handleAuthError],
  );

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  // === Helper: update workflow from API response ===
  const updateWorkflowFromResponse = useCallback(
    (data: {
      threadId: string;
      workflowRunId: string | null;
      currentPhase: string;
      status: string;
      pendingApproval: PendingApproval | null;
      output: WorkflowOutput;
    }) => {
      const resolvedStatus: WorkflowStatus =
        data.status === "completed" || data.currentPhase === "done"
          ? "completed"
          : data.status === "waiting_approval"
            ? "waiting_approval"
            : "processing";

      setWorkflow({
        threadId: data.threadId,
        workflowRunId: data.workflowRunId,
        currentPhase: data.currentPhase,
        status: resolvedStatus,
        pendingApproval: data.pendingApproval,
        output: data.output,
        error: null,
      });

      // Start polling if processing (agent đang xử lý, chưa đến interrupt tiếp)
      if (resolvedStatus === "processing") {
        startPolling(data.threadId);
      }
    },
    [startPolling],
  );

  // === Actions ===

  const startWorkflow = useCallback(async () => {
    const trimmed = featureRequest.trim();
    if (!trimmed || isLoading) return;

    setWorkflow((prev) => ({ ...prev, status: "loading", error: null }));
    setRejectWarning(false);

    try {
      const data = await startWorkflowApi({ featureRequest: trimmed });
      updateWorkflowFromResponse(data);
    } catch (error) {
      if (handleAuthError(error)) return;

      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Không thể khởi tạo workflow. Vui lòng thử lại.";

      setWorkflow((prev) => ({
        ...prev,
        status: "error",
        error: message,
      }));
    }
  }, [featureRequest, isLoading, updateWorkflowFromResponse, handleAuthError]);

  const handleApproval = useCallback(
    async (action: "approve" | "reject") => {
      if (!workflow.threadId || isLoading) return;

      // Soft validation: warn if rejecting without feedback (BR-04)
      if (action === "reject" && !feedback.trim()) {
        setRejectWarning(true);
        // Don't block — still proceed
      } else {
        setRejectWarning(false);
      }

      setWorkflow((prev) => ({ ...prev, status: "loading", error: null }));

      try {
        const data = await approveWorkflowApi({
          threadId: workflow.threadId,
          action,
          feedback: action === "reject" ? feedback : undefined,
        });

        updateWorkflowFromResponse(data);
        setFeedback("");
        setRejectWarning(false);
      } catch (error) {
        if (handleAuthError(error)) return;

        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Không thể xử lý approval. Vui lòng thử lại.";

        setWorkflow((prev) => ({
          ...prev,
          status: "error",
          error: message,
        }));
      }
    },
    [
      workflow.threadId,
      isLoading,
      feedback,
      updateWorkflowFromResponse,
      handleAuthError,
    ],
  );

  const resetWorkflow = useCallback(() => {
    stopPolling();
    setWorkflow({ ...INITIAL_WORKFLOW });
    setFeatureRequest("");
    setFeedback("");
    setRejectWarning(false);
    setPollingExhausted(false);
  }, [stopPolling]);

  const refreshStatus = useCallback(async () => {
    if (!workflow.threadId) return;

    setPollingExhausted(false);

    try {
      const data = await getWorkflowStatusApi(workflow.threadId);
      updateWorkflowFromResponse(data);
    } catch (error) {
      if (handleAuthError(error)) return;

      const message =
        error instanceof Error ? error.message : "Không thể refresh trạng thái.";

      setWorkflow((prev) => ({
        ...prev,
        error: message,
      }));
    }
  }, [workflow.threadId, updateWorkflowFromResponse, handleAuthError]);

  return {
    workflow,
    featureRequest,
    feedback,
    isLoading,
    rejectWarning,
    pollingExhausted,
    setFeatureRequest,
    setFeedback,
    startWorkflow,
    handleApproval,
    resetWorkflow,
    refreshStatus,
  };
}

export { useDevTeamWorkflow };
export type { WorkflowState, WorkflowStatus, UseDevTeamWorkflowReturn };
