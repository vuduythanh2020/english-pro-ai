import { ChatOpenAI } from "@langchain/openai";
import {
  SystemMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { config } from "../../config/env.js";
import { BA_PROMPT } from "../prompts/dev-team.prompts.js";
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
  temperature: 0.5,
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
 */
export async function baAgentNode(
  state: DevTeamStateType
): Promise<Partial<DevTeamStateType>> {
  const humanFeedback = state.humanFeedback;
  const projectContext = state.projectContext;

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
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await llmWithTools.invoke(messages);
    messages.push(response);

    // Nếu không gọi tool → đã xong, trả kết quả
    const toolCalls = response.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      const designDocument =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);

      return {
        designDocument,
        currentPhase: "design",
        humanFeedback: "",
      };
    }

    // Thực thi từng tool call
    logger.info(`🔧 BA Agent gọi ${toolCalls.length} tool(s) (vòng ${round + 1})`);
    for (const tc of toolCalls) {
      const toolMsg = await executeToolCall(tc);
      messages.push(toolMsg);
    }
  }

  // Nếu vượt quá số vòng, gọi LLM lần cuối không có tools
  logger.warn("⚠️ BA Agent đã dùng hết số vòng tool. Gọi LLM lần cuối.");
  const finalResponse = await llm.invoke(messages);
  const designDocument =
    typeof finalResponse.content === "string"
      ? finalResponse.content
      : JSON.stringify(finalResponse.content);

  return {
    designDocument,
    currentPhase: "design",
    humanFeedback: "",
  };
}
