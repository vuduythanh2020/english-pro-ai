/**
 * Unit Tests cho event-logger.ts — US-03: Tích hợp Event Logging (Append-only)
 * =============================================================================
 * Kiểm tra:
 * - TC-01: logWorkflowStarted — happy path, gọi createWorkflowEvent đúng params (AC1)
 * - TC-02: logWorkflowStarted — guard clause: skip khi workflowRunId rỗng (BR-05)
 * - TC-03: logWorkflowStarted — graceful degradation: DB lỗi chỉ log warning (BR-04)
 * - TC-04: logWorkflowCompleted — happy path, ghi outputData đúng (AC cuối)
 * - TC-05: logWorkflowCompleted — guard clause: skip khi workflowRunId rỗng (BR-05)
 * - TC-06: logApprovalRequest — happy path, truncate contentPreview 300 chars (AC3)
 * - TC-07: logApprovalRequest — contentPreview dài hơn 300 chars bị cắt (AC3)
 * - TC-08: logApprovalRequest — contentPreview rỗng → "(empty)" (AC3)
 * - TC-09: logApprovalRequest — guard clause: skip khi workflowRunId rỗng (BR-05)
 * - TC-10: logApprovalDecision — approved decision (AC3)
 * - TC-11: logApprovalDecision — rejected decision (AC3)
 * - TC-12: logApprovalDecision — ghi thêm feedback_given khi có feedback (BR-08)
 * - TC-13: logApprovalDecision — KHÔNG ghi feedback_given khi feedback rỗng (BR-08)
 * - TC-14: logApprovalDecision — KHÔNG ghi feedback_given khi feedback chỉ whitespace (BR-08)
 * - TC-15: logApprovalDecision — guard clause: skip khi workflowRunId rỗng (BR-05)
 * - TC-16: logApprovalDecision — graceful degradation khi DB lỗi (BR-04)
 * - TC-17: logWorkflowCompleted — với totalDurationMs optional (AC cuối)
 * - TC-18: logApprovalRequest — truyền đủ workflowPhaseId và agentName
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock repository TRƯỚC khi import module under test
vi.mock("../database/workflow-history.repository.js", () => ({
  createWorkflowEvent: vi.fn(),
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import SAU khi mock
import {
  logWorkflowStarted,
  logWorkflowCompleted,
  logApprovalRequest,
  logApprovalDecision,
} from "./event-logger.js";

import { createWorkflowEvent } from "../database/workflow-history.repository.js";
import { logger } from "../../utils/logger.js";

// Cast mocks
const mockCreateEvent = vi.mocked(createWorkflowEvent);
const mockLogger = vi.mocked(logger);

describe("US-03: event-logger.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: createWorkflowEvent thành công
    mockCreateEvent.mockResolvedValue(null);
  });

  // ==========================================================================
  // logWorkflowStarted
  // ==========================================================================
  describe("logWorkflowStarted", () => {
    it("TC-01: happy path — gọi createWorkflowEvent với đúng params (AC1)", async () => {
      await logWorkflowStarted({
        workflowRunId: "run-123",
        featureRequest: "Thêm tính năng XYZ",
        threadId: "thread-abc",
      });

      expect(mockCreateEvent).toHaveBeenCalledTimes(1);
      expect(mockCreateEvent).toHaveBeenCalledWith({
        workflow_run_id: "run-123",
        workflow_phase_id: undefined,
        event_type: "workflow_started",
        agent_name: undefined,
        input_data: {
          feature_request: "Thêm tính năng XYZ",
          thread_id: "thread-abc",
        },
        output_data: undefined,
        human_feedback: undefined,
        duration_ms: undefined,
      });
    });

    it("TC-02: guard clause — skip khi workflowRunId rỗng (BR-05)", async () => {
      await logWorkflowStarted({
        workflowRunId: "",
        featureRequest: "Test",
        threadId: "thread-1",
      });

      expect(mockCreateEvent).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Skipping workflow_started")
      );
    });

    it("TC-03: graceful degradation — DB lỗi chỉ log warning, KHÔNG throw (BR-04)", async () => {
      mockCreateEvent.mockRejectedValue(new Error("DB connection failed"));

      // Không throw
      await expect(
        logWorkflowStarted({
          workflowRunId: "run-456",
          featureRequest: "Feature",
          threadId: "thread-2",
        })
      ).resolves.toBeUndefined();

      expect(mockCreateEvent).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to log workflow_started"),
        expect.any(Error)
      );
    });
  });

  // ==========================================================================
  // logWorkflowCompleted
  // ==========================================================================
  describe("logWorkflowCompleted", () => {
    it("TC-04: happy path — ghi outputData đúng (AC cuối)", async () => {
      await logWorkflowCompleted({
        workflowRunId: "run-789",
        totalStories: 5,
      });

      expect(mockCreateEvent).toHaveBeenCalledTimes(1);
      expect(mockCreateEvent).toHaveBeenCalledWith({
        workflow_run_id: "run-789",
        workflow_phase_id: undefined,
        event_type: "workflow_completed",
        agent_name: undefined,
        input_data: undefined,
        output_data: {
          total_stories: 5,
          total_duration_ms: undefined,
        },
        human_feedback: undefined,
        duration_ms: undefined,
      });
    });

    it("TC-05: guard clause — skip khi workflowRunId rỗng (BR-05)", async () => {
      await logWorkflowCompleted({
        workflowRunId: "",
        totalStories: 3,
      });

      expect(mockCreateEvent).not.toHaveBeenCalled();
    });

    it("TC-17: với totalDurationMs optional", async () => {
      await logWorkflowCompleted({
        workflowRunId: "run-999",
        totalStories: 2,
        totalDurationMs: 120000,
      });

      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          output_data: {
            total_stories: 2,
            total_duration_ms: 120000,
          },
        })
      );
    });
  });

  // ==========================================================================
  // logApprovalRequest
  // ==========================================================================
  describe("logApprovalRequest", () => {
    it("TC-06: happy path — ghi approval_request với đúng params (AC3)", async () => {
      await logApprovalRequest({
        workflowRunId: "run-100",
        workflowPhaseId: "phase-200",
        approvalType: "requirements_approval",
        agentName: "po",
        contentPreview: "User story content here",
      });

      expect(mockCreateEvent).toHaveBeenCalledTimes(1);
      expect(mockCreateEvent).toHaveBeenCalledWith({
        workflow_run_id: "run-100",
        workflow_phase_id: "phase-200",
        event_type: "approval_request",
        agent_name: "po",
        input_data: {
          approval_type: "requirements_approval",
          content_preview: "User story content here",
        },
        output_data: undefined,
        human_feedback: undefined,
        duration_ms: undefined,
      });
    });

    it("TC-07: contentPreview dài hơn 300 chars bị cắt", async () => {
      const longContent = "A".repeat(500);

      await logApprovalRequest({
        workflowRunId: "run-100",
        workflowPhaseId: "phase-200",
        approvalType: "design_approval",
        agentName: "ba",
        contentPreview: longContent,
      });

      const calledWith = mockCreateEvent.mock.calls[0][0];
      const preview = (calledWith.input_data as Record<string, unknown>)
        .content_preview as string;
      expect(preview.length).toBe(300);
      expect(preview).toBe("A".repeat(300));
    });

    it("TC-08: contentPreview rỗng → '(empty)'", async () => {
      await logApprovalRequest({
        workflowRunId: "run-100",
        workflowPhaseId: "phase-200",
        approvalType: "code_review",
        agentName: "dev",
        contentPreview: "",
      });

      const calledWith = mockCreateEvent.mock.calls[0][0];
      const preview = (calledWith.input_data as Record<string, unknown>)
        .content_preview as string;
      expect(preview).toBe("(empty)");
    });

    it("TC-09: guard clause — skip khi workflowRunId rỗng (BR-05)", async () => {
      await logApprovalRequest({
        workflowRunId: "",
        workflowPhaseId: "phase-200",
        approvalType: "release_approval",
        agentName: "tester",
        contentPreview: "content",
      });

      expect(mockCreateEvent).not.toHaveBeenCalled();
    });

    it("TC-18: truyền đủ workflowPhaseId và agentName", async () => {
      await logApprovalRequest({
        workflowRunId: "run-100",
        workflowPhaseId: "phase-xyz",
        approvalType: "release_approval",
        agentName: "tester",
        contentPreview: "Test results here",
      });

      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          workflow_phase_id: "phase-xyz",
          agent_name: "tester",
        })
      );
    });
  });

  // ==========================================================================
  // logApprovalDecision
  // ==========================================================================
  describe("logApprovalDecision", () => {
    it("TC-10: approved decision — ghi event_type 'approved' (AC3)", async () => {
      await logApprovalDecision({
        workflowRunId: "run-300",
        workflowPhaseId: "phase-400",
        approvalType: "requirements_approval",
        decision: "approved",
      });

      // Chỉ ghi 1 event (approved), không có feedback_given vì không có feedback
      expect(mockCreateEvent).toHaveBeenCalledTimes(1);
      expect(mockCreateEvent).toHaveBeenCalledWith({
        workflow_run_id: "run-300",
        workflow_phase_id: "phase-400",
        event_type: "approved",
        agent_name: undefined,
        input_data: {
          approval_type: "requirements_approval",
        },
        output_data: undefined,
        human_feedback: undefined,
        duration_ms: undefined,
      });
    });

    it("TC-11: rejected decision — ghi event_type 'rejected' (AC3)", async () => {
      await logApprovalDecision({
        workflowRunId: "run-300",
        workflowPhaseId: "phase-400",
        approvalType: "design_approval",
        decision: "rejected",
        humanFeedback: "Cần sửa lại design",
      });

      // 2 events: rejected + feedback_given
      expect(mockCreateEvent).toHaveBeenCalledTimes(2);

      // Event 1: rejected
      expect(mockCreateEvent).toHaveBeenNthCalledWith(1, {
        workflow_run_id: "run-300",
        workflow_phase_id: "phase-400",
        event_type: "rejected",
        agent_name: undefined,
        input_data: {
          approval_type: "design_approval",
        },
        output_data: undefined,
        human_feedback: "Cần sửa lại design",
        duration_ms: undefined,
      });

      // Event 2: feedback_given
      expect(mockCreateEvent).toHaveBeenNthCalledWith(2, {
        workflow_run_id: "run-300",
        workflow_phase_id: "phase-400",
        event_type: "feedback_given",
        agent_name: undefined,
        input_data: undefined,
        output_data: undefined,
        human_feedback: "Cần sửa lại design",
        duration_ms: undefined,
      });
    });

    it("TC-12: ghi thêm feedback_given khi có feedback text (BR-08)", async () => {
      await logApprovalDecision({
        workflowRunId: "run-500",
        approvalType: "code_review",
        decision: "approved",
        humanFeedback: "Code looks good!",
      });

      // 2 events: approved + feedback_given
      expect(mockCreateEvent).toHaveBeenCalledTimes(2);

      // Verify feedback_given event
      expect(mockCreateEvent).toHaveBeenNthCalledWith(2, 
        expect.objectContaining({
          event_type: "feedback_given",
          human_feedback: "Code looks good!",
        })
      );
    });

    it("TC-13: KHÔNG ghi feedback_given khi feedback undefined (BR-08)", async () => {
      await logApprovalDecision({
        workflowRunId: "run-500",
        approvalType: "release_approval",
        decision: "approved",
        humanFeedback: undefined,
      });

      // Chỉ 1 event: approved
      expect(mockCreateEvent).toHaveBeenCalledTimes(1);
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: "approved",
        })
      );
    });

    it("TC-14: KHÔNG ghi feedback_given khi feedback chỉ whitespace (BR-08)", async () => {
      await logApprovalDecision({
        workflowRunId: "run-500",
        approvalType: "release_approval",
        decision: "rejected",
        humanFeedback: "   ",
      });

      // Chỉ 1 event: rejected (không ghi feedback_given vì chỉ whitespace)
      expect(mockCreateEvent).toHaveBeenCalledTimes(1);
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: "rejected",
        })
      );
    });

    it("TC-15: guard clause — skip khi workflowRunId rỗng (BR-05)", async () => {
      await logApprovalDecision({
        workflowRunId: "",
        approvalType: "requirements_approval",
        decision: "approved",
      });

      expect(mockCreateEvent).not.toHaveBeenCalled();
    });

    it("TC-16: graceful degradation — DB lỗi chỉ log warning (BR-04)", async () => {
      mockCreateEvent.mockRejectedValue(new Error("Connection timeout"));

      await expect(
        logApprovalDecision({
          workflowRunId: "run-600",
          approvalType: "design_approval",
          decision: "rejected",
          humanFeedback: "Fix it",
        })
      ).resolves.toBeUndefined();

      // createWorkflowEvent called nhưng failed → warn logged
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to log rejected"),
        expect.any(Error)
      );
    });
  });
});
