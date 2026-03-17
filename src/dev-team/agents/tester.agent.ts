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

const llm = new ChatOpenAI({
  modelName: config.openai.model,
  apiKey: config.openai.apiKey,
  temperature: 0.3,
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
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await llmWithTools.invoke(messages);
    messages.push(response);

    // Nếu không gọi tool → đã xong, trả kết quả
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

    // Thực thi từng tool call
    logger.info(`🔧 TESTER Agent gọi ${toolCalls.length} tool(s) (vòng ${round + 1})`);
    for (const tc of toolCalls) {
      const toolMsg = await executeToolCall(tc);
      messages.push(toolMsg);
    }
  }

  // Nếu vượt quá số vòng, gọi LLM lần cuối không có tools
  logger.warn("⚠️ TESTER Agent đã dùng hết số vòng tool. Gọi LLM lần cuối.");
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
