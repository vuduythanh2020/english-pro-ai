import { ChatOpenAI } from "@langchain/openai";
import {
  SystemMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { config } from "../../config/env.js";
import { DEV_PROMPT } from "../prompts/dev-team.prompts.js";
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
 * DEV Agent - Viết source code và unit tests.
 *
 * Có khả năng đọc codebase qua tools để hiểu code hiện tại
 * trước khi viết code mới, đảm bảo follow đúng patterns.
 */
export async function devAgentNode(
  state: DevTeamStateType
): Promise<Partial<DevTeamStateType>> {
  const humanFeedback = state.humanFeedback;
  const projectContext = state.projectContext;

  // System prompt + project context
  const systemPrompt = projectContext
    ? `${DEV_PROMPT}\n\n## BỐI CẢNH DỰ ÁN HIỆN TẠI\n${projectContext}`
    : DEV_PROMPT;

  let userMessage = `Dựa trên tài liệu thiết kế đã được duyệt, hãy viết source code:\n\n## User Stories\n${state.userStories}\n\n## Design Document\n${state.designDocument}`;

  if (humanFeedback) {
    userMessage = `Code trước đó cần chỉnh sửa. Feedback từ Product Manager:\n\n${humanFeedback}\n\nCode cũ:\n${state.sourceCode}\n\nHãy chỉnh sửa lại theo feedback.`;
  }

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
      const sourceCode =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);

      return {
        sourceCode,
        currentPhase: "development",
        humanFeedback: "",
      };
    }

    // Thực thi từng tool call
    logger.info(`🔧 DEV Agent gọi ${toolCalls.length} tool(s) (vòng ${round + 1})`);
    for (const tc of toolCalls) {
      const toolMsg = await executeToolCall(tc);
      messages.push(toolMsg);
    }
  }

  // Nếu vượt quá số vòng, gọi LLM lần cuối không có tools
  logger.warn("⚠️ DEV Agent đã dùng hết số vòng tool. Gọi LLM lần cuối.");
  const finalResponse = await llm.invoke(messages);
  const sourceCode =
    typeof finalResponse.content === "string"
      ? finalResponse.content
      : JSON.stringify(finalResponse.content);

  return {
    sourceCode,
    currentPhase: "development",
    humanFeedback: "",
  };
}
