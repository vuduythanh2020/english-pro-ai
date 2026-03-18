import { ChatOpenAI } from "@langchain/openai";
import {
  SystemMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { config } from "../../config/env.js";
import { TESTER_PROMPT } from "../prompts/dev-team.prompts.js";
import type { DevTeamStateType } from "../state.js";
import {
  codebaseTools,
  readProjectFileTool,
  listDirectoryTool,
} from "../tools/codebase-tools.js";
import { logger } from "../../utils/logger.js";

// Khởi tạo model OpenAI cho TESTER
const llm = new ChatOpenAI({
  apiKey: config.openai.apiKey,
  modelName: config.openai.model,
  temperature: 0,
  configuration: config.openai.baseUrl
    ? { baseURL: config.openai.baseUrl }
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
 * TESTER Agent - Tạo test cases, review code và báo cáo kết quả.
 *
 * Có khả năng đọc codebase qua tools để hiểu code thực tế
 * trước khi tạo test plan, đảm bảo test cases sát với implementation.
 */
export async function testerAgentNode(
  state: DevTeamStateType
): Promise<Partial<DevTeamStateType>> {
  const projectContext = state.projectContext;

  // System prompt + project context
  const systemPrompt = projectContext
    ? `${TESTER_PROMPT}\n\n## BỐI CẢNH DỰ ÁN HIỆN TẠI\n${projectContext}`
    : TESTER_PROMPT;

  const userMessage = `Hãy review code và tạo test plan dựa trên:

## User Stories & Acceptance Criteria
${state.userStories}

## Design Document
${state.designDocument}

## Source Code
${state.sourceCode}

Hãy đánh giá code quality, tạo test cases, và kết luận PASS/FAIL.`;

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
        const testResults =
          typeof response.content === "string"
            ? response.content
            : JSON.stringify(response.content);

        return {
          testResults,
          currentPhase: "testing",
          humanFeedback: "",
        };
      }

      const limitedCalls = toolCalls.slice(0, MAX_TOOLS_PER_ROUND);
      if (toolCalls.length > MAX_TOOLS_PER_ROUND) {
        logger.warn(`⚠️ TESTER Agent muốn gọi ${toolCalls.length} tools, chỉ xử lý ${MAX_TOOLS_PER_ROUND}`);
      }

      logger.info(`🔧 TESTER Agent gọi ${limitedCalls.length} tool(s) (vòng ${round + 1})`);
      for (const tc of limitedCalls) {
        const toolMsg = await executeToolCall(tc);
        messages.push(toolMsg);
      }
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error(`❌ TESTER Agent lỗi khi gọi LLM/tools: ${errMsg}`);
   // Fallback: gọi LLM lần cuối không có tools
  logger.warn("⚠️ TESTER Agent fallback: gọi LLM không có tools.");
  // Thêm chỉ dẫn cuối cùng
  messages.push(new HumanMessage("Bây giờ, hãy thực hiện Review Code và tạo Test Plan hoàn chỉnh theo đúng format yêu cầu, dựa trên tất cả thông tin bạn đã thu thập được."));
  }

  logger.warn("⚠️ TESTER Agent fallback: gọi LLM không có tools.");
  const finalResponse = await llm.invoke(messages);
  const testResults =
    typeof finalResponse.content === "string"
      ? finalResponse.content
      : JSON.stringify(finalResponse.content);

  return {
    testResults,
    currentPhase: "testing",
    humanFeedback: "",
  };
}
