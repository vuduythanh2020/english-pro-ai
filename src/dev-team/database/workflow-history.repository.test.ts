/**
 * Unit Tests cho workflow-history.repository.ts — US-01
 * =====================================================
 * Mock PostgreSQL pool.query() để test logic của repository functions
 * mà không cần kết nối DB thật.
 *
 * Test Coverage:
 * - TC-11: createWorkflowRun — thêm created_by (AC1)
 * - TC-12: updateWorkflowRunStatus — hỗ trợ 'rejected' (AC1)
 * - TC-13: createWorkflowEvent — human_feedback + JSONB input/output (AC2)
 * - TC-14: getWorkflowStats — bao gồm rejected count (AC4)
 * - TC-15: getPhaseAvgDurations (AC4)
 * - TC-16: getApprovalRates (AC4)
 * - TC-17: getRevisionCountPerRun (AC4)
 * - TC-18: getWorkflowAnalyticsSummary (AC4)
 * - TC-19: Graceful degradation — DB error → return null/default (BR-04)
 * - TC-20: createWorkflowPhase — retry_count starts at 0
 * - TC-21: updateWorkflowPhaseStatus — rejected → retry_count +1 (BR-03)
 * - TC-22: completeWorkflowPhase — auto-calculate duration (BR-02)
 * - TC-23: createWorkflowApproval — approval record creation
 * - TC-24: Barrel exports from index.ts
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Mock pool.query trước khi import repository
const mockQuery = vi.fn();
vi.mock("../../config/database.config.js", () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

// Mock logger để tránh output nhiễu
vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  createWorkflowRun,
  updateWorkflowRunStatus,
  updateWorkflowRunMetadata,
  getWorkflowRunByThreadId,
  getWorkflowRunById,
  listWorkflowRuns,
  createWorkflowPhase,
  completeWorkflowPhase,
  updateWorkflowPhaseStatus,
  incrementPhaseRetryCount,
  getPhasesByWorkflowRunId,
  getLatestPhase,
  createWorkflowApproval,
  getApprovalsByPhaseId,
  getApprovalsByWorkflowRunId,
  createWorkflowEvent,
  getEventsByWorkflowRunId,
  getEventsByPhaseId,
  getEventsByType,
  getEventTimeline,
  getWorkflowStats,
  getPhaseRetryStats,
  getWorkflowRunDetail,
  getPhaseAvgDurations,
  getApprovalRates,
  getRevisionCountPerRun,
  getWorkflowAnalyticsSummary,
} from "./workflow-history.repository.js";

import type {
  WorkflowRun,
  WorkflowPhase,
  WorkflowApproval,
  WorkflowEvent,
  WorkflowStats,
  CreateWorkflowRunInput,
  CreateWorkflowEventInput,
} from "./types.js";

describe("US-01: Workflow History Repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // TC-11: createWorkflowRun — thêm created_by (AC1)
  // ==========================================================================
  describe("TC-11: createWorkflowRun", () => {
    it("should include created_by in INSERT query", async () => {
      const mockRun: WorkflowRun = {
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
      mockQuery.mockResolvedValueOnce({ rows: [mockRun] });

      const result = await createWorkflowRun({
        thread_id: "thread-1",
        feature_request: "test feature",
        created_by: "pm-john",
      });

      expect(result).not.toBeNull();
      expect(result!.created_by).toBe("pm-john");
      
      // Verify query includes created_by parameter
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const callArgs = mockQuery.mock.calls[0];
      const sql: string = callArgs[0];
      const params: unknown[] = callArgs[1];
      
      expect(sql).toContain("created_by");
      expect(params).toContain("pm-john");
    });

    it("should default created_by to 'system' when not provided (BR-07)", async () => {
      const mockRun: WorkflowRun = {
        id: "uuid-2",
        thread_id: "thread-2",
        feature_request: "test",
        status: "running",
        created_by: "system",
        started_at: new Date(),
        completed_at: null,
        total_duration_ms: null,
        metadata: {},
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockRun] });

      const result = await createWorkflowRun({
        thread_id: "thread-2",
        feature_request: "test",
        // no created_by
      });

      expect(result).not.toBeNull();
      // Verify 'system' was passed as parameter
      const params = mockQuery.mock.calls[0][1];
      expect(params).toContain("system");
    });

    it("should handle metadata correctly", async () => {
      const mockRun: WorkflowRun = {
        id: "uuid-3",
        thread_id: "thread-3",
        feature_request: "test",
        status: "running",
        created_by: "system",
        started_at: new Date(),
        completed_at: null,
        total_duration_ms: null,
        metadata: { source: "api" },
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockRun] });

      await createWorkflowRun({
        thread_id: "thread-3",
        feature_request: "test",
        metadata: { source: "api" },
      });

      const params = mockQuery.mock.calls[0][1];
      // Metadata should be JSON stringified
      expect(params).toContain(JSON.stringify({ source: "api" }));
    });
  });

  // ==========================================================================
  // TC-12: updateWorkflowRunStatus — hỗ trợ 'rejected' (AC1)
  // ==========================================================================
  describe("TC-12: updateWorkflowRunStatus", () => {
    it("should support 'rejected' status", async () => {
      const mockRun: WorkflowRun = {
        id: "uuid-1",
        thread_id: "thread-1",
        feature_request: "test",
        status: "rejected",
        created_by: "system",
        started_at: new Date(),
        completed_at: new Date(),
        total_duration_ms: 5000,
        metadata: {},
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockRun] });

      const result = await updateWorkflowRunStatus("uuid-1", "rejected");

      expect(result).not.toBeNull();
      expect(result!.status).toBe("rejected");
      
      const params = mockQuery.mock.calls[0][1];
      expect(params[0]).toBe("rejected");
      expect(params[1]).toBe("uuid-1");
    });

    it("should support 'completed' status", async () => {
      const mockRun: WorkflowRun = {
        id: "uuid-1",
        thread_id: "thread-1",
        feature_request: "test",
        status: "completed",
        created_by: "system",
        started_at: new Date(),
        completed_at: new Date(),
        total_duration_ms: 10000,
        metadata: {},
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockRun] });

      const result = await updateWorkflowRunStatus("uuid-1", "completed");

      expect(result).not.toBeNull();
      expect(result!.status).toBe("completed");
    });

    it("should support 'failed' status", async () => {
      const mockRun: WorkflowRun = {
        id: "uuid-1",
        thread_id: "thread-1",
        feature_request: "test",
        status: "failed",
        created_by: "system",
        started_at: new Date(),
        completed_at: new Date(),
        total_duration_ms: 3000,
        metadata: {},
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockRun] });

      const result = await updateWorkflowRunStatus("uuid-1", "failed");

      expect(result).not.toBeNull();
      expect(result!.status).toBe("failed");
    });

    it("should set completed_at = NOW() and calculate total_duration_ms (BR-02)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: "uuid-1", status: "completed" }] });

      await updateWorkflowRunStatus("uuid-1", "completed");

      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain("completed_at = NOW()");
      expect(sql).toContain("total_duration_ms");
      expect(sql).toContain("EXTRACT(EPOCH FROM (NOW() - started_at))");
    });

    it("should return null when run not found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await updateWorkflowRunStatus("non-existent", "completed");
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // TC-13: createWorkflowEvent — human_feedback + JSONB (AC2)
  // ==========================================================================
  describe("TC-13: createWorkflowEvent", () => {
    it("should include human_feedback in INSERT query (AC2)", async () => {
      const mockEvent: WorkflowEvent = {
        id: "evt-1",
        workflow_run_id: "run-1",
        workflow_phase_id: "phase-1",
        event_type: "rejected",
        agent_name: "po",
        input_data: null,
        output_data: null,
        human_feedback: "Need more details",
        duration_ms: null,
        metadata: {},
        created_at: new Date(),
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockEvent] });

      const result = await createWorkflowEvent({
        workflow_run_id: "run-1",
        workflow_phase_id: "phase-1",
        event_type: "rejected",
        agent_name: "po",
        human_feedback: "Need more details",
      });

      expect(result).not.toBeNull();
      expect(result!.human_feedback).toBe("Need more details");

      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain("human_feedback");
      
      const params = mockQuery.mock.calls[0][1];
      expect(params).toContain("Need more details");
    });

    it("should cast input_data and output_data as ::jsonb (AC2)", async () => {
      const mockEvent: WorkflowEvent = {
        id: "evt-2",
        workflow_run_id: "run-1",
        workflow_phase_id: "phase-1",
        event_type: "agent_complete",
        agent_name: "po",
        input_data: { featureRequest: "test" },
        output_data: { userStories: "stories" },
        human_feedback: null,
        duration_ms: 5000,
        metadata: {},
        created_at: new Date(),
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockEvent] });

      await createWorkflowEvent({
        workflow_run_id: "run-1",
        workflow_phase_id: "phase-1",
        event_type: "agent_complete",
        agent_name: "po",
        input_data: { featureRequest: "test" },
        output_data: { userStories: "stories" },
        duration_ms: 5000,
      });

      const sql: string = mockQuery.mock.calls[0][0];
      // Verify JSONB casting for input_data and output_data
      expect(sql).toContain("::jsonb");
      
      const params = mockQuery.mock.calls[0][1];
      // JSON.stringify should be called for input_data and output_data
      expect(params).toContain(JSON.stringify({ featureRequest: "test" }));
      expect(params).toContain(JSON.stringify({ userStories: "stories" }));
    });

    it("should handle null input_data and output_data", async () => {
      const mockEvent: WorkflowEvent = {
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
      mockQuery.mockResolvedValueOnce({ rows: [mockEvent] });

      const result = await createWorkflowEvent({
        workflow_run_id: "run-1",
        event_type: "workflow_started",
      });

      expect(result).not.toBeNull();
      const params = mockQuery.mock.calls[0][1];
      // null should be passed for optional fields
      expect(params[1]).toBeNull(); // workflow_phase_id
      expect(params[3]).toBeNull(); // agent_name
      expect(params[4]).toBeNull(); // input_data
      expect(params[5]).toBeNull(); // output_data
      expect(params[6]).toBeNull(); // human_feedback
      expect(params[7]).toBeNull(); // duration_ms
    });

    it("should handle all 9 event types", async () => {
      const eventTypes = [
        "workflow_started",
        "workflow_completed",
        "workflow_failed",
        "agent_start",
        "agent_complete",
        "approval_request",
        "approved",
        "rejected",
        "feedback_given",
      ] as const;

      for (const eventType of eventTypes) {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: `evt-${eventType}`, event_type: eventType }],
        });

        const result = await createWorkflowEvent({
          workflow_run_id: "run-1",
          event_type: eventType,
        });

        expect(result).not.toBeNull();
      }
      expect(mockQuery).toHaveBeenCalledTimes(9);
    });
  });

  // ==========================================================================
  // TC-14: getWorkflowStats — bao gồm rejected count (AC4)
  // ==========================================================================
  describe("TC-14: getWorkflowStats", () => {
    it("should return stats including rejected count", async () => {
      const mockStats = {
        total_runs: 10,
        running: 2,
        completed: 5,
        failed: 1,
        rejected: 2,
        avg_duration_ms: 15000,
        avg_retry_count: 0.5,
        total_events: 50,
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockStats] });

      const stats = await getWorkflowStats();

      expect(stats.rejected).toBe(2);
      expect(stats.total_runs).toBe(10);
      expect(stats.running).toBe(2);
      expect(stats.completed).toBe(5);
      expect(stats.failed).toBe(1);
      
      // Verify SQL includes rejected count
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain("rejected");
    });

    it("should return default stats on error (BR-04)", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB connection failed"));

      const stats = await getWorkflowStats();

      expect(stats.total_runs).toBe(0);
      expect(stats.running).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.rejected).toBe(0);
      expect(stats.avg_duration_ms).toBeNull();
      expect(stats.total_events).toBe(0);
    });
  });

  // ==========================================================================
  // TC-15: getPhaseAvgDurations (AC4)
  // ==========================================================================
  describe("TC-15: getPhaseAvgDurations", () => {
    it("should return average durations per phase", async () => {
      const mockData = [
        { phase_name: "requirements", avg_duration_ms: 5000, min_duration_ms: 2000, max_duration_ms: 8000, total_executions: 10 },
        { phase_name: "design", avg_duration_ms: 8000, min_duration_ms: 3000, max_duration_ms: 15000, total_executions: 8 },
      ];
      mockQuery.mockResolvedValueOnce({ rows: mockData });

      const result = await getPhaseAvgDurations();

      expect(result).toHaveLength(2);
      expect(result[0].phase_name).toBe("requirements");
      expect(result[0].avg_duration_ms).toBe(5000);
      expect(result[1].phase_name).toBe("design");

      // Verify query filters completed phases
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain("status = 'completed'");
      expect(sql).toContain("duration_ms IS NOT NULL");
      expect(sql).toContain("GROUP BY phase_name");
    });

    it("should return empty array on error (BR-04)", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      const result = await getPhaseAvgDurations();
      expect(result).toEqual([]);
    });
  });

  // ==========================================================================
  // TC-16: getApprovalRates (AC4)
  // ==========================================================================
  describe("TC-16: getApprovalRates", () => {
    it("should return approval rates per approval type", async () => {
      const mockData = [
        {
          approval_type: "requirements_approval",
          total_decisions: 10,
          approved_count: 7,
          rejected_count: 3,
          approval_rate_percent: 70.0,
        },
      ];
      mockQuery.mockResolvedValueOnce({ rows: mockData });

      const result = await getApprovalRates();

      expect(result).toHaveLength(1);
      expect(result[0].approval_type).toBe("requirements_approval");
      expect(result[0].approved_count).toBe(7);
      expect(result[0].rejected_count).toBe(3);
      expect(result[0].approval_rate_percent).toBe(70.0);

      // Verify query groups by approval_type
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain("GROUP BY approval_type");
    });

    it("should return empty array on error (BR-04)", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      const result = await getApprovalRates();
      expect(result).toEqual([]);
    });
  });

  // ==========================================================================
  // TC-17: getRevisionCountPerRun (AC4)
  // ==========================================================================
  describe("TC-17: getRevisionCountPerRun", () => {
    it("should return revision counts per run", async () => {
      // First query: main revision data
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            workflow_run_id: "run-1",
            feature_request: "feature 1",
            status: "completed",
            total_revisions: 3,
          },
        ],
      });
      // Second query: per-phase breakdown
      mockQuery.mockResolvedValueOnce({
        rows: [
          { phase_name: "requirements", retry_count: 1 },
          { phase_name: "design", retry_count: 2 },
        ],
      });

      const result = await getRevisionCountPerRun(20, 0);

      expect(result).toHaveLength(1);
      expect(result[0].workflow_run_id).toBe("run-1");
      expect(result[0].total_revisions).toBe(3);
      expect(result[0].revisions_by_phase).toEqual({
        requirements: 1,
        design: 2,
      });
    });

    it("should support pagination (limit/offset)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getRevisionCountPerRun(10, 5);

      const params = mockQuery.mock.calls[0][1];
      expect(params[0]).toBe(10); // limit
      expect(params[1]).toBe(5); // offset
    });

    it("should return empty array on error (BR-04)", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      const result = await getRevisionCountPerRun();
      expect(result).toEqual([]);
    });
  });

  // ==========================================================================
  // TC-18: getWorkflowAnalyticsSummary (AC4)
  // ==========================================================================
  describe("TC-18: getWorkflowAnalyticsSummary", () => {
    it("should return full analytics summary", async () => {
      const mockSummary = {
        total_runs: 50,
        running_count: 5,
        completed_count: 35,
        failed_count: 5,
        rejected_count: 5,
        avg_total_duration_ms: 25000,
        avg_phases_per_run: 4.1,
        total_events: 200,
        earliest: new Date("2024-01-01"),
        latest: new Date("2024-06-30"),
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockSummary] });

      const result = await getWorkflowAnalyticsSummary();

      expect(result.total_runs).toBe(50);
      expect(result.running_count).toBe(5);
      expect(result.completed_count).toBe(35);
      expect(result.failed_count).toBe(5);
      expect(result.rejected_count).toBe(5);
      expect(result.avg_total_duration_ms).toBe(25000);
      expect(result.total_events).toBe(200);
      expect(result.date_range.earliest).toEqual(new Date("2024-01-01"));
      expect(result.date_range.latest).toEqual(new Date("2024-06-30"));
    });

    it("should return default summary on error (BR-04)", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));

      const result = await getWorkflowAnalyticsSummary();

      expect(result.total_runs).toBe(0);
      expect(result.running_count).toBe(0);
      expect(result.completed_count).toBe(0);
      expect(result.failed_count).toBe(0);
      expect(result.rejected_count).toBe(0);
      expect(result.avg_total_duration_ms).toBeNull();
      expect(result.avg_phases_per_run).toBe(0);
      expect(result.total_events).toBe(0);
      expect(result.date_range.earliest).toBeNull();
      expect(result.date_range.latest).toBeNull();
    });

    it("should return default summary when no rows returned", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getWorkflowAnalyticsSummary();

      expect(result.total_runs).toBe(0);
      expect(result.date_range.earliest).toBeNull();
    });
  });

  // ==========================================================================
  // TC-19: Graceful degradation — DB error → return null/default (BR-04)
  // ==========================================================================
  describe("TC-19: Graceful Degradation (BR-04)", () => {
    it("createWorkflowRun should return null on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("connection refused"));
      const result = await createWorkflowRun({
        thread_id: "t-1",
        feature_request: "test",
      });
      expect(result).toBeNull();
    });

    it("updateWorkflowRunStatus should return null on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("connection refused"));
      const result = await updateWorkflowRunStatus("id-1", "completed");
      expect(result).toBeNull();
    });

    it("updateWorkflowRunMetadata should return null on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      const result = await updateWorkflowRunMetadata("id-1", { key: "val" });
      expect(result).toBeNull();
    });

    it("getWorkflowRunByThreadId should return null on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      const result = await getWorkflowRunByThreadId("thread-1");
      expect(result).toBeNull();
    });

    it("getWorkflowRunById should return null on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      const result = await getWorkflowRunById("id-1");
      expect(result).toBeNull();
    });

    it("listWorkflowRuns should return empty array on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      const result = await listWorkflowRuns();
      expect(result).toEqual([]);
    });

    it("createWorkflowPhase should return null on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      const result = await createWorkflowPhase({
        workflow_run_id: "run-1",
        phase_name: "requirements",
        agent_name: "po",
      });
      expect(result).toBeNull();
    });

    it("completeWorkflowPhase should return null on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      const result = await completeWorkflowPhase("phase-1", {});
      expect(result).toBeNull();
    });

    it("updateWorkflowPhaseStatus should return null on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      const result = await updateWorkflowPhaseStatus("phase-1", "rejected");
      expect(result).toBeNull();
    });

    it("incrementPhaseRetryCount should return null on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      const result = await incrementPhaseRetryCount("phase-1");
      expect(result).toBeNull();
    });

    it("getPhasesByWorkflowRunId should return empty array on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      const result = await getPhasesByWorkflowRunId("run-1");
      expect(result).toEqual([]);
    });

    it("getLatestPhase should return null on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      const result = await getLatestPhase("run-1");
      expect(result).toBeNull();
    });

    it("createWorkflowApproval should return null on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      const result = await createWorkflowApproval({
        workflow_phase_id: "phase-1",
        approval_type: "requirements_approval",
        decision: "approved",
      });
      expect(result).toBeNull();
    });

    it("getApprovalsByPhaseId should return empty array on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      const result = await getApprovalsByPhaseId("phase-1");
      expect(result).toEqual([]);
    });

    it("getApprovalsByWorkflowRunId should return empty array on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      const result = await getApprovalsByWorkflowRunId("run-1");
      expect(result).toEqual([]);
    });

    it("createWorkflowEvent should return null on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      const result = await createWorkflowEvent({
        workflow_run_id: "run-1",
        event_type: "workflow_started",
      });
      expect(result).toBeNull();
    });

    it("getEventsByWorkflowRunId should return empty array on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      const result = await getEventsByWorkflowRunId("run-1");
      expect(result).toEqual([]);
    });

    it("getEventsByPhaseId should return empty array on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      const result = await getEventsByPhaseId("phase-1");
      expect(result).toEqual([]);
    });

    it("getEventsByType should return empty array on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      const result = await getEventsByType("run-1", "agent_start");
      expect(result).toEqual([]);
    });

    it("getPhaseRetryStats should return empty array on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      const result = await getPhaseRetryStats("run-1");
      expect(result).toEqual([]);
    });

    it("getWorkflowRunDetail should return null on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("DB error"));
      const result = await getWorkflowRunDetail("run-1");
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // TC-20: createWorkflowPhase — retry_count starts at 0
  // ==========================================================================
  describe("TC-20: createWorkflowPhase", () => {
    it("should set initial retry_count to 0", async () => {
      const mockPhase: WorkflowPhase = {
        id: "phase-1",
        workflow_run_id: "run-1",
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
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockPhase] });

      const result = await createWorkflowPhase({
        workflow_run_id: "run-1",
        phase_name: "requirements",
        agent_name: "po",
        input_summary: "test input",
      });

      expect(result).not.toBeNull();
      expect(result!.retry_count).toBe(0);
      
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain("retry_count");
      expect(sql).toContain("0"); // retry_count = 0
    });

    it("should set status to 'in_progress' by default", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "phase-1", status: "in_progress" }],
      });

      await createWorkflowPhase({
        workflow_run_id: "run-1",
        phase_name: "design",
        agent_name: "ba",
      });

      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain("'in_progress'");
    });
  });

  // ==========================================================================
  // TC-21: updateWorkflowPhaseStatus — rejected → retry_count +1 (BR-03)
  // ==========================================================================
  describe("TC-21: updateWorkflowPhaseStatus", () => {
    it("should increment retry_count when status is 'rejected' (BR-03)", async () => {
      const mockPhase: WorkflowPhase = {
        id: "phase-1",
        workflow_run_id: "run-1",
        phase_name: "requirements",
        agent_name: "po",
        status: "rejected",
        input_summary: null,
        output_summary: null,
        started_at: new Date(),
        completed_at: null,
        duration_ms: null,
        retry_count: 1,
        metadata: {},
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockPhase] });

      const result = await updateWorkflowPhaseStatus("phase-1", "rejected");

      expect(result).not.toBeNull();
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain("retry_count = retry_count + 1");
    });

    it("should NOT increment retry_count for non-rejected status", async () => {
      const mockPhase: WorkflowPhase = {
        id: "phase-1",
        workflow_run_id: "run-1",
        phase_name: "requirements",
        agent_name: "po",
        status: "completed",
        input_summary: null,
        output_summary: null,
        started_at: new Date(),
        completed_at: new Date(),
        duration_ms: 5000,
        retry_count: 0,
        metadata: {},
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockPhase] });

      await updateWorkflowPhaseStatus("phase-1", "completed");

      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).not.toContain("retry_count = retry_count + 1");
    });

    it("should return null when phase not found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await updateWorkflowPhaseStatus("non-existent", "rejected");
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // TC-22: completeWorkflowPhase — auto-calculate duration (BR-02)
  // ==========================================================================
  describe("TC-22: completeWorkflowPhase", () => {
    it("should auto-calculate duration_ms (BR-02)", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "phase-1", status: "completed", duration_ms: 5000 }],
      });

      await completeWorkflowPhase("phase-1", { output_summary: "done" });

      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain("duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000");
      expect(sql).toContain("status = 'completed'");
      expect(sql).toContain("completed_at = NOW()");
    });

    it("should merge metadata when provided", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "phase-1" }],
      });

      await completeWorkflowPhase("phase-1", {
        output_summary: "done",
        metadata: { lines_of_code: 100 },
      });

      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain("metadata");
      expect(sql).toContain("COALESCE(metadata, '{}'::jsonb)");
    });

    it("should return null when phase not found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await completeWorkflowPhase("non-existent", {});
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // TC-23: createWorkflowApproval
  // ==========================================================================
  describe("TC-23: createWorkflowApproval", () => {
    it("should create approval with correct parameters", async () => {
      const mockApproval: WorkflowApproval = {
        id: "approval-1",
        workflow_phase_id: "phase-1",
        approval_type: "requirements_approval",
        decision: "approved",
        feedback: null,
        decided_at: new Date(),
        metadata: {},
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockApproval] });

      const result = await createWorkflowApproval({
        workflow_phase_id: "phase-1",
        approval_type: "requirements_approval",
        decision: "approved",
      });

      expect(result).not.toBeNull();
      expect(result!.decision).toBe("approved");
    });

    it("should handle rejection with feedback", async () => {
      const mockApproval: WorkflowApproval = {
        id: "approval-2",
        workflow_phase_id: "phase-1",
        approval_type: "design_approval",
        decision: "rejected",
        feedback: "Design needs improvement",
        decided_at: new Date(),
        metadata: {},
      };
      mockQuery.mockResolvedValueOnce({ rows: [mockApproval] });

      const result = await createWorkflowApproval({
        workflow_phase_id: "phase-1",
        approval_type: "design_approval",
        decision: "rejected",
        feedback: "Design needs improvement",
      });

      expect(result).not.toBeNull();
      expect(result!.feedback).toBe("Design needs improvement");
    });
  });

  // ==========================================================================
  // TC-24: Barrel exports from index.ts
  // ==========================================================================
  describe("TC-24: Barrel exports (index.ts)", () => {
    it("should export all repository functions", async () => {
      // Import from barrel file
      const barrel = await import("./index.js");
      
      // Workflow Runs
      expect(barrel.createWorkflowRun).toBeDefined();
      expect(barrel.updateWorkflowRunStatus).toBeDefined();
      expect(barrel.updateWorkflowRunMetadata).toBeDefined();
      expect(barrel.getWorkflowRunByThreadId).toBeDefined();
      expect(barrel.getWorkflowRunById).toBeDefined();
      expect(barrel.listWorkflowRuns).toBeDefined();
      
      // Workflow Phases
      expect(barrel.createWorkflowPhase).toBeDefined();
      expect(barrel.completeWorkflowPhase).toBeDefined();
      expect(barrel.updateWorkflowPhaseStatus).toBeDefined();
      expect(barrel.incrementPhaseRetryCount).toBeDefined();
      expect(barrel.getPhasesByWorkflowRunId).toBeDefined();
      expect(barrel.getLatestPhase).toBeDefined();
      
      // Workflow Approvals
      expect(barrel.createWorkflowApproval).toBeDefined();
      expect(barrel.getApprovalsByPhaseId).toBeDefined();
      expect(barrel.getApprovalsByWorkflowRunId).toBeDefined();
      
      // Workflow Events
      expect(barrel.createWorkflowEvent).toBeDefined();
      expect(barrel.getEventsByWorkflowRunId).toBeDefined();
      expect(barrel.getEventsByPhaseId).toBeDefined();
      expect(barrel.getEventsByType).toBeDefined();
      expect(barrel.getEventTimeline).toBeDefined();
      
      // Stats & Queries (Legacy)
      expect(barrel.getWorkflowStats).toBeDefined();
      expect(barrel.getPhaseRetryStats).toBeDefined();
      expect(barrel.getWorkflowRunDetail).toBeDefined();
      
      // Analytics Queries (MỚI — US-01 AC4)
      expect(barrel.getPhaseAvgDurations).toBeDefined();
      expect(barrel.getApprovalRates).toBeDefined();
      expect(barrel.getRevisionCountPerRun).toBeDefined();
      expect(barrel.getWorkflowAnalyticsSummary).toBeDefined();
    });

    it("should export all mapping constants", async () => {
      const barrel = await import("./index.js");
      
      expect(barrel.PHASE_AGENT_MAP).toBeDefined();
      expect(barrel.PHASE_APPROVAL_MAP).toBeDefined();
      expect(barrel.EVENT_TYPE_LABELS).toBeDefined();
    });
  });

  // ==========================================================================
  // TC-25: Query helper functions
  // ==========================================================================
  describe("TC-25: Query helpers", () => {
    it("getWorkflowRunByThreadId should return latest run", async () => {
      const mockRun = { id: "run-1", thread_id: "thread-1" };
      mockQuery.mockResolvedValueOnce({ rows: [mockRun] });

      const result = await getWorkflowRunByThreadId("thread-1");
      
      expect(result).not.toBeNull();
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain("ORDER BY started_at DESC LIMIT 1");
    });

    it("getWorkflowRunByThreadId should return null when not found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await getWorkflowRunByThreadId("non-existent");
      expect(result).toBeNull();
    });

    it("listWorkflowRuns should respect limit and offset", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await listWorkflowRuns(10, 5);

      const params = mockQuery.mock.calls[0][1];
      expect(params[0]).toBe(10);
      expect(params[1]).toBe(5);
    });

    it("listWorkflowRuns should default to limit=20, offset=0", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await listWorkflowRuns();

      const params = mockQuery.mock.calls[0][1];
      expect(params[0]).toBe(20);
      expect(params[1]).toBe(0);
    });

    it("getEventTimeline should delegate to getEventsByWorkflowRunId", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: "evt-1" }] });

      const result = await getEventTimeline("run-1");

      expect(result).toHaveLength(1);
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain("workflow_run_id");
      expect(sql).toContain("ORDER BY created_at ASC");
    });

    it("getPhaseRetryStats should group by phase_name", async () => {
      const mockStats = [
        { phase_name: "requirements", total_retries: 2, avg_retries: 1.0, max_retries: 2 },
      ];
      mockQuery.mockResolvedValueOnce({ rows: mockStats });

      const result = await getPhaseRetryStats("run-1");

      expect(result).toHaveLength(1);
      expect(result[0].total_retries).toBe(2);
      
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain("GROUP BY phase_name");
    });

    it("getWorkflowRunDetail should aggregate phases, approvals, and events", async () => {
      // 1st call: getWorkflowRunById
      mockQuery.mockResolvedValueOnce({ rows: [{ id: "run-1", status: "completed" }] });
      // 2nd call: getPhasesByWorkflowRunId
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "phase-1", workflow_run_id: "run-1" }],
      });
      // 3rd call: getApprovalsByPhaseId (for phase-1)
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "approval-1", workflow_phase_id: "phase-1" }],
      });
      // 4th call: getEventsByWorkflowRunId
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "evt-1", workflow_run_id: "run-1" }],
      });

      const result = await getWorkflowRunDetail("run-1");

      expect(result).not.toBeNull();
      expect(result!.run.id).toBe("run-1");
      expect(result!.phases).toHaveLength(1);
      expect(result!.phases[0].approvals).toHaveLength(1);
      expect(result!.events).toHaveLength(1);
    });

    it("getWorkflowRunDetail should return null when run not found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await getWorkflowRunDetail("non-existent");
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // TC-26: incrementPhaseRetryCount
  // ==========================================================================
  describe("TC-26: incrementPhaseRetryCount", () => {
    it("should increment retry_count by 1", async () => {
      const mockPhase = { id: "phase-1", retry_count: 1 };
      mockQuery.mockResolvedValueOnce({ rows: [mockPhase] });

      const result = await incrementPhaseRetryCount("phase-1");

      expect(result).not.toBeNull();
      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain("retry_count = retry_count + 1");
    });

    it("should return null when phase not found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await incrementPhaseRetryCount("non-existent");
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // TC-27: updateWorkflowRunMetadata
  // ==========================================================================
  describe("TC-27: updateWorkflowRunMetadata", () => {
    it("should merge metadata using COALESCE || operator", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "run-1", metadata: { key1: "val1", key2: "val2" } }],
      });

      await updateWorkflowRunMetadata("run-1", { key2: "val2" });

      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain("COALESCE(metadata, '{}'::jsonb)");
      expect(sql).toContain("||");
    });

    it("should return null when run not found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await updateWorkflowRunMetadata("non-existent", {});
      expect(result).toBeNull();
    });
  });
});
