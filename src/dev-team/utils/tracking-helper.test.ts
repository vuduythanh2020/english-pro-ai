/**
 * Unit Tests cho tracking-helper.ts — US-01: Tích hợp Workflow Phase Tracking
 * =============================================================================
 * Kiểm tra:
 * - TC-01: truncateSummary — truncate text đúng quy cách (AC4)
 * - TC-02: startPhaseTracking — guard clause khi workflowRunId rỗng (AC2)
 * - TC-03: startPhaseTracking — happy path tạo phase + event (AC1)
 * - TC-04: startPhaseTracking — graceful degradation khi DB lỗi (BR-04)
 * - TC-05: completePhaseTracking — guard clause khi phaseId/workflowRunId rỗng (AC2)
 * - TC-06: completePhaseTracking — happy path complete phase + event (AC1)
 * - TC-07: completePhaseTracking — graceful degradation khi DB lỗi (BR-04)
 * - TC-08: startPhaseTracking — luôn tạo record MỚI (AC5/BR-05)
 * - TC-09: truncateSummary — edge cases (null, undefined, empty)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock repository functions TRƯỚC khi import tracking-helper
vi.mock("../database/workflow-history.repository.js", () => ({
  createWorkflowPhase: vi.fn(),
  completeWorkflowPhase: vi.fn(),
  createWorkflowEvent: vi.fn(),
}));

// Mock logger để không xuất log trong test
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
  truncateSummary,
  startPhaseTracking,
  completePhaseTracking,
} from "./tracking-helper.js";

import {
  createWorkflowPhase,
  completeWorkflowPhase,
  createWorkflowEvent,
} from "../database/workflow-history.repository.js";

import { logger } from "../../utils/logger.js";

// Cast mocks cho type safety
const mockCreatePhase = vi.mocked(createWorkflowPhase);
const mockCompletePhase = vi.mocked(completeWorkflowPhase);
const mockCreateEvent = vi.mocked(createWorkflowEvent);
const mockLogger = vi.mocked(logger);

describe("US-01: tracking-helper.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // TC-01: truncateSummary (AC4)
  // ==========================================================================
  describe("TC-01: truncateSummary", () => {
    it("should return text unchanged if <= maxLen", () => {
      const text = "Hello World";
      expect(truncateSummary(text)).toBe("Hello World");
    });

    it("should truncate text longer than maxLen (default 500)", () => {
      const longText = "A".repeat(600);
      const result = truncateSummary(longText);
      expect(result.length).toBeLessThan(600);
      expect(result).toContain("... (truncated)");
      // Kiểm tra phần đầu giữ nguyên
      expect(result.startsWith("A".repeat(500))).toBe(true);
    });

    it("should truncate with custom maxLen", () => {
      const text = "Hello World, this is a longer text";
      const result = truncateSummary(text, 10);
      expect(result).toBe("Hello Worl... (truncated)");
    });

    it("should return text exactly at maxLen boundary without truncation", () => {
      const text = "A".repeat(500);
      expect(truncateSummary(text)).toBe(text);
      expect(truncateSummary(text).length).toBe(500);
    });

    it("should handle text at maxLen + 1", () => {
      const text = "A".repeat(501);
      const result = truncateSummary(text);
      expect(result).toContain("... (truncated)");
    });
  });

  // ==========================================================================
  // TC-09: truncateSummary edge cases — null, undefined, empty (AC4)
  // ==========================================================================
  describe("TC-09: truncateSummary edge cases", () => {
    it("should return '(empty)' for null", () => {
      expect(truncateSummary(null)).toBe("(empty)");
    });

    it("should return '(empty)' for undefined", () => {
      expect(truncateSummary(undefined)).toBe("(empty)");
    });

    it("should return '(empty)' for empty string", () => {
      expect(truncateSummary("")).toBe("(empty)");
    });

    it("should return '(empty)' for whitespace-only string", () => {
      expect(truncateSummary("   ")).toBe("(empty)");
      expect(truncateSummary("\t\n  ")).toBe("(empty)");
    });

    it("should handle maxLen of 0", () => {
      const result = truncateSummary("Hello", 0);
      expect(result).toContain("... (truncated)");
    });
  });

  // ==========================================================================
  // TC-02: startPhaseTracking — guard clause (AC2)
  // ==========================================================================
  describe("TC-02: startPhaseTracking guard clause", () => {
    it("should return empty phaseId when workflowRunId is empty string", async () => {
      const result = await startPhaseTracking({
        workflowRunId: "",
        phaseName: "requirements",
        agentName: "po",
        inputSummary: "test input",
      });
      expect(result.phaseId).toBe("");
      expect(mockCreatePhase).not.toHaveBeenCalled();
      expect(mockCreateEvent).not.toHaveBeenCalled();
    });

    it("should log warning when workflowRunId is empty", async () => {
      await startPhaseTracking({
        workflowRunId: "",
        phaseName: "requirements",
        agentName: "po",
        inputSummary: "test",
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("workflowRunId is empty")
      );
    });
  });

  // ==========================================================================
  // TC-03: startPhaseTracking — happy path (AC1)
  // ==========================================================================
  describe("TC-03: startPhaseTracking happy path", () => {
    it("should create phase and event, return phaseId", async () => {
      // Mock createWorkflowPhase success
      mockCreatePhase.mockResolvedValue({
        id: "phase-uuid-123",
        workflow_run_id: "run-uuid-1",
        phase_name: "requirements",
        agent_name: "po",
        status: "in_progress",
        input_summary: "test feature",
        output_summary: null,
        started_at: new Date(),
        completed_at: null,
        duration_ms: null,
        retry_count: 0,
        metadata: {},
      });
      mockCreateEvent.mockResolvedValue(null as any);

      const result = await startPhaseTracking({
        workflowRunId: "run-uuid-1",
        phaseName: "requirements",
        agentName: "po",
        inputSummary: "Build a new feature",
      });

      expect(result.phaseId).toBe("phase-uuid-123");

      // Verify createWorkflowPhase called with correct params
      expect(mockCreatePhase).toHaveBeenCalledTimes(1);
      expect(mockCreatePhase).toHaveBeenCalledWith({
        workflow_run_id: "run-uuid-1",
        phase_name: "requirements",
        agent_name: "po",
        input_summary: "Build a new feature",
      });

      // Verify event created — US-03 AC2: input_data includes agent metadata
      expect(mockCreateEvent).toHaveBeenCalledTimes(1);
      expect(mockCreateEvent).toHaveBeenCalledWith({
        workflow_run_id: "run-uuid-1",
        workflow_phase_id: "phase-uuid-123",
        event_type: "agent_start",
        agent_name: "po",
        input_data: {
          summary: "Build a new feature",
          agent_name: "po",
          workflow_phase_id: "phase-uuid-123",
          phase_name: "requirements",
        },
      });
    });

    it("should truncate inputSummary exceeding 500 chars", async () => {
      const longInput = "X".repeat(600);
      mockCreatePhase.mockResolvedValue({
        id: "phase-uuid-456",
        workflow_run_id: "run-1",
        phase_name: "design",
        agent_name: "ba",
        status: "in_progress",
        input_summary: null,
        output_summary: null,
        started_at: new Date(),
        completed_at: null,
        duration_ms: null,
        retry_count: 0,
        metadata: {},
      });
      mockCreateEvent.mockResolvedValue(null as any);

      await startPhaseTracking({
        workflowRunId: "run-1",
        phaseName: "design",
        agentName: "ba",
        inputSummary: longInput,
      });

      // Verify truncated input was passed
      const callArgs = mockCreatePhase.mock.calls[0][0];
      expect(callArgs.input_summary!.length).toBeLessThan(600);
      expect(callArgs.input_summary).toContain("... (truncated)");
    });

    it("should log info message on success", async () => {
      mockCreatePhase.mockResolvedValue({
        id: "phase-abc",
        workflow_run_id: "run-1",
        phase_name: "development",
        agent_name: "dev",
        status: "in_progress",
        input_summary: null,
        output_summary: null,
        started_at: new Date(),
        completed_at: null,
        duration_ms: null,
        retry_count: 0,
        metadata: {},
      });
      mockCreateEvent.mockResolvedValue(null as any);

      await startPhaseTracking({
        workflowRunId: "run-1",
        phaseName: "development",
        agentName: "dev",
        inputSummary: "design doc",
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("DEV Agent started phase")
      );
    });
  });

  // ==========================================================================
  // TC-04: startPhaseTracking — graceful degradation (BR-04)
  // ==========================================================================
  describe("TC-04: startPhaseTracking graceful degradation", () => {
    it("should return empty phaseId when createWorkflowPhase returns null", async () => {
      mockCreatePhase.mockResolvedValue(null);

      const result = await startPhaseTracking({
        workflowRunId: "run-uuid-1",
        phaseName: "requirements",
        agentName: "po",
        inputSummary: "test",
      });

      expect(result.phaseId).toBe("");
      // Event should NOT be created since phase creation failed
      expect(mockCreateEvent).not.toHaveBeenCalled();
      // Warning should be logged
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("DB error during phase creation")
      );
    });

    it("should return empty phaseId when createWorkflowPhase throws", async () => {
      mockCreatePhase.mockRejectedValue(new Error("Connection refused"));

      const result = await startPhaseTracking({
        workflowRunId: "run-uuid-1",
        phaseName: "design",
        agentName: "ba",
        inputSummary: "test",
      });

      expect(result.phaseId).toBe("");
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Connection refused")
      );
    });

    it("should NOT throw even when createWorkflowEvent throws", async () => {
      mockCreatePhase.mockResolvedValue({
        id: "phase-evt-fail",
        workflow_run_id: "run-1",
        phase_name: "testing",
        agent_name: "tester",
        status: "in_progress",
        input_summary: null,
        output_summary: null,
        started_at: new Date(),
        completed_at: null,
        duration_ms: null,
        retry_count: 0,
        metadata: {},
      });
      mockCreateEvent.mockRejectedValue(new Error("Event insert failed"));

      // Should NOT throw — graceful degradation catches event errors too
      const result = await startPhaseTracking({
        workflowRunId: "run-1",
        phaseName: "testing",
        agentName: "tester",
        inputSummary: "source code",
      });

      // phaseId may or may not be returned depending on where the catch catches
      // The important thing is NO exception propagates
      expect(result).toBeDefined();
      expect(typeof result.phaseId).toBe("string");
    });
  });

  // ==========================================================================
  // TC-05: completePhaseTracking — guard clause (AC2)
  // ==========================================================================
  describe("TC-05: completePhaseTracking guard clause", () => {
    it("should skip when phaseId is empty", async () => {
      await completePhaseTracking("run-1", "", "po", "output");
      expect(mockCompletePhase).not.toHaveBeenCalled();
      expect(mockCreateEvent).not.toHaveBeenCalled();
    });

    it("should skip when workflowRunId is empty", async () => {
      await completePhaseTracking("", "phase-1", "po", "output");
      expect(mockCompletePhase).not.toHaveBeenCalled();
      expect(mockCreateEvent).not.toHaveBeenCalled();
    });

    it("should skip when both are empty", async () => {
      await completePhaseTracking("", "", "ba", "output");
      expect(mockCompletePhase).not.toHaveBeenCalled();
      expect(mockCreateEvent).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // TC-06: completePhaseTracking — happy path (AC1)
  // ==========================================================================
  describe("TC-06: completePhaseTracking happy path", () => {
    it("should complete phase and create event", async () => {
      mockCompletePhase.mockResolvedValue({
        id: "phase-1",
        workflow_run_id: "run-1",
        phase_name: "requirements",
        agent_name: "po",
        status: "completed",
        input_summary: "input",
        output_summary: "output",
        started_at: new Date(),
        completed_at: new Date(),
        duration_ms: 5000,
        retry_count: 0,
        metadata: {},
      });
      mockCreateEvent.mockResolvedValue(null as any);

      await completePhaseTracking("run-1", "phase-1", "po", "User stories generated");

      // Verify completeWorkflowPhase called
      expect(mockCompletePhase).toHaveBeenCalledTimes(1);
      expect(mockCompletePhase).toHaveBeenCalledWith("phase-1", {
        output_summary: "User stories generated",
      });

      // Verify event created — US-03 AC2: output_data includes agent metadata
      expect(mockCreateEvent).toHaveBeenCalledTimes(1);
      expect(mockCreateEvent).toHaveBeenCalledWith({
        workflow_run_id: "run-1",
        workflow_phase_id: "phase-1",
        event_type: "agent_complete",
        agent_name: "po",
        output_data: {
          summary: "User stories generated",
          agent_name: "po",
          workflow_phase_id: "phase-1",
        },
      });
    });

    it("should truncate outputSummary exceeding 500 chars", async () => {
      const longOutput = "Y".repeat(700);
      mockCompletePhase.mockResolvedValue(null as any);
      mockCreateEvent.mockResolvedValue(null as any);

      await completePhaseTracking("run-1", "phase-1", "ba", longOutput);

      const callArgs = mockCompletePhase.mock.calls[0];
      const outputSummary = callArgs[1].output_summary!;
      expect(outputSummary.length).toBeLessThan(700);
      expect(outputSummary).toContain("... (truncated)");
    });

    it("should log info message on success", async () => {
      mockCompletePhase.mockResolvedValue(null as any);
      mockCreateEvent.mockResolvedValue(null as any);

      await completePhaseTracking("run-1", "phase-1", "dev", "code completed");

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("DEV Agent completed phase")
      );
    });
  });

  // ==========================================================================
  // TC-07: completePhaseTracking — graceful degradation (BR-04)
  // ==========================================================================
  describe("TC-07: completePhaseTracking graceful degradation", () => {
    it("should NOT throw when completeWorkflowPhase throws", async () => {
      mockCompletePhase.mockRejectedValue(new Error("DB timeout"));

      // Should NOT throw
      await expect(
        completePhaseTracking("run-1", "phase-1", "po", "output")
      ).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("DB timeout")
      );
    });

    it("should NOT throw when createWorkflowEvent throws", async () => {
      mockCompletePhase.mockResolvedValue(null as any);
      mockCreateEvent.mockRejectedValue(new Error("Event failed"));

      await expect(
        completePhaseTracking("run-1", "phase-1", "ba", "output")
      ).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Event failed")
      );
    });
  });

  // ==========================================================================
  // TC-08: startPhaseTracking — always creates NEW record (AC5/BR-05)
  // ==========================================================================
  describe("TC-08: startPhaseTracking creates new records (AC5/BR-05)", () => {
    it("should call createWorkflowPhase (not update) every invocation", async () => {
      const phaseResult = {
        id: "phase-new",
        workflow_run_id: "run-1",
        phase_name: "requirements" as const,
        agent_name: "po" as const,
        status: "in_progress" as const,
        input_summary: null,
        output_summary: null,
        started_at: new Date(),
        completed_at: null,
        duration_ms: null,
        retry_count: 0,
        metadata: {},
      };

      mockCreatePhase.mockResolvedValue({ ...phaseResult, id: "phase-1st" });
      mockCreateEvent.mockResolvedValue(null as any);

      // First call (initial)
      const r1 = await startPhaseTracking({
        workflowRunId: "run-1",
        phaseName: "requirements",
        agentName: "po",
        inputSummary: "feature request",
      });

      mockCreatePhase.mockResolvedValue({ ...phaseResult, id: "phase-2nd" });

      // Second call (revision — same agent/phase but should create NEW record)
      const r2 = await startPhaseTracking({
        workflowRunId: "run-1",
        phaseName: "requirements",
        agentName: "po",
        inputSummary: "[REVISION] Feedback: fix AC3",
      });

      expect(r1.phaseId).toBe("phase-1st");
      expect(r2.phaseId).toBe("phase-2nd");
      expect(r1.phaseId).not.toBe(r2.phaseId);

      // createWorkflowPhase called twice (not updateWorkflowPhase)
      expect(mockCreatePhase).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // TC-10: Tích hợp — all 4 agents' phase/agent mapping
  // ==========================================================================
  describe("TC-10: Phase/Agent mapping correctness", () => {
    const mappings = [
      { phaseName: "requirements" as const, agentName: "po" as const },
      { phaseName: "design" as const, agentName: "ba" as const },
      { phaseName: "development" as const, agentName: "dev" as const },
      { phaseName: "testing" as const, agentName: "tester" as const },
    ];

    for (const { phaseName, agentName } of mappings) {
      it(`should accept ${phaseName}/${agentName} mapping`, async () => {
        mockCreatePhase.mockResolvedValue({
          id: `phase-${agentName}`,
          workflow_run_id: "run-1",
          phase_name: phaseName,
          agent_name: agentName,
          status: "in_progress",
          input_summary: null,
          output_summary: null,
          started_at: new Date(),
          completed_at: null,
          duration_ms: null,
          retry_count: 0,
          metadata: {},
        });
        mockCreateEvent.mockResolvedValue(null as any);

        const result = await startPhaseTracking({
          workflowRunId: "run-1",
          phaseName,
          agentName,
          inputSummary: "test input",
        });

        expect(result.phaseId).toBe(`phase-${agentName}`);
        expect(mockCreatePhase).toHaveBeenCalledWith(
          expect.objectContaining({
            phase_name: phaseName,
            agent_name: agentName,
          })
        );
      });
    }
  });
});
