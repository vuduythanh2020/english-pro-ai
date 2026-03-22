import {
  SystemMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { ChatAnthropic } from "@langchain/anthropic";
import { config } from "../../config/env.js";
import { BA_PROMPT } from "../prompts/dev-team.prompts.js";
import type { DevTeamStateType } from "../state.js";
import {
  codebaseTools,
  readProjectFileTool,
  listDirectoryTool,
} from "../tools/codebase-tools.js";
import { logger } from "../../utils/logger.js";
import { startPhaseTracking, completePhaseTracking } from "../utils/tracking-helper.js";

// Khởi tạo model Claude cho BA
const llm = new ChatAnthropic({
  anthropicApiKey: config.anthropic.apiKey,
  modelName: 'claude-opus-4-6',
  temperature: 0.2,
  maxTokens: 16384, // BA cần output dài cho design document chi tiết
  clientOptions: config.anthropic.baseUrl
    ? {
      baseURL: config.anthropic.baseUrl,
      defaultHeaders: {
        "Authorization": `Bearer ${config.anthropic.apiKey}`
      }
    }
    : undefined,
});

/**
 * Thực thi tool call và trả về ToolMessage.
 */
async function executeToolCall(
  toolCall: { name: string; args: Record<string, unknown>; id?: string }
): Promise<ToolMessage> {
  let result: string;

  if (toolCall.name === "read_project_file") {
    result = await readProjectFileTool.invoke(toolCall.args as { filePath: string });
  } else if (toolCall.name === "list_directory") {
    result = await listDirectoryTool.invoke(toolCall.args as { dirPath: string });
  } else {
    result = `❌ Tool không tồn tại: ${toolCall.name}`;
  }

  return new ToolMessage({
    content: result,
    tool_call_id: toolCall.id || "",
  });
}

/**
 * BA Agent - Phân tích nghiệp vụ và tạo tài liệu thiết kế.
 *
 * Có khả năng đọc codebase qua tools để hiểu dự án hiện tại
 * trước khi tạo design document.
 *
 * US-01: Tích hợp Phase Tracking — ghi nhận phase bắt đầu/kết thúc vào DB.
 */
export async function baAgentNode(
  state: DevTeamStateType
): Promise<Partial<DevTeamStateType>> {
  const humanFeedback = state.humanFeedback;
  const projectContext = state.projectContext;

  // --- Phase Tracking: START (AC1, AC2, AC3, AC5) ---
  const { phaseId } = await startPhaseTracking({
    workflowRunId: state.workflowRunId,
    phaseName: "design",
    agentName: "ba",
    inputSummary: humanFeedback
      ? `[REVISION] Feedback: ${humanFeedback}`
      : state.userStories,
  });

  // System prompt + project context
  const systemPrompt = projectContext
    ? `${BA_PROMPT}\n\n## BỐI CẢNH DỰ ÁN HIỆN TẠI\n${projectContext}`
    : BA_PROMPT;

  let userMessage = `Dựa trên User Stories đã được duyệt sau đây, hãy tạo tài liệu phân tích và thiết kế chi tiết:\n\n${state.userStories}`;

  if (humanFeedback) {
    userMessage = `Tài liệu thiết kế trước đó chưa được duyệt. Feedback từ Product Manager:\n\n${humanFeedback}\n\nThiết kế cũ:\n${state.designDocument}\n\nHãy chỉnh sửa lại theo feedback.`;
  }

  // Bind tools vào LLM
  const llmWithTools = llm.bindTools(codebaseTools);

  const messages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    new HumanMessage(userMessage),
  ];

  // Agent loop: LLM suy nghĩ → gọi tool → nhận kết quả → tiếp tục
  const MAX_TOOL_ROUNDS = 5;
  const MAX_TOOLS_PER_ROUND = 5;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await llmWithTools.invoke(messages);
      messages.push(response);

      const toolCalls = response.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        const designDocument =
          typeof response.content === "string"
            ? response.content
            : JSON.stringify(response.content);

        // Validate: nếu response quá ngắn (< 300 ký tự), bắt ép gọi tool hoặc viết dài ra
        if (designDocument.length < 300) {
          logger.warn(`⚠️ BA Agent trả về response quá ngắn (${designDocument.length} chars). Yêu cầu viết lại.`);
          messages.push(new HumanMessage(
            `Response của bạn quá ngắn (${designDocument.length} ký tự). TÀI LIỆU THIẾT KẾ PHẢI DÀI HƠN 300 KÝ TỰ! Nếu bạn cần đọc code, hãy lập tức DÙNG TOOL (Function Call API) chứ TUYỆT ĐỐI KHÔNG nhắn văn xuôi xin phép kiểu 'Tôi sẽ đọc code'. Còn nếu đã đủ thông tin, hãy trình bày Thiết kế chi tiết.`
          ));
          continue;
        }

        // --- Phase Tracking: COMPLETE ---
        await completePhaseTracking(state.workflowRunId, phaseId, "ba", designDocument);

        return {
          designDocument,
          currentPhase: "design",
          humanFeedback: "",
          currentPhaseId: phaseId,
        };
      }

      if (toolCalls.length > MAX_TOOLS_PER_ROUND) {
        logger.warn(`⚠️ BA Agent muốn gọi ${toolCalls.length} tools, chỉ xử lý ${MAX_TOOLS_PER_ROUND}`);
      }

      logger.info(`🔧 BA Agent gọi ${Math.min(toolCalls.length, MAX_TOOLS_PER_ROUND)} tool(s) (vòng ${round + 1})`);
      let callCount = 0;
      for (const tc of toolCalls) {
        callCount++;
        if (callCount <= MAX_TOOLS_PER_ROUND) {
          const toolMsg = await executeToolCall(tc);
          messages.push(toolMsg);
        } else {
          messages.push(new ToolMessage({
            content: `❌ Lỗi: Bạn đã gọi quá ${MAX_TOOLS_PER_ROUND} tools trong một vòng. Tool này bị bỏ qua để tránh nghẽn hệ thống. Vui lòng gọi lại ở vòng sau nếu cần thiết.`,
            tool_call_id: tc.id || `err_${Date.now()}`
          }));
        }
      }
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error(`❌ BA Agent lỗi khi gọi LLM/tools: ${errMsg}`);
    logger.info("🔄 Thử lại không dùng tools...");
  }

  // Fallback: gọi LLM lần cuối không có tools
  logger.warn("⚠️ BA Agent fallback: gọi LLM khi không đủ số vòng dùng tools");
  messages.push(new HumanMessage(
    "Bây giờ, hãy tạo Tài liệu thiết kế chi tiết (Design Document) HOÀN CHỈNH và ĐẦY ĐỦ theo yêu cầu, dựa trên tất cả thông tin bạn đã thu thập được. KHÔNG được trả lời ngắn gọn. Phải bao gồm: 1) Phân tích nghiệp vụ, 2) Thiết kế kỹ thuật, 3) UI/UX Guidelines, 4) Rủi ro & Giải pháp."
  ));

  const finalResponse = await llm.invoke(messages);
  const designDocument =
    typeof finalResponse.content === "string"
      ? finalResponse.content
      : JSON.stringify(finalResponse.content);

  // --- Phase Tracking: COMPLETE (fallback path) ---
  await completePhaseTracking(state.workflowRunId, phaseId, "ba", designDocument);

  return {
    designDocument,
    currentPhase: "design",
    humanFeedback: "",
    currentPhaseId: phaseId,
  };
}
