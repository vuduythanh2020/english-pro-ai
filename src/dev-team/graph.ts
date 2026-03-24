import { StateGraph, interrupt, Command, MemorySaver } from "@langchain/langgraph";
import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { DevTeamState, type DevTeamStateType } from "./state.js";
import { config } from "../config/env.js";
import { poAgentNode } from "./agents/po.agent.js";
import { baAgentNode } from "./agents/ba.agent.js";
import { devAgentNode } from "./agents/dev.agent.js";
import { testerAgentNode } from "./agents/tester.agent.js";
import { contextSyncAgentNode } from "./agents/context-sync.agent.js";
import { generateProjectContext } from "./project-context.js";
import { logger } from "../utils/logger.js";
import {
  createWorkflowRun,
  updateWorkflowRunStatus,
  updateWorkflowRunMetadata,
  createWorkflowApproval,
  updateWorkflowPhaseStatus,
  completeWorkflowPhase,
} from "./database/workflow-history.repository.js";
import type { ApprovalType } from "./database/types.js";

// US-03: Import Event Logger helpers
import {
  logWorkflowStarted,
  logWorkflowCompleted,
  logApprovalRequest,
  logApprovalDecision,
} from "./utils/event-logger.js";

// ============================================================================
// US-02: Approval/Rejection Tracking Helper
// ============================================================================

/**
 * Ghi nhận quyết định approve/reject vào database (US-02).
 *
 * Thiết kế DRY: gọi từ 4 approval gate functions thay vì duplicate logic.
 * Graceful degradation: mọi lỗi DB chỉ log warning, KHÔNG throw (AC4).
 * Guard clause: skip khi thiếu workflowRunId hoặc currentPhaseId (AC5).
 *
 * @param params.workflowRunId - UUID workflow run từ state
 * @param params.currentPhaseId - UUID phase hiện tại từ state
 * @param params.approvalType - Loại approval gate
 * @param params.decision - "approved" | "rejected"
 * @param params.feedback - Feedback từ PM (optional)
 * @param params.outputSummary - Tóm tắt output khi approved (optional)
 * @param params.rejectedStatus - Status khi reject: "rejected" (default) hoặc "revised"
 */
async function trackApprovalDecision(params: {
  workflowRunId: string;
  currentPhaseId: string;
  approvalType: ApprovalType;
  decision: "approved" | "rejected";
  feedback?: string;
  outputSummary?: string;
  rejectedStatus?: "rejected" | "revised";
}): Promise<void> {
  // --- AC5: Guard clause ---
  if (!params.workflowRunId || !params.currentPhaseId) {
    logger.warn(
      `⚠️ [ApprovalTracking] Skipping: workflowRunId="${params.workflowRunId}", ` +
      `currentPhaseId="${params.currentPhaseId}" (one or both empty)`
    );
    return;
  }

  // --- AC4: try/catch toàn bộ, graceful degradation ---
  try {
    // AC1: Tạo approval record
    await createWorkflowApproval({
      workflow_phase_id: params.currentPhaseId,
      approval_type: params.approvalType,
      decision: params.decision,
      feedback: params.feedback,
    });

    if (params.decision === "rejected") {
      // AC2: Cập nhật phase status → rejected (hoặc revised cho design revise)
      const status = params.rejectedStatus || "rejected";
      await updateWorkflowPhaseStatus(params.currentPhaseId, status);
    } else {
      // AC3: Đánh dấu phase hoàn thành với output_summary
      await completeWorkflowPhase(params.currentPhaseId, {
        output_summary: params.outputSummary || "Approved by PM",
      });
    }

    logger.info(
      `📊 [ApprovalTracking] ${params.approvalType} → ${params.decision} ` +
      `(phaseId: ${params.currentPhaseId})`
    );
  } catch (error) {
    // AC4: Graceful degradation — chỉ log warning, KHÔNG throw
    logger.warn("⚠️ [ApprovalTracking] DB error (graceful degradation):", error);
  }
}

// ============================================================================
// Approval Gate Nodes
// ============================================================================

/**
 * Human Approval Gate - Requirements
 * PO tạo User Stories → dừng để bạn duyệt
 */
async function requirementsApproval(
  state: DevTeamStateType
): Promise<Partial<DevTeamStateType>> {
  logger.info("🔒 Chờ Product Manager duyệt User Stories...");

  // --- US-03 AC3: Ghi event approval_request TRƯỚC interrupt() ---
  await logApprovalRequest({
    workflowRunId: state.workflowRunId,
    workflowPhaseId: state.currentPhaseId,
    approvalType: "requirements_approval",
    agentName: "po",
    contentPreview: state.userStories || "",
  });

  const approval = interrupt({
    type: "requirements_review",
    title: "📋 Duyệt User Stories",
    content: state.userStories,
    question:
      "Bạn có đồng ý với User Stories này không? (approve/reject + feedback)",
  }) as { action: "approve" | "reject"; feedback?: string };

  // --- US-03 AC3: Ghi event approved/rejected SAU interrupt() ---
  await logApprovalDecision({
    workflowRunId: state.workflowRunId,
    workflowPhaseId: state.currentPhaseId,
    approvalType: "requirements_approval",
    decision: approval.action === "approve" ? "approved" : "rejected",
    humanFeedback: approval.feedback,
  });

  // --- US-02: Track approval decision ---
  await trackApprovalDecision({
    workflowRunId: state.workflowRunId,
    currentPhaseId: state.currentPhaseId,
    approvalType: "requirements_approval",
    decision: approval.action === "approve" ? "approved" : "rejected",
    feedback: approval.feedback,
    outputSummary: approval.action === "approve"
      ? `User Stories approved. Content length: ${state.userStories?.length || 0} chars`
      : undefined,
  });

  if (approval.action === "reject") {
    logger.info("❌ User Stories bị từ chối. Chuyển lại PO Agent.");
    return {
      humanFeedback: approval.feedback || "Cần chỉnh sửa lại.",
      nextAgent: "po_agent",
    };
  }

  logger.info("✅ User Stories được duyệt. Chuyển sang bộ định tuyến US Router.");
  return {
    humanFeedback: "",
    nextAgent: "us_router", // Chuyển luồng sang router để bóc tách và chạy từng cái
    currentPhase: "design",
  };
}

/**
 * US Router Node - Tách User Stories và duyệt từng cái một (Agile Iterator)
 */
async function usRouterNode(
  state: DevTeamStateType
): Promise<Partial<DevTeamStateType>> {
  // Bóc tách text raw thành mảng nếu mảng hiện tại rỗng
  let stories = state.allUserStories || [];
  let currentIndex = state.currentUsIndex || 0;

  if (stories.length === 0 && state.userStories) {
    stories = state.userStories
      .split("===STORY_SEPARATOR===")
      .map(s => s.trim())
      .filter(s => s.length > 10);

    logger.info(`🔄 US Router: Đã bóc tách được ${stories.length} User Stories.`);
  }

  if (currentIndex < stories.length) {
    const nextStory = stories[currentIndex];
    logger.info(`📍 Đang đẩy User Story ${currentIndex + 1}/${stories.length} vào Sprint...`);

    return {
      allUserStories: stories,
      currentUsIndex: currentIndex + 1,
      userStories: nextStory,       // Ghi đè chỉ 1 story hiện hành
      designDocument: "",           // Reset context cho AI
      sourceCode: "",
      testResults: "",
      executionLogs: "",
      humanFeedback: "",
      nextAgent: "ba_agent",
      currentPhase: "design"
    };
  } else {
    logger.info(`✅ Toàn bộ ${stories.length} User Stories đã hoàn thành! Release Graph.`);

    // --- US-03: Ghi event workflow_completed TRƯỚC khi cập nhật status ---
    if (state.workflowRunId) {
      await logWorkflowCompleted({
        workflowRunId: state.workflowRunId,
        totalStories: stories.length,
      });
    }

    // --- US-01: Cập nhật trạng thái workflow run → completed ---
    if (state.workflowRunId) {
      try {
        await updateWorkflowRunStatus(state.workflowRunId, "completed");
        logger.info(`📊 Workflow run ${state.workflowRunId} → completed`);
      } catch (error) {
        logger.warn("⚠️ Failed to update workflow run status (graceful degradation):", error);
      }
    }

    // --- Generate Final Workflow Summary (LLM AI) ---
    let workflowSummary = "";
    const collectedSummaries = state.completedStorySummaries || [];
    if (collectedSummaries.length > 0) {
      logger.info(`🤖 Đang sinh bản báo cáo tổng kết workflow từ ${collectedSummaries.length} user stories...`);
      try {
        const llm = new ChatAnthropic({
          anthropicApiKey: config.anthropic.apiKey,
          modelName: "claude-sonnet-4.6",
          temperature: 0.2, // Low temp for factual summary
          maxTokens: 8192,
          clientOptions: config.anthropic.baseUrl
            ? { baseURL: config.anthropic.baseUrl, defaultHeaders: { Authorization: `Bearer ${config.anthropic.apiKey}` } }
            : undefined,
        });

        const prompt = [
          `Bạn là trợ lý kỹ thuật. Dựa trên báo cáo từ các sprint bên dưới,`,
          `hãy tạo BÁO CÁO TỔNG KẾT ngắn gọn (tiếng Việt, Markdown):`,
          ``,
          `### 📋 Tóm tắt công việc`,
          `### 📁 Files đã tạo/sửa`,
          `### 🚀 Hướng dẫn sử dụng`,
          `### ⚠️ Lưu ý`,
          ``,
          `Feature Request gốc: ${state.featureRequest || "(Không có)"}`,
          ``,
          collectedSummaries.join("\n---\n")
        ].join("\n");

        const response = await llm.invoke([
          new SystemMessage("Bạn là chuyên gia tổng hợp tài liệu kỹ thuật."),
          new HumanMessage(prompt),
        ]);

        workflowSummary = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
        logger.info(`✅ Đã sinh xong báo cáo tổng kết (${workflowSummary.length} chars).`);

        // Lưu vào database runtime metadata
        if (state.workflowRunId) {
          await updateWorkflowRunMetadata(state.workflowRunId, { summary: workflowSummary });
        }
      } catch (error) {
        logger.warn(`⚠️ Lỗi khi sinh báo cáo tổng hợp bằng LLM: ${error}`);
        // Fallback: Nếu LLM fail, nối các summaries lại thẳng luôn
        workflowSummary = collectedSummaries.join("\n\n---\n\n");
      }
    }

    return {
      allUserStories: stories,
      workflowSummary, // Trả vào state
      nextAgent: "done",
      currentPhase: "done",
    };
  }
}

/**
 * Human Approval Gate - Design
 * BA tạo Design Doc → dừng để bạn duyệt
 */
async function designApproval(
  state: DevTeamStateType
): Promise<Partial<DevTeamStateType>> {
  logger.info("🔒 Chờ Product Manager duyệt thiết kế...");

  // --- US-03 AC3: Ghi event approval_request TRƯỚC interrupt() ---
  await logApprovalRequest({
    workflowRunId: state.workflowRunId,
    workflowPhaseId: state.currentPhaseId,
    approvalType: "design_approval",
    agentName: "ba",
    contentPreview: state.designDocument || "",
  });

  if (config.workflow.autoApprove) {
    logger.info("⏩ [Auto-Approve] Tự động duyệt Design Document do cấu hình AUTO_APPROVE_ENABLED=true");

    await logApprovalDecision({
      workflowRunId: state.workflowRunId,
      workflowPhaseId: state.currentPhaseId,
      approvalType: "design_approval",
      decision: "approved",
      humanFeedback: "Auto-approved by system configuration",
    });

    await trackApprovalDecision({
      workflowRunId: state.workflowRunId,
      currentPhaseId: state.currentPhaseId,
      approvalType: "design_approval",
      decision: "approved",
      feedback: "Auto-approved by system configuration",
      outputSummary: `Design document auto-approved. Content length: ${state.designDocument?.length || 0} chars`,
    });

    return {
      humanFeedback: "",
      nextAgent: "dev_agent",
      currentPhase: "development",
    };
  }

  const approval = interrupt({
    type: "design_review",
    title: "📊 Duyệt Design Document",
    content: state.designDocument,
    question:
      "Chọn: (approve) duyệt / (reject) sửa design / (revise) quay lại sửa requirements",
  }) as { action: "approve" | "reject" | "revise"; feedback?: string };

  // --- US-03 AC3: Ghi event approved/rejected SAU interrupt() ---
  await logApprovalDecision({
    workflowRunId: state.workflowRunId,
    workflowPhaseId: state.currentPhaseId,
    approvalType: "design_approval",
    decision: approval.action === "approve" ? "approved" : "rejected",
    humanFeedback: approval.feedback,
  });

  // --- US-02: Track approval decision ---
  if (approval.action === "approve") {
    await trackApprovalDecision({
      workflowRunId: state.workflowRunId,
      currentPhaseId: state.currentPhaseId,
      approvalType: "design_approval",
      decision: "approved",
      feedback: approval.feedback,
      outputSummary: `Design document approved. Content length: ${state.designDocument?.length || 0} chars`,
    });
  } else {
    // Cả "reject" và "revise" đều ghi decision = "rejected" (BR-06)
    await trackApprovalDecision({
      workflowRunId: state.workflowRunId,
      currentPhaseId: state.currentPhaseId,
      approvalType: "design_approval",
      decision: "rejected",
      feedback: approval.feedback,
      rejectedStatus: approval.action === "revise" ? "revised" : "rejected",
    });
  }

  if (approval.action === "revise") {
    logger.info("🔙 Quay lại PO Agent để chỉnh sửa requirements...");
    return {
      humanFeedback: approval.feedback || "Cần chỉnh sửa lại requirements.",
      nextAgent: "po_agent",
      currentPhase: "requirements",
    };
  }

  if (approval.action === "reject") {
    logger.info("❌ Design bị từ chối. Chuyển lại BA Agent.");
    return {
      humanFeedback: approval.feedback || "Cần chỉnh sửa thiết kế.",
      nextAgent: "ba_agent",
    };
  }

  logger.info("✅ Design được duyệt. Chuyển sang DEV Agent.");
  return {
    humanFeedback: "",
    nextAgent: "dev_agent",
    currentPhase: "development",
  };
}

/**
 * Human Approval Gate - Code Review
 * DEV viết code → dừng để bạn review
 */
async function codeReview(
  state: DevTeamStateType
): Promise<Partial<DevTeamStateType>> {
  logger.info("🔒 Chờ Product Manager review code...");

  // --- US-03 AC3: Ghi event approval_request TRƯỚC interrupt() ---
  await logApprovalRequest({
    workflowRunId: state.workflowRunId,
    workflowPhaseId: state.currentPhaseId,
    approvalType: "code_review",
    agentName: "dev",
    contentPreview: state.sourceCode || "",
  });

  if (config.workflow.autoApprove) {
    logger.info("⏩ [Auto-Approve] Tự động duyệt Code Review do cấu hình AUTO_APPROVE_ENABLED=true");

    await logApprovalDecision({
      workflowRunId: state.workflowRunId,
      workflowPhaseId: state.currentPhaseId,
      approvalType: "code_review",
      decision: "approved",
      humanFeedback: "Auto-approved by system configuration",
    });

    await trackApprovalDecision({
      workflowRunId: state.workflowRunId,
      currentPhaseId: state.currentPhaseId,
      approvalType: "code_review",
      decision: "approved",
      feedback: "Auto-approved by system configuration",
      outputSummary: `Code review auto-approved. Source length: ${state.sourceCode?.length || 0} chars`,
    });

    return {
      humanFeedback: "",
      nextAgent: "tester_agent",
      currentPhase: "testing",
    };
  }

  const approval = interrupt({
    type: "code_review",
    title: "💻 Review Code",
    content: state.sourceCode,
    question:
      "Bạn có approve code này không? (approve/reject + feedback)",
  }) as { action: "approve" | "reject"; feedback?: string };

  // --- US-03 AC3: Ghi event approved/rejected SAU interrupt() ---
  await logApprovalDecision({
    workflowRunId: state.workflowRunId,
    workflowPhaseId: state.currentPhaseId,
    approvalType: "code_review",
    decision: approval.action === "approve" ? "approved" : "rejected",
    humanFeedback: approval.feedback,
  });

  // --- US-02: Track approval decision ---
  await trackApprovalDecision({
    workflowRunId: state.workflowRunId,
    currentPhaseId: state.currentPhaseId,
    approvalType: "code_review",
    decision: approval.action === "approve" ? "approved" : "rejected",
    feedback: approval.feedback,
    outputSummary: approval.action === "approve"
      ? `Code review approved. Source length: ${state.sourceCode?.length || 0} chars`
      : undefined,
  });

  if (approval.action === "reject") {
    logger.info("❌ Code cần chỉnh sửa. Chuyển lại DEV Agent.");
    return {
      humanFeedback: approval.feedback || "Cần chỉnh sửa code.",
      nextAgent: "dev_agent",
    };
  }

  logger.info("✅ Code approved. Chuyển sang TESTER Agent.");
  return {
    humanFeedback: "",
    nextAgent: "tester_agent",
    currentPhase: "testing",
  };
}

/**
 * Human Approval Gate - Release
 * TESTER test xong → dừng để bạn quyết định release
 */
async function releaseApproval(
  state: DevTeamStateType
): Promise<Partial<DevTeamStateType>> {
  logger.info("🔒 Chờ Product Manager duyệt release...");

  // --- US-03 AC3: Ghi event approval_request TRƯỚC interrupt() ---
  await logApprovalRequest({
    workflowRunId: state.workflowRunId,
    workflowPhaseId: state.currentPhaseId,
    approvalType: "release_approval",
    agentName: "tester",
    contentPreview: state.testResults || "",
  });

  if (config.workflow.autoApprove) {
    logger.info("⏩ [Auto-Approve] Tự động duyệt Release do cấu hình AUTO_APPROVE_ENABLED=true");

    await logApprovalDecision({
      workflowRunId: state.workflowRunId,
      workflowPhaseId: state.currentPhaseId,
      approvalType: "release_approval",
      decision: "approved",
      humanFeedback: "Auto-approved by system configuration",
    });

    await trackApprovalDecision({
      workflowRunId: state.workflowRunId,
      currentPhaseId: state.currentPhaseId,
      approvalType: "release_approval",
      decision: "approved",
      feedback: "Auto-approved by system configuration",
      outputSummary: `Release auto-approved. Test results length: ${state.testResults?.length || 0} chars`,
    });

    return {
      nextAgent: "context_sync_agent",
    };
  }

  const approval = interrupt({
    type: "release_approval",
    title: "🚀 Duyệt Release",
    content: state.testResults,
    question:
      "Chọn: (approve) duyệt release / (reject) code có bug, trả Dev sửa / (retest) test chưa đạt, yêu cầu Tester sửa lại",
  }) as { action: "approve" | "reject" | "retest"; feedback?: string };

  // --- US-03 AC3: Ghi event approved/rejected/retested SAU interrupt() ---
  await logApprovalDecision({
    workflowRunId: state.workflowRunId,
    workflowPhaseId: state.currentPhaseId,
    approvalType: "release_approval",
    decision: approval.action === "approve" ? "approved" : "rejected",
    humanFeedback: approval.feedback,
  });

  // --- US-02: Track approval decision ---
  if (approval.action === "approve") {
    await trackApprovalDecision({
      workflowRunId: state.workflowRunId,
      currentPhaseId: state.currentPhaseId,
      approvalType: "release_approval",
      decision: "approved",
      feedback: approval.feedback,
      outputSummary: `Release approved. Test results length: ${state.testResults?.length || 0} chars`,
    });
  } else {
    // Cả "reject" và "retest" đều ghi decision = "rejected"
    await trackApprovalDecision({
      workflowRunId: state.workflowRunId,
      currentPhaseId: state.currentPhaseId,
      approvalType: "release_approval",
      decision: "rejected",
      feedback: approval.feedback,
      rejectedStatus: approval.action === "retest" ? "revised" : "rejected",
    });
  }

  if (approval.action === "retest") {
    logger.info("🔄 Test chưa đạt. Yêu cầu TESTER Agent sửa lại...");
    return {
      humanFeedback: approval.feedback || "Test cần sửa lại.",
      nextAgent: "tester_agent",
      currentPhase: "testing",
    };
  }

  if (approval.action === "reject") {
    logger.info("❌ Code có bug. Chuyển lại DEV Agent kèm báo cáo lỗi.");
    return {
      humanFeedback: approval.feedback || "Cần fix bugs trước khi release.",
      nextAgent: "dev_agent",
      currentPhase: "development",
    };
  }

  logger.info("✅ Release approved! Chuyển sang Context Sync Agent để cập nhật context.");
  return {
    nextAgent: "context_sync_agent",
  };
}

/**
 * Human Approval Gate - Prompt Sync
 * Context Sync Agent phát hiện drift trong prompts → dừng để PM duyệt đề xuất thay đổi.
 * Chỉ kích hoạt khi Context Sync Agent detect drift (Phase 2).
 */
async function promptSyncApproval(
  state: DevTeamStateType
): Promise<Partial<DevTeamStateType>> {
  logger.info("🔒 Chờ Product Manager duyệt đề xuất thay đổi prompt...");

  if (config.workflow.autoApprove) {
    logger.info("⏩ [Auto-Approve] Tự động duyệt Prompt Sync do cấu hình AUTO_APPROVE_ENABLED=true");
    logger.info(`📝 Prompt change proposal auto-approved:\n${state.promptChangeProposal?.slice(0, 500)}`);
    return {
      promptChangeProposal: "",
      nextAgent: "us_router",
    };
  }

  const approval = interrupt({
    type: "prompt_sync_review",
    title: "🔄 Duyệt Prompt Sync",
    content: state.promptChangeProposal,
    question:
      "Context Sync Agent phát hiện prompts bị outdated. Bạn có muốn cập nhật không? (approve/reject)",
  }) as { action: "approve" | "reject"; feedback?: string };

  if (approval.action === "reject") {
    logger.info("❌ PM từ chối cập nhật prompts. Tiếp tục workflow bình thường.");
    return {
      promptChangeProposal: "",
      nextAgent: "us_router",
    };
  }

  logger.info("✅ PM đồng ý cập nhật prompts. Ghi nhận và tiếp tục.");
  // TODO: Trong tương lai, có thể tự động apply changes vào file prompts ở đây.
  // Hiện tại chỉ log proposal để PM tự apply hoặc implement auto-apply sau.
  logger.info(`📝 Prompt change proposal đã được approve:\n${state.promptChangeProposal?.slice(0, 500)}`);
  return {
    promptChangeProposal: "",
    nextAgent: "us_router",
  };
}

// ============================================================================
// Routing Logic
// ============================================================================

/**
 * Routing logic - quyết định agent tiếp theo
 */
function routeAfterApproval(state: DevTeamStateType): string {
  switch (state.nextAgent) {
    case "po_agent":
      return "po_agent";
    case "us_router":
      return "us_router";
    case "ba_agent":
      return "ba_agent";
    case "dev_agent":
      return "dev_agent";
    case "tester_agent":
      return "tester_agent";
    case "context_sync_agent":
      return "context_sync_agent";
    case "prompt_sync_approval":
      return "prompt_sync_approval";
    case "done":
      return "__end__";
    default:
      return "po_agent";
  }
}

// ============================================================================
// Graph Builder
// ============================================================================

/**
 * Build the Dev Team supervisor graph
 *
 * Flow: PO → [Approve] → US Router → BA → [Approve] → DEV → [Review] → TESTER → [Release]
 *       → Context Sync → [Prompt Sync Approval if drift] → US Router (next story or __end__)
 *
 * At each approval gate, the graph pauses with interrupt() for human decision.
 * If rejected, it loops back to the relevant agent with feedback.
 */
export function buildDevTeamGraph() {
  const checkpointer = new MemorySaver();

  // Auto-scan project context 1 lần khi build graph
  const projectContext = generateProjectContext();

  /**
   * Node đầu tiên: inject project context vào state.
   * Chạy 1 lần duy nhất trước khi PO Agent bắt đầu.
   *
   * US-01: Ngoài inject context, còn tạo workflow_runs record trong DB.
   * US-03 AC1: Ghi event workflow_started sau khi tạo workflow run thành công.
   * Graceful degradation: nếu DB lỗi → workflowRunId giữ rỗng, workflow tiếp tục bình thường.
   */
  async function injectProjectContext(
    state: DevTeamStateType
  ): Promise<Partial<DevTeamStateType>> {
    logger.info("📋 Injecting project context vào state...");

    // --- US-01: Khởi tạo workflow run ---
    let workflowRunId = "";
    let threadId = state.threadId;
    try {
      // FIX: Auto-generate threadId nếu caller quên truyền (e.g. test-cli cũ)
      if (!threadId) {
        threadId = `auto-thread-${Date.now()}`;
        logger.warn(
          `⚠️ [injectProjectContext] threadId rỗng trong state. ` +
          `Auto-generated: ${threadId}. Hãy truyền threadId khi invoke graph.`
        );
      }

      if (state.featureRequest) {
        // Guard: chỉ tạo nếu chưa có workflowRunId (idempotency khi graph retry)
        if (!state.workflowRunId) {
          const run = await createWorkflowRun({
            thread_id: threadId,
            feature_request: state.featureRequest,
            created_by: "pm",
          });
          if (run) {
            workflowRunId = run.id;
            logger.info(`📊 Workflow run created: ${workflowRunId}`);

            // --- US-03 AC1: Ghi event workflow_started ---
            await logWorkflowStarted({
              workflowRunId,
              featureRequest: state.featureRequest,
              threadId: threadId,
            });
          }
        } else {
          // Đã có workflowRunId từ lần chạy trước → giữ nguyên
          workflowRunId = state.workflowRunId;
          logger.info(`📊 Workflow run already exists: ${workflowRunId}`);
        }
      } else {
        logger.warn("⚠️ featureRequest rỗng, skip tạo workflow run");
      }
    } catch (error) {
      logger.warn("⚠️ Failed to create workflow run (graceful degradation):", error);
      // workflowRunId giữ "" — workflow vẫn tiếp tục bình thường
    }

    return {
      projectContext,
      workflowRunId,
      threadId, // FIX: Trả threadId (auto-generated nếu cần) về state
    };
  }

  const graph = new StateGraph(DevTeamState)
    // Project context injection
    .addNode("inject_context", injectProjectContext)

    // Agent nodes
    .addNode("po_agent", poAgentNode)
    .addNode("us_router", usRouterNode)
    .addNode("ba_agent", baAgentNode)
    .addNode("dev_agent", devAgentNode)
    .addNode("tester_agent", testerAgentNode)
    .addNode("context_sync_agent", contextSyncAgentNode)

    // Human approval gate nodes
    .addNode("requirements_approval", requirementsApproval)
    .addNode("design_approval", designApproval)
    .addNode("code_review", codeReview)
    .addNode("release_approval", releaseApproval)
    .addNode("prompt_sync_approval", promptSyncApproval)

    // Flow: Start → Inject Context → PO
    .addEdge("__start__", "inject_context")
    .addEdge("inject_context", "po_agent")

    // PO → Requirements Approval
    .addEdge("po_agent", "requirements_approval")

    // Requirements Approval → route (US Router or PO again)
    .addConditionalEdges("requirements_approval", routeAfterApproval, [
      "po_agent",
      "us_router",
    ])

    // US Router → route (BA or Done)
    .addConditionalEdges("us_router", routeAfterApproval, [
      "ba_agent",
      "__end__",
    ])

    // BA → Design Approval
    .addEdge("ba_agent", "design_approval")

    // Design Approval → route (DEV or BA again or PO)
    .addConditionalEdges("design_approval", routeAfterApproval, [
      "ba_agent",
      "dev_agent",
      "po_agent",
    ])

    // DEV → Code Review
    .addEdge("dev_agent", "code_review")

    // Code Review → route (TESTER or DEV again)
    .addConditionalEdges("code_review", routeAfterApproval, [
      "dev_agent",
      "tester_agent",
    ])

    // TESTER → Release Approval
    .addEdge("tester_agent", "release_approval")

    // Release Approval → route (Context Sync Agent, DEV again, or TESTER again)
    .addConditionalEdges("release_approval", routeAfterApproval, [
      "dev_agent",
      "tester_agent",
      "context_sync_agent",
    ])

    // Context Sync Agent → route (Prompt Sync Approval if drift, or US Router)
    .addConditionalEdges("context_sync_agent", routeAfterApproval, [
      "prompt_sync_approval",
      "us_router",
    ])

    // Prompt Sync Approval → always back to US Router
    .addConditionalEdges("prompt_sync_approval", routeAfterApproval, [
      "us_router",
    ]);

  return graph.compile({ checkpointer });
}
