/**
 * Unit Tests cho types.ts — US-01 Database Schema Types
 * =====================================================
 * Kiểm tra:
 * - TC-01: WorkflowRunStatus bao gồm "rejected"
 * - TC-02: WorkflowRun interface có field created_by
 * - TC-03: WorkflowEvent interface có human_feedback và JSONB input/output
 * - TC-04: CreateWorkflowRunInput có created_by optional
 * - TC-05: CreateWorkflowEventInput có human_feedback và JSONB input/output
 * - TC-06: Analytics types (PhaseAvgDuration, ApprovalRateByPhase, RevisionCountPerRun, WorkflowAnalyticsSummary)
 * - TC-07: Mapping helpers (PHASE_AGENT_MAP, PHASE_APPROVAL_MAP, EVENT_TYPE_LABELS)
 * - TC-08: WorkflowEventType bao gồm tất cả 9 loại event
 */

import { describe, it, expect } from "vitest";
import type {
  WorkflowRunStatus,
  WorkflowRun,
  WorkflowEvent,
  CreateWorkflowRunInput,
  CreateWorkflowEventInput,
  WorkflowEventType,
  PhaseAvgDuration,
  ApprovalRateByPhase,
  RevisionCountPerRun,
  WorkflowAnalyticsSummary,
  WorkflowPhaseName,
  WorkflowAgentName,
  WorkflowPhaseStatus,
  ApprovalType,
  ApprovalDecision,
  WorkflowPhase,
  WorkflowApproval,
  CreateWorkflowPhaseInput,
  CompleteWorkflowPhaseInput,
  CreateWorkflowApprovalInput,
} from "./types.js";

import {
  PHASE_AGENT_MAP,
  PHASE_APPROVAL_MAP,
  EVENT_TYPE_LABELS,
} from "./types.js";

describe("US-01: TypeScript Types (types.ts)", () => {
  // ==========================================================================
  // TC-01: WorkflowRunStatus includes "rejected" (AC1)
  // ==========================================================================
  describe("TC-01: WorkflowRunStatus", () => {
    it("should allow 'running' status", () => {
      const status: WorkflowRunStatus = "running";
      expect(status).toBe("running");
    });

    it("should allow 'completed' status", () => {
      const status: WorkflowRunStatus = "completed";
      expect(status).toBe("completed");
    });

    it("should allow 'failed' status", () => {
      const status: WorkflowRunStatus = "failed";
      expect(status).toBe("failed");
    });

    it("should allow 'rejected' status (AC1 — MỚI)", () => {
      const status: WorkflowRunStatus = "rejected";
      expect(status).toBe("rejected");
    });
  });

  // ==========================================================================
  // TC-02: WorkflowRun interface có field created_by (AC1, AC5)
  // ==========================================================================
  describe("TC-02: WorkflowRun interface", () => {
    it("should have created_by field (AC1)", () => {
      const run: WorkflowRun = {
        id: "uuid-1",
        thread_id: "thread-1",
        feature_request: "test feature",
        status: "running",
        created_by: "pm-john",
        started_at: new Date(),
        completed_at: null,
        total_duration_ms: null,
        metadata: {},
      };
      expect(run.created_by).toBe("pm-john");
    });

    it("should allow status 'rejected'", () => {
      const run: WorkflowRun = {
        id: "uuid-2",
        thread_id: "thread-2",
        feature_request: "rejected feature",
        status: "rejected",
        created_by: "system",
        started_at: new Date(),
        completed_at: new Date(),
        total_duration_ms: 5000,
        metadata: { reason: "test" },
      };
      expect(run.status).toBe("rejected");
      expect(run.completed_at).not.toBeNull();
    });

    it("should allow nullable fields (completed_at, total_duration_ms)", () => {
      const run: WorkflowRun = {
        id: "uuid-3",
        thread_id: "thread-3",
        feature_request: "running feature",
        status: "running",
        created_by: "system",
        started_at: new Date(),
        completed_at: null,
        total_duration_ms: null,
        metadata: {},
      };
      expect(run.completed_at).toBeNull();
      expect(run.total_duration_ms).toBeNull();
    });

    it("should support metadata as Record<string, unknown>", () => {
      const run: WorkflowRun = {
        id: "uuid-4",
        thread_id: "thread-4",
        feature_request: "test",
        status: "completed",
        created_by: "pm",
        started_at: new Date(),
        completed_at: new Date(),
        total_duration_ms: 10000,
        metadata: { custom_key: "custom_value", nested: { a: 1 } },
      };
      expect(run.metadata).toHaveProperty("custom_key");
      expect(run.metadata).toHaveProperty("nested");
    });
  });

  // ==========================================================================
  // TC-03: WorkflowEvent interface (AC2, AC5)
  // ==========================================================================
  describe("TC-03: WorkflowEvent interface", () => {
    it("should have human_feedback field (AC2)", () => {
      const event: WorkflowEvent = {
        id: "evt-1",
        workflow_run_id: "run-1",
        workflow_phase_id: "phase-1",
        event_type: "rejected",
        agent_name: "po",
        input_data: { featureRequest: "test" },
        output_data: { userStories: "stories" },
        human_feedback: "Please add more details",
        duration_ms: 100,
        metadata: {},
        created_at: new Date(),
      };
      expect(event.human_feedback).toBe("Please add more details");
    });

    it("should have JSONB input_data and output_data (AC2 — Record<string, unknown> | null)", () => {
      const event: WorkflowEvent = {
        id: "evt-2",
        workflow_run_id: "run-1",
        workflow_phase_id: null,
        event_type: "agent_complete",
        agent_name: "ba",
        input_data: { featureRequest: "test", userStories: "stories" },
        output_data: { designDocument: "design doc content" },
        human_feedback: null,
        duration_ms: 5000,
        metadata: {},
        created_at: new Date(),
      };
      expect(event.input_data).toBeTypeOf("object");
      expect(event.output_data).toBeTypeOf("object");
      expect(event.input_data).toHaveProperty("featureRequest");
      expect(event.output_data).toHaveProperty("designDocument");
    });

    it("should allow null for optional fields", () => {
      const event: WorkflowEvent = {
        id: "evt-3",
        workflow_run_id: "run-1",
        workflow_phase_id: null,
        event_type: "workflow_started",
        agent_name: null,
        input_data: null,
        output_data: null,
        human_feedback: null,
        duration_ms: null,
        metadata: {},
        created_at: new Date(),
      };
      expect(event.workflow_phase_id).toBeNull();
      expect(event.agent_name).toBeNull();
      expect(event.input_data).toBeNull();
      expect(event.output_data).toBeNull();
      expect(event.human_feedback).toBeNull();
      expect(event.duration_ms).toBeNull();
    });
  });

  // ==========================================================================
  // TC-04: CreateWorkflowRunInput (AC1, AC5)
  // ==========================================================================
  describe("TC-04: CreateWorkflowRunInput", () => {
    it("should allow created_by as optional field", () => {
      const input1: CreateWorkflowRunInput = {
        thread_id: "thread-1",
        feature_request: "test feature",
      };
      expect(input1.created_by).toBeUndefined();

      const input2: CreateWorkflowRunInput = {
        thread_id: "thread-2",
        feature_request: "test feature 2",
        created_by: "pm-john",
      };
      expect(input2.created_by).toBe("pm-john");
    });

    it("should require thread_id and feature_request", () => {
      const input: CreateWorkflowRunInput = {
        thread_id: "t-1",
        feature_request: "fr-1",
      };
      expect(input.thread_id).toBe("t-1");
      expect(input.feature_request).toBe("fr-1");
    });

    it("should allow metadata as optional", () => {
      const input: CreateWorkflowRunInput = {
        thread_id: "t-1",
        feature_request: "fr-1",
        metadata: { source: "api" },
      };
      expect(input.metadata).toHaveProperty("source");
    });
  });

  // ==========================================================================
  // TC-05: CreateWorkflowEventInput (AC2, AC5)
  // ==========================================================================
  describe("TC-05: CreateWorkflowEventInput", () => {
    it("should have human_feedback as optional", () => {
      const input: CreateWorkflowEventInput = {
        workflow_run_id: "run-1",
        event_type: "rejected",
        human_feedback: "Needs more work",
      };
      expect(input.human_feedback).toBe("Needs more work");
    });

    it("should have input_data and output_data as Record<string, unknown>", () => {
      const input: CreateWorkflowEventInput = {
        workflow_run_id: "run-1",
        event_type: "agent_complete",
        input_data: { featureRequest: "test" },
        output_data: { userStories: "stories" },
      };
      expect(input.input_data).toHaveProperty("featureRequest");
      expect(input.output_data).toHaveProperty("userStories");
    });

    it("should allow all fields to be optional except workflow_run_id and event_type", () => {
      const minInput: CreateWorkflowEventInput = {
        workflow_run_id: "run-1",
        event_type: "workflow_started",
      };
      expect(minInput.workflow_phase_id).toBeUndefined();
      expect(minInput.agent_name).toBeUndefined();
      expect(minInput.input_data).toBeUndefined();
      expect(minInput.output_data).toBeUndefined();
      expect(minInput.human_feedback).toBeUndefined();
      expect(minInput.duration_ms).toBeUndefined();
      expect(minInput.metadata).toBeUndefined();
    });
  });

  // ==========================================================================
  // TC-06: Analytics types (AC4, AC5)
  // ==========================================================================
  describe("TC-06: Analytics Response Types", () => {
    it("PhaseAvgDuration should have correct shape", () => {
      const pad: PhaseAvgDuration = {
        phase_name: "requirements",
        avg_duration_ms: 5000,
        min_duration_ms: 2000,
        max_duration_ms: 8000,
        total_executions: 10,
      };
      expect(pad.phase_name).toBe("requirements");
      expect(pad.avg_duration_ms).toBe(5000);
      expect(pad.min_duration_ms).toBe(2000);
      expect(pad.max_duration_ms).toBe(8000);
      expect(pad.total_executions).toBe(10);
    });

    it("ApprovalRateByPhase should have correct shape", () => {
      const arb: ApprovalRateByPhase = {
        approval_type: "requirements_approval",
        total_decisions: 20,
        approved_count: 15,
        rejected_count: 5,
        approval_rate_percent: 75.0,
      };
      expect(arb.approval_type).toBe("requirements_approval");
      expect(arb.total_decisions).toBe(20);
      expect(arb.approved_count + arb.rejected_count).toBe(arb.total_decisions);
      expect(arb.approval_rate_percent).toBe(75.0);
    });

    it("RevisionCountPerRun should have correct shape", () => {
      const rcr: RevisionCountPerRun = {
        workflow_run_id: "run-1",
        feature_request: "test feature",
        status: "completed",
        total_revisions: 3,
        revisions_by_phase: {
          requirements: 1,
          design: 2,
        },
      };
      expect(rcr.total_revisions).toBe(3);
      expect(rcr.revisions_by_phase.requirements).toBe(1);
      expect(rcr.revisions_by_phase.design).toBe(2);
    });

    it("WorkflowAnalyticsSummary should have correct shape", () => {
      const summary: WorkflowAnalyticsSummary = {
        total_runs: 100,
        running_count: 5,
        completed_count: 80,
        failed_count: 10,
        rejected_count: 5,
        avg_total_duration_ms: 30000,
        avg_phases_per_run: 4.2,
        total_events: 500,
        date_range: {
          earliest: new Date("2024-01-01"),
          latest: new Date("2024-12-31"),
        },
      };
      expect(summary.total_runs).toBe(100);
      expect(summary.running_count + summary.completed_count + summary.failed_count + summary.rejected_count).toBe(100);
      expect(summary.avg_total_duration_ms).toBe(30000);
      expect(summary.date_range.earliest).not.toBeNull();
      expect(summary.date_range.latest).not.toBeNull();
    });

    it("WorkflowAnalyticsSummary should allow null date_range and avg_total_duration_ms", () => {
      const emptySummary: WorkflowAnalyticsSummary = {
        total_runs: 0,
        running_count: 0,
        completed_count: 0,
        failed_count: 0,
        rejected_count: 0,
        avg_total_duration_ms: null,
        avg_phases_per_run: 0,
        total_events: 0,
        date_range: {
          earliest: null,
          latest: null,
        },
      };
      expect(emptySummary.total_runs).toBe(0);
      expect(emptySummary.avg_total_duration_ms).toBeNull();
      expect(emptySummary.date_range.earliest).toBeNull();
    });
  });

  // ==========================================================================
  // TC-07: Mapping helpers
  // ==========================================================================
  describe("TC-07: Mapping Helpers", () => {
    it("PHASE_AGENT_MAP should map all 4 phases to correct agents", () => {
      expect(PHASE_AGENT_MAP.requirements).toBe("po");
      expect(PHASE_AGENT_MAP.design).toBe("ba");
      expect(PHASE_AGENT_MAP.development).toBe("dev");
      expect(PHASE_AGENT_MAP.testing).toBe("tester");
      expect(Object.keys(PHASE_AGENT_MAP)).toHaveLength(4);
    });

    it("PHASE_APPROVAL_MAP should map all 4 phases to correct approval types", () => {
      expect(PHASE_APPROVAL_MAP.requirements).toBe("requirements_approval");
      expect(PHASE_APPROVAL_MAP.design).toBe("design_approval");
      expect(PHASE_APPROVAL_MAP.development).toBe("code_review");
      expect(PHASE_APPROVAL_MAP.testing).toBe("release_approval");
      expect(Object.keys(PHASE_APPROVAL_MAP)).toHaveLength(4);
    });

    it("EVENT_TYPE_LABELS should have labels for all 9 event types", () => {
      const expectedEventTypes: WorkflowEventType[] = [
        "workflow_started",
        "workflow_completed",
        "workflow_failed",
        "agent_start",
        "agent_complete",
        "approval_request",
        "approved",
        "rejected",
        "feedback_given",
      ];
      expect(Object.keys(EVENT_TYPE_LABELS)).toHaveLength(9);
      for (const et of expectedEventTypes) {
        expect(EVENT_TYPE_LABELS[et]).toBeDefined();
        expect(typeof EVENT_TYPE_LABELS[et]).toBe("string");
        expect(EVENT_TYPE_LABELS[et].length).toBeGreaterThan(0);
      }
    });
  });

  // ==========================================================================
  // TC-08: WorkflowEventType (9 loại)
  // ==========================================================================
  describe("TC-08: WorkflowEventType completeness", () => {
    it("should accept all 9 event types", () => {
      const events: WorkflowEventType[] = [
        "workflow_started",
        "workflow_completed",
        "workflow_failed",
        "agent_start",
        "agent_complete",
        "approval_request",
        "approved",
        "rejected",
        "feedback_given",
      ];
      expect(events).toHaveLength(9);
      // Verify all can be assigned
      events.forEach((e) => {
        const typed: WorkflowEventType = e;
        expect(typed).toBe(e);
      });
    });
  });

  // ==========================================================================
  // TC-09: WorkflowPhase interface
  // ==========================================================================
  describe("TC-09: WorkflowPhase interface", () => {
    it("should have all required fields including retry_count and metadata", () => {
      const phase: WorkflowPhase = {
        id: "phase-1",
        workflow_run_id: "run-1",
        phase_name: "requirements",
        agent_name: "po",
        status: "in_progress",
        input_summary: "feature request text",
        output_summary: null,
        started_at: new Date(),
        completed_at: null,
        duration_ms: null,
        retry_count: 0,
        metadata: {},
      };
      expect(phase.retry_count).toBe(0);
      expect(phase.metadata).toEqual({});
    });

    it("should support all 4 phase statuses", () => {
      const statuses: WorkflowPhaseStatus[] = ["in_progress", "completed", "rejected", "revised"];
      expect(statuses).toHaveLength(4);
    });
  });

  // ==========================================================================
  // TC-10: WorkflowApproval interface
  // ==========================================================================
  describe("TC-10: WorkflowApproval interface", () => {
    it("should have all required fields", () => {
      const approval: WorkflowApproval = {
        id: "approval-1",
        workflow_phase_id: "phase-1",
        approval_type: "requirements_approval",
        decision: "approved",
        feedback: null,
        decided_at: new Date(),
        metadata: {},
      };
      expect(approval.decision).toBe("approved");
    });

    it("should support both approval decisions", () => {
      const decisions: ApprovalDecision[] = ["approved", "rejected"];
      expect(decisions).toHaveLength(2);
    });

    it("should support all 4 approval types", () => {
      const types: ApprovalType[] = [
        "requirements_approval",
        "design_approval",
        "code_review",
        "release_approval",
      ];
      expect(types).toHaveLength(4);
    });
  });
});
