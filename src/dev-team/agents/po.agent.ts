import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { config } from "../../config/env.js";
import { PO_PROMPT } from "../prompts/dev-team.prompts.js";
import type { DevTeamStateType } from "../state.js";

const llm = new ChatOpenAI({
  modelName: config.openai.model,
  apiKey: config.openai.apiKey,
  temperature: 0.7,
});

/**
 * PO Agent - Tạo User Stories và Acceptance Criteria
 * từ feature request của Product Manager.
 *
 * PO Agent chỉ dùng project context (không cần tools),
 * vì tập trung vào business requirements.
 */
export async function poAgentNode(
  state: DevTeamStateType
): Promise<Partial<DevTeamStateType>> {
  const featureRequest = state.featureRequest;
  const humanFeedback = state.humanFeedback;
  const projectContext = state.projectContext;

  // Thêm project context vào system prompt
  const systemPrompt = projectContext
    ? `${PO_PROMPT}\n\n## BỐI CẢNH DỰ ÁN HIỆN TẠI\n${projectContext}`
    : PO_PROMPT;

  let userMessage = `Hãy tạo User Stories cho feature request sau:\n\n${featureRequest}`;

  if (humanFeedback) {
    userMessage = `User Stories trước đó chưa được duyệt. Feedback từ Product Manager:\n\n${humanFeedback}\n\nUser Stories cũ:\n${state.userStories}\n\nHãy chỉnh sửa lại theo feedback.`;
  }

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userMessage),
  ]);

  const userStories =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

  return {
    userStories,
    currentPhase: "requirements",
    humanFeedback: "",
  };
}
