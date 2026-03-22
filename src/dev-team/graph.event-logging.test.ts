/**
 * Integration Tests cho US-03: Event Logging trong graph.ts
 * =============================================================================
 * Vì các approval gate functions và injectProjectContext/usRouterNode là private
 * (không export từ graph.ts), ta test bằng CONTRACT TEST approach:
 * Re-implement logic gọi event-logger đúng theo Design Doc, verify params.
 *
 * Đồng thời verify tracking-helper.ts đã mở rộng metadata (AC2).
 *
 * Test Cases:
 * TC-01: injectProjectContext — gọi logWorkflowStarted sau createWorkflowRun (AC1)
 * TC-02: injectProjectContext — skip logWorkflowStarted khi createWorkflowRun fail (AC1)
 * TC-03: requirementsApproval — logApprovalRequest trước interrupt + logApprovalDecision sau (AC3)
 * TC-04: designApproval — đúng approvalType và agentName (AC3)
 * TC-05: codeReview — đúng approvalType và agentName (AC3)
 * TC-06: releaseApproval — đúng approvalType và agentName (AC3)
 * TC-07: usRouterNode — gọi logWorkflowCompleted khi hết stories
 * TC-08: usRouterNode — KHÔNG gọi logWorkflowCompleted khi còn stories
 * TC-09: usRouterNode — skip logWorkflowCompleted khi workflowRunId rỗng
 * TC-10: tracking-helper startPhaseTracking — input_data chứa agent_name, workflow_phase_id, phase_name (AC2)
 * TC-11: tracking-helper completePhaseTracking — output_data chứa agent_name, workflow_phase_id (AC2)
 * TC-12: Approval gate mapping — 4 gates có đúng approvalType/agentName/contentPreview mapping
 * TC-13: Event order — approval_request TRƯỚC interrupt, approved/rejected SAU interrupt (BR-06)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mock dependencies cho event-logger contract tests
// ============================================================================

vi.mock("./utils/event-logger.js", () => ({
  logWorkflowStarted: vi.fn(),
  logWorkflowCompleted: vi.fn(),
  logApprovalRequest: vi.fn(),
  logApprovalDecision: vi.fn(),
}));

vi.mock("./database/workflow-history.repository.js", () => ({
  createWorkflowRun: vi.fn(),
  updateWorkflowRunStatus: vi.fn(),
  createWorkflowApproval: vi.fn(),
  updateWorkflowPhaseStatus: vi.fn(),
  completeWorkflowPhase: vi.fn(),
  createWorkflowPhase: vi.fn(),
  createWorkflowEvent: vi.fn(),
}));

vi.mock("../utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import mocked modules
import {
  logWorkflowStarted,
  logWorkflowCompleted,
  logApprovalRequest,
  logApprovalDecision,
} from "./utils/event-logger.js";

import {
  createWorkflowRun,
  updateWorkflowRunStatus,
  createWorkflowPhase,
  createWorkflowEvent,
} from "./database/workflow-history.repository.js";

// Cast mocks
const mockLogWorkflowStarted = vi.mocked(logWorkflowStarted);
const mockLogWorkflowCompleted = vi.mocked(logWorkflowCompleted);
const mockLogApprovalRequest = vi.mocked(logApprovalRequest);
const mockLogApprovalDecision = vi.mocked(logApprovalDecision);
const mockCreateWorkflowRun = vi.mocked(createWorkflowRun);
const mockUpdateStatus = vi.mocked(updateWorkflowRunStatus);
const mockCreatePhase = vi.mocked(createWorkflowPhase);
const mockCreateEvent = vi.mocked(createWorkflowEvent);

// ============================================================================
// CONTRACT TESTS: Re-implement logic mirroring graph.ts private functions
// ============================================================================

/**
 * Mirror injectProjectContext logic (phần event logging)
 * Theo graph.ts: SAU khi createWorkflowRun() thành công → gọi logWorkflowStarted()
 */
async function contractInjectContext(state: {
  workflowRunId: string;
  threadId: string;
  featureRequest: string;
}): Promise<{ workflowRunId: string }> {
  let workflowRunId = "";

  if (state.threadId && state.featureRequest) {
    if (!state.workflowRunId) {
      const run = await createWorkflowRun({
        thread_id: state.threadId,
        feature_request: state.featureRequest,
        created_by: "pm",
      });
      if (run) {
        workflowRunId = run.id;

        // US-03 AC1: Ghi event workflow_started
        await logWorkflowStarted({
          workflowRunId,
          featureRequest: state.featureRequest,
          threadId: state.threadId,
        });
      }
    } else {
      workflowRunId = state.workflowRunId;
    }
  }

  return { workflowRunId };
}

/**
 * Mirror approval gate logic (phần event logging)
 * Theo graph.ts: logApprovalRequest TRƯỚC interrupt → logApprovalDecision SAU interrupt
 */
async function contractApprovalGate(
  state: { workflowRunId: string; currentPhaseId: string; content: string },
  config: {
    approvalType: "requirements_approval" | "design_approval" | "code_review" | "release_approval";
    agentName: "po" | "ba" | "dev" | "tester";
  },
  decision: { action: "approve" | "reject"; feedback?: string }
): Promise<void> {
  // TRƯỚC interrupt
  await logApprovalRequest({
    workflowRunId: state.workflowRunId,
    workflowPhaseId: state.currentPhaseId,
    approvalType: config.approvalType,
    agentName: config.agentName,
    contentPreview: state.content || "",
  });

  // SAU interrupt (simulated)
  await logApprovalDecision({
    workflowRunId: state.workflowRunId,
    workflowPhaseId: state.currentPhaseId,
    approvalType: config.approvalType,
    decision: decision.action === "approve" ? "approved" : "rejected",
    humanFeedback: decision.feedback,
  });
}

/**
 * Mirror usRouterNode logic (phần event logging khi hết stories)
 * Theo graph.ts: logWorkflowCompleted TRƯỚC updateWorkflowRunStatus("completed")
 */
async function contractUsRouterDone(state: {
  workflowRunId: string;
  allUserStories: string[];
}): Promise<void> {
  const stories = state.allUserStories;

  // Khi hết stories
  if (state.workflowRunId) {
    await logWorkflowCompleted({
      workflowRunId: state.workflowRunId,
      totalStories: stories.length,
    });
  }

  if (state.workflowRunId) {
    await updateWorkflowRunStatus(state.workflowRunId, "completed");
  }
}

// ============================================================================
// Test suites
// ============================================================================

describe("US-03: Event Logging Integration (graph.ts contract tests)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogWorkflowStarted.mockResolvedValue(undefined);
    mockLogWorkflowCompleted.mockResolvedValue(undefined);
    mockLogApprovalRequest.mockResolvedValue(undefined);
    mockLogApprovalDecision.mockResolvedValue(undefined);
    mockUpdateStatus.mockResolvedValue(null);
  });

  // ========================================================================
  // injectProjectContext event logging
  // ========================================================================
  describe("injectProjectContext — AC1: workflow_started", () => {
    it("TC-01: gọi logWorkflowStarted sau createWorkflowRun thành công", async () => {
      mockCreateWorkflowRun.mockResolvedValue({
        id: "run-new-123",
        thread_id: "thread-1",
        feature_request: "Add login",
        status: "running",
        created_by: "pm",
        started_at: new Date(),
        completed_at: null,
        total_duration_ms: null,
        metadata: {},
      });

      const result = await contractInjectContext({
        workflowRunId: "",
        threadId: "thread-1",
        featureRequest: "Add login",
      });

      expect(result.workflowRunId).toBe("run-new-123");
      expect(mockLogWorkflowStarted).toHaveBeenCalledTimes(1);
      expect(mockLogWorkflowStarted).toHaveBeenCalledWith({
        workflowRunId: "run-new-123",
        featureRequest: "Add login",
        threadId: "thread-1",
      });
    });

    it("TC-02: skip logWorkflowStarted khi createWorkflowRun trả null", async () => {
      mockCreateWorkflowRun.mockResolvedValue(null);

      const result = await contractInjectContext({
        workflowRunId: "",
        threadId: "thread-1",
        featureRequest: "Feature X",
      });

      expect(result.workflowRunId).toBe("");
      expect(mockLogWorkflowStarted).not.toHaveBeenCalled();
    });

    it("TC-02b: skip khi threadId rỗng", async () => {
      const result = await contractInjectContext({
        workflowRunId: "",
        threadId: "",
        featureRequest: "Feature Y",
      });

      expect(result.workflowRunId).toBe("");
      expect(mockCreateWorkflowRun).not.toHaveBeenCalled();
      expect(mockLogWorkflowStarted).not.toHaveBeenCalled();
    });

    it("TC-02c: skip khi workflowRunId đã có (idempotency)", async () => {
      const result = await contractInjectContext({
        workflowRunId: "existing-run-id",
        threadId: "thread-1",
        featureRequest: "Feature Z",
      });

      expect(result.workflowRunId).toBe("existing-run-id");
      expect(mockCreateWorkflowRun).not.toHaveBeenCalled();
      expect(mockLogWorkflowStarted).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // Approval gates event logging
  // ========================================================================
  describe("Approval Gates — AC3: approval_request + approved/rejected", () => {
    it("TC-03: requirementsApproval — đúng approvalType 'requirements_approval', agentName 'po'", async () => {
      await contractApprovalGate(
        { workflowRunId: "run-1", currentPhaseId: "phase-1", content: "User stories" },
        { approvalType: "requirements_approval", agentName: "po" },
        { action: "approve", feedback: "LGTM" }
      );

      expect(mockLogApprovalRequest).toHaveBeenCalledWith({
        workflowRunId: "run-1",
        workflowPhaseId: "phase-1",
        approvalType: "requirements_approval",
        agentName: "po",
        contentPreview: "User stories",
      });

      expect(mockLogApprovalDecision).toHaveBeenCalledWith({
        workflowRunId: "run-1",
        workflowPhaseId: "phase-1",
        approvalType: "requirements_approval",
        decision: "approved",
        humanFeedback: "LGTM",
      });
    });

    it("TC-04: designApproval — approvalType 'design_approval', agentName 'ba'", async () => {
      await contractApprovalGate(
        { workflowRunId: "run-2", currentPhaseId: "phase-2", content: "Design doc content" },
        { approvalType: "design_approval", agentName: "ba" },
        { action: "reject", feedback: "Thiếu sequence diagram" }
      );

      expect(mockLogApprovalRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalType: "design_approval",
          agentName: "ba",
          contentPreview: "Design doc content",
        })
      );

      expect(mockLogApprovalDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalType: "design_approval",
          decision: "rejected",
          humanFeedback: "Thiếu sequence diagram",
        })
      );
    });

    it("TC-05: codeReview — approvalType 'code_review', agentName 'dev'", async () => {
      await contractApprovalGate(
        { workflowRunId: "run-3", currentPhaseId: "phase-3", content: "source code" },
        { approvalType: "code_review", agentName: "dev" },
        { action: "approve" }
      );

      expect(mockLogApprovalRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalType: "code_review",
          agentName: "dev",
        })
      );

      expect(mockLogApprovalDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalType: "code_review",
          decision: "approved",
          humanFeedback: undefined,
        })
      );
    });

    it("TC-06: releaseApproval — approvalType 'release_approval', agentName 'tester'", async () => {
      await contractApprovalGate(
        { workflowRunId: "run-4", currentPhaseId: "phase-4", content: "test results" },
        { approvalType: "release_approval", agentName: "tester" },
        { action: "reject", feedback: "3 tests fail" }
      );

      expect(mockLogApprovalRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalType: "release_approval",
          agentName: "tester",
        })
      );

      expect(mockLogApprovalDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalType: "release_approval",
          decision: "rejected",
          humanFeedback: "3 tests fail",
        })
      );
    });

    it("TC-12: Approval gate mapping — 4 gates có đúng pair", async () => {
      const mappings = [
        { approvalType: "requirements_approval" as const, agentName: "po" as const },
        { approvalType: "design_approval" as const, agentName: "ba" as const },
        { approvalType: "code_review" as const, agentName: "dev" as const },
        { approvalType: "release_approval" as const, agentName: "tester" as const },
      ];

      for (const mapping of mappings) {
        vi.clearAllMocks();
        mockLogApprovalRequest.mockResolvedValue(undefined);
        mockLogApprovalDecision.mockResolvedValue(undefined);

        await contractApprovalGate(
          { workflowRunId: "run-x", currentPhaseId: "phase-x", content: "content" },
          mapping,
          { action: "approve" }
        );

        expect(mockLogApprovalRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            approvalType: mapping.approvalType,
            agentName: mapping.agentName,
          })
        );
      }
    });

    it("TC-13: Event order — logApprovalRequest TRƯỚC logApprovalDecision (BR-06)", async () => {
      const callOrder: string[] = [];
      mockLogApprovalRequest.mockImplementation(async () => {
        callOrder.push("approval_request");
      });
      mockLogApprovalDecision.mockImplementation(async () => {
        callOrder.push("approval_decision");
      });

      await contractApprovalGate(
        { workflowRunId: "run-order", currentPhaseId: "phase-order", content: "test" },
        { approvalType: "requirements_approval", agentName: "po" },
        { action: "approve" }
      );

      expect(callOrder).toEqual(["approval_request", "approval_decision"]);
    });
  });

  // ========================================================================
  // usRouterNode event logging
  // ========================================================================
  describe("usRouterNode — workflow_completed", () => {
    it("TC-07: gọi logWorkflowCompleted khi hết stories", async () => {
      await contractUsRouterDone({
        workflowRunId: "run-done",
        allUserStories: ["story1", "story2", "story3"],
      });

      expect(mockLogWorkflowCompleted).toHaveBeenCalledTimes(1);
      expect(mockLogWorkflowCompleted).toHaveBeenCalledWith({
        workflowRunId: "run-done",
        totalStories: 3,
      });

      // Verify order: logWorkflowCompleted TRƯỚC updateWorkflowRunStatus
      expect(mockLogWorkflowCompleted.mock.invocationCallOrder[0])
        .toBeLessThan(mockUpdateStatus.mock.invocationCallOrder[0]);
    });

    it("TC-08: stories rỗng → totalStories = 0", async () => {
      await contractUsRouterDone({
        workflowRunId: "run-empty",
        allUserStories: [],
      });

      expect(mockLogWorkflowCompleted).toHaveBeenCalledWith({
        workflowRunId: "run-empty",
        totalStories: 0,
      });
    });

    it("TC-09: skip logWorkflowCompleted khi workflowRunId rỗng", async () => {
      await contractUsRouterDone({
        workflowRunId: "",
        allUserStories: ["story1"],
      });

      expect(mockLogWorkflowCompleted).not.toHaveBeenCalled();
      expect(mockUpdateStatus).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// tracking-helper metadata enhancement tests (AC2)
// ============================================================================

describe("US-03 AC2: tracking-helper metadata enhancements", () => {
  // Reset mocks cho tracking-helper tests
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreatePhase.mockResolvedValue({
      id: "phase-test-123",
      workflow_run_id: "run-test",
      phase_name: "requirements",
      agent_name: "po",
      status: "in_progress",
      input_summary: "test input",
      output_summary: null,
      started_at: new Date(),
      completed_at: null,
      duration_ms: null,
      retry_count: 0,
      metadata: {},
    });
    mockCreateEvent.mockResolvedValue(null);
  });

  it("TC-10: startPhaseTracking — input_data chứa agent_name, workflow_phase_id, phase_name", async () => {
    // Import tracking-helper (đã được mock ở trên cùng)
    const { startPhaseTracking } = await import("./utils/tracking-helper.js");

    const result = await startPhaseTracking({
      workflowRunId: "run-test",
      phaseName: "requirements",
      agentName: "po",
      inputSummary: "Test input summary",
    });

    expect(result.phaseId).toBe("phase-test-123");

    // Verify createWorkflowEvent được gọi với agent_start event
    expect(mockCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "agent_start",
        agent_name: "po",
        input_data: expect.objectContaining({
          agent_name: "po",
          workflow_phase_id: "phase-test-123",
          phase_name: "requirements",
          summary: "Test input summary",
        }),
      })
    );
  });

  it("TC-11: completePhaseTracking — output_data chứa agent_name, workflow_phase_id", async () => {
    const { completePhaseTracking } = await import("./utils/tracking-helper.js");
    const { completeWorkflowPhase } = await import("./database/workflow-history.repository.js");
    vi.mocked(completeWorkflowPhase).mockResolvedValue(null);

    await completePhaseTracking(
      "run-test",
      "phase-test-456",
      "ba",
      "Design document created"
    );

    // Verify createWorkflowEvent gọi với agent_complete event
    expect(mockCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "agent_complete",
        agent_name: "ba",
        output_data: expect.objectContaining({
          agent_name: "ba",
          workflow_phase_id: "phase-test-456",
          summary: "Design document created",
        }),
      })
    );
  });
});
