import { Router, Request, Response } from "express";
import { HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { buildDevTeamGraph } from "../dev-team/graph.js";
import { requireFields } from "./middleware.js";
import { logger } from "../utils/logger.js";
import { generateThreadId } from "../utils/helpers.js";

const router = Router();

// Singleton dev team graph
let devTeamGraph: ReturnType<typeof buildDevTeamGraph> | null = null;

function getDevTeamGraph() {
  if (!devTeamGraph) {
    devTeamGraph = buildDevTeamGraph();
    logger.info("🏗️ Dev Team Graph initialized");
  }
  return devTeamGraph;
}

/**
 * POST /api/dev-team/start
 * Bắt đầu workflow với feature request mới
 *
 * US-01: Truyền threadId vào graph input để inject_context có thể tạo workflow_runs record.
 *        Response bao gồm workflowRunId (nullable — null nếu DB lỗi, graceful degradation).
 */
router.post(
  "/start",
  requireFields("featureRequest"),
  async (req: Request, res: Response) => {
    try {
      const { featureRequest } = req.body;
      const threadId = generateThreadId();
      const graph = getDevTeamGraph();

      const config = {
        configurable: { thread_id: threadId },
      };

      logger.info(`📝 New feature request: "${featureRequest.substring(0, 80)}..."`);

      // Start the workflow - it will pause at first interrupt
      // US-01: truyền threadId vào state để inject_context đọc được
      const result = await graph.invoke(
        {
          featureRequest,
          threadId,
          messages: [new HumanMessage(featureRequest)],
        },
        config
      );

      // Get the state to see interrupt info
      const state = await graph.getState(config);

      res.json({
        success: true,
        data: {
          threadId,
          workflowRunId: result.workflowRunId || null, // US-01: trả workflowRunId
          currentPhase: result.currentPhase || "requirements",
          status: state.next?.length ? "waiting_approval" : "completed",
          pendingApproval: state.tasks?.[0]?.interrupts?.[0]?.value || null,
          output: {
            userStories: result.userStories || null,
            designDocument: result.designDocument || null,
            sourceCode: result.sourceCode || null,
            testResults: result.testResults || null,
          },
        },
      });
    } catch (error) {
      logger.error("Dev team start error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to start workflow",
      });
    }
  }
);

/**
 * POST /api/dev-team/approve
 * Duyệt/từ chối tại một approval gate
 *
 * US-01: Response bao gồm workflowRunId.
 */
router.post(
  "/approve",
  requireFields("threadId", "action"),
  async (req: Request, res: Response) => {
    try {
      const { threadId, action, feedback } = req.body;
      const graph = getDevTeamGraph();

      const config = {
        configurable: { thread_id: threadId },
      };

      if (!["approve", "reject"].includes(action)) {
        res.status(400).json({
          success: false,
          error: "Action must be 'approve' or 'reject'",
        });
        return;
      }

      logger.info(`🔒 Approval: ${action} (thread: ${threadId})`);

      // Resume the graph with the human's decision
      const result = await graph.invoke(
        new Command({
          resume: { action, feedback: feedback || "" },
        }),
        config
      );

      // Check if there's another interrupt waiting
      const state = await graph.getState(config);

      res.json({
        success: true,
        data: {
          threadId,
          workflowRunId: result.workflowRunId || null, // US-01
          currentPhase: result.currentPhase,
          status:
            result.currentPhase === "done"
              ? "completed"
              : state.next?.length
                ? "waiting_approval"
                : "processing",
          pendingApproval: state.tasks?.[0]?.interrupts?.[0]?.value || null,
          output: {
            userStories: result.userStories || null,
            designDocument: result.designDocument || null,
            sourceCode: result.sourceCode || null,
            testResults: result.testResults || null,
          },
        },
      });
    } catch (error) {
      logger.error("Approval error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Approval failed",
      });
    }
  }
);

/**
 * GET /api/dev-team/status/:threadId
 * Xem trạng thái hiện tại của workflow
 *
 * US-01: Response bao gồm workflowRunId.
 */
router.get("/status/:threadId", async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const graph = getDevTeamGraph();

    const config = {
      configurable: { thread_id: threadId },
    };

    const state = await graph.getState(config);

    if (!state.values) {
      res.status(404).json({
        success: false,
        error: "Workflow not found",
      });
      return;
    }

    res.json({
      success: true,
      data: {
        threadId,
        workflowRunId: state.values.workflowRunId || null, // US-01
        currentPhase: state.values.currentPhase,
        status: state.next?.length ? "waiting_approval" : "processing",
        pendingApproval: state.tasks?.[0]?.interrupts?.[0]?.value || null,
        output: {
          userStories: state.values.userStories || null,
          designDocument: state.values.designDocument || null,
          sourceCode: state.values.sourceCode || null,
          testResults: state.values.testResults || null,
        },
      },
    });
  } catch (error) {
    logger.error("Status check error:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Status check failed",
    });
  }
});

export { router as devTeamRoutes };
