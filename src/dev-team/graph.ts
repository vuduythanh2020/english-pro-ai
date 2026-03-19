import { StateGraph, interrupt, Command, MemorySaver } from "@langchain/langgraph";
import { DevTeamState, type DevTeamStateType } from "./state.js";
import { poAgentNode } from "./agents/po.agent.js";
import { baAgentNode } from "./agents/ba.agent.js";
import { devAgentNode } from "./agents/dev.agent.js";
import { testerAgentNode } from "./agents/tester.agent.js";
import { generateProjectContext } from "./project-context.js";
import { logger } from "../utils/logger.js";

/**
 * Human Approval Gate - Requirements
 * PO tạo User Stories → dừng để bạn duyệt
 */
async function requirementsApproval(
  state: DevTeamStateType
): Promise<Partial<DevTeamStateType>> {
  logger.info("🔒 Chờ Product Manager duyệt User Stories...");

  const approval = interrupt({
    type: "requirements_review",
    title: "📋 Duyệt User Stories",
    content: state.userStories,
    question:
      "Bạn có đồng ý với User Stories này không? (approve/reject + feedback)",
  }) as { action: "approve" | "reject"; feedback?: string };

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
    return {
      allUserStories: stories,
      nextAgent: "done",
      currentPhase: "done"
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

  const approval = interrupt({
    type: "design_review",
    title: "📊 Duyệt Design Document",
    content: state.designDocument,
    question:
      "Chọn: (approve) duyệt / (reject) sửa design / (revise) quay lại sửa requirements",
  }) as { action: "approve" | "reject" | "revise"; feedback?: string };

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

  const approval = interrupt({
    type: "code_review",
    title: "💻 Review Code",
    content: state.sourceCode,
    question:
      "Bạn có approve code này không? (approve/reject + feedback)",
  }) as { action: "approve" | "reject"; feedback?: string };

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

  const approval = interrupt({
    type: "release_approval",
    title: "🚀 Duyệt Release",
    content: state.testResults,
    question:
      "Test đã xong. Bạn có đồng ý release không? (approve/reject + feedback)",
  }) as { action: "approve" | "reject"; feedback?: string };

  if (approval.action === "reject") {
    logger.info("❌ Release bị từ chối. Chuyển lại DEV Agent.");
    return {
      humanFeedback: approval.feedback || "Cần fix bugs trước khi release.",
      nextAgent: "dev_agent",
      currentPhase: "development",
    };
  }

  logger.info("✅ Release approved! Trở về luồng US Router để xử lý Story tiếp theo.");
  return {
    nextAgent: "us_router",
  };
}

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
    case "done":
      return "__end__";
    default:
      return "po_agent";
  }
}

/**
 * Build the Dev Team supervisor graph
 *
 * Flow: PO → [Approve] → BA → [Approve] → DEV → [Review] → TESTER → [Release] → Done
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
   */
  async function injectProjectContext(
    state: DevTeamStateType
  ): Promise<Partial<DevTeamStateType>> {
    logger.info("📋 Injecting project context vào state...");
    return { projectContext };
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

    // Human approval gate nodes
    .addNode("requirements_approval", requirementsApproval)
    .addNode("design_approval", designApproval)
    .addNode("code_review", codeReview)
    .addNode("release_approval", releaseApproval)

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

    // Release Approval → route (US Router or DEV again)
    .addConditionalEdges("release_approval", routeAfterApproval, [
      "dev_agent",
      "us_router",
    ]);

  return graph.compile({ checkpointer });
}
