import { ChatAnthropic } from "@langchain/anthropic";
import {
  SystemMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { config } from "../../config/env.js";
import { PO_PROMPT } from "../prompts/dev-team.prompts.js";
import type { DevTeamStateType } from "../state.js";
import { logger } from "../../utils/logger.js";
import { codebaseTools } from "../tools/codebase-tools.js";
import { executeToolCall } from "../utils/execute-tool.js";
import { startPhaseTracking, completePhaseTracking } from "../utils/tracking-helper.js";

// Khởi tạo model Claude cho PO
const llm = new ChatAnthropic({
  anthropicApiKey: config.anthropic.apiKey,
  modelName: 'claude-opus-4-6',
  temperature: 0.7,
  clientOptions: config.anthropic.baseUrl
    ? {
      baseURL: config.anthropic.baseUrl,
      defaultHeaders: {
        "Authorization": `Bearer ${config.anthropic.apiKey}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      // Debug: log request và dump body vào file để phân tích
      fetch: async (url: any, init?: any) => {
        const bodyStr = typeof init?.body === "string" ? init.body : "";
        const bodySize = bodyStr.length;
        logger.info(`🌐 [PO] API Request: ${url} | Body size: ${bodySize} chars`);
        if (bodySize > 0) {
          try {
            const parsed = JSON.parse(bodyStr);
            logger.info(`🌐 [PO] Request details: model=${parsed.model}, max_tokens=${parsed.max_tokens}, messages=${parsed.messages?.length || 0}, system=${parsed.system ? "yes" : "no"}`);
            // Dump full request body vào file (1 lần duy nhất)
            const fs = await import("fs");
            const dumpPath = "debug-po-request.json";
            if (!fs.existsSync(dumpPath)) {
              fs.writeFileSync(dumpPath, JSON.stringify(parsed, null, 2), "utf-8");
              logger.info(`📝 [PO] Request body dumped to ${dumpPath}`);
            }
          } catch { /* ignore parse errors */ }
        }
        const res = await globalThis.fetch(url, init);
        if (!res.ok) {
          const errorBody = await res.clone().text();
          logger.error(`🌐 [PO] API Response ERROR: status=${res.status} body=${errorBody.slice(0, 500)}`);
        }
        return res;
      },
    }
    : undefined,
});

/**
 * PO Agent - Tạo User Stories và Acceptance Criteria
 * từ feature request của Product Manager.
 *
 * Cập nhật: Đã được cấp quyền sử dụng codebaseTools (như read_project_file, list_directory) 
 * để PO có thể "khảo sát" code cũ trước khi chế ra bảng mới, tránh hallucination.
 *
 * US-01: Tích hợp Phase Tracking — ghi nhận phase bắt đầu/kết thúc vào DB.
 */
export async function poAgentNode(
  state: DevTeamStateType
): Promise<Partial<DevTeamStateType>> {
  const featureRequest = state.featureRequest;
  const humanFeedback = state.humanFeedback;
  const projectContext = state.projectContext;

  // --- Phase Tracking: START (AC1, AC2, AC3, AC5) ---
  const { phaseId } = await startPhaseTracking({
    workflowRunId: state.workflowRunId,
    phaseName: "requirements",
    agentName: "po",
    inputSummary: humanFeedback
      ? `[REVISION] Feedback: ${humanFeedback}`
      : featureRequest,
  });

  // Thêm project context vào system prompt
  const systemPrompt = projectContext
    ? `${PO_PROMPT}\n\n## BỐI CẢNH DỰ ÁN HIỆN TẠI\n${projectContext}`
    : PO_PROMPT;

  let userMessage = `Hãy tạo User Stories cho feature request sau:\n\n${featureRequest}\n\n[LƯU Ý QUAN TRỌNG]: Bạn ĐƯỢC CẤP tool để khám phá source code. TRƯỚC KHI thiết kế cơ sở dữ liệu hoặc cấu trúc mới, hãy DÙNG TOOL (list_directory, read_project_file) để kiểm tra xem hệ thống đã có sẵn các thứ đó chưa (ví dụ: các file schema.sql, migrations). Hãy tận dụng đồ cũ, KHÔNG bịa ra bảng mới nếu đã có tính năng tương tự.`;

  if (humanFeedback) {
    userMessage = `User Stories trước đó chưa được duyệt. Feedback từ Product Manager:\n\n${humanFeedback}\n\nUser Stories cũ:\n${state.userStories}\n\nHãy chỉnh sửa lại theo feedback. Nhớ dùng Tools để xem file code nếu cần thiết.`;
  }

  const llmWithTools = llm.bindTools(codebaseTools);
  const messages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    new HumanMessage(userMessage),
  ];

  const MAX_TOOL_ROUNDS = 5;
  const MAX_TOOLS_PER_ROUND = 3;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await llmWithTools.invoke(messages);
      messages.push(response);

      const toolCalls = response.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        const userStories =
          typeof response.content === "string"
            ? response.content
            : JSON.stringify(response.content);

        // --- Phase Tracking: COMPLETE ---
        await completePhaseTracking(state.workflowRunId, phaseId, "po", userStories);

        return {
          userStories,
          currentPhase: "requirements",
          humanFeedback: "",
          currentPhaseId: phaseId,
        };
      }

      if (toolCalls.length > MAX_TOOLS_PER_ROUND) {
        logger.warn(`⚠️ PO Agent muốn gọi ${toolCalls.length} tools, chỉ xử lý ${MAX_TOOLS_PER_ROUND}`);
      }

      logger.info(`🔧 PO Agent gọi ${Math.min(toolCalls.length, MAX_TOOLS_PER_ROUND)} tool(s) (vòng ${round + 1})`);
      let callCount = 0;
      for (const tc of toolCalls) {
        callCount++;
        if (callCount <= MAX_TOOLS_PER_ROUND) {
          // Ép kiểu do ToolCallInput interface require params
          const toolMsg = await executeToolCall(tc as any); 
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
    logger.error(`❌ PO Agent lỗi khi gọi LLM/tools: ${errMsg}`);
    logger.info("🔄 Thử lại không dùng tools...");
  }

  // Fallback: Nếu không dùng tool được hoặc vòng lặp hết
  logger.warn("⚠️ PO Agent fallback: gọi LLM xuất kết quả cuối cùng.");
  messages.push(new HumanMessage(
    "Bây giờ, hãy tạo User Stories HOÀN CHỈNH dựa trên toàn bộ thông tin bạn khảo sát được. Không cần gọi tool nữa."
  ));

  const finalResponse = await llm.invoke(messages);
  const userStories =
    typeof finalResponse.content === "string"
      ? finalResponse.content
      : JSON.stringify(finalResponse.content);

  // --- Phase Tracking: COMPLETE (fallback path) ---
  await completePhaseTracking(state.workflowRunId, phaseId, "po", userStories);

  return {
    userStories,
    currentPhase: "requirements",
    humanFeedback: "",
    currentPhaseId: phaseId,
  };
}
