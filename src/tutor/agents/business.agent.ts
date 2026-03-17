import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { config } from "../../config/env.js";
import { BUSINESS_AGENT_PROMPT } from "../prompts/tutor.prompts.js";
import type { TutorStateType } from "../state.js";

const llm = new ChatOpenAI({
  modelName: config.openai.model,
  apiKey: config.openai.apiKey,
  temperature: 0.6,
});

/**
 * Business English Agent - Chuyên gia tiếng Anh thương mại
 */
export async function businessAgentNode(
  state: TutorStateType
): Promise<Partial<TutorStateType>> {
  const profile = state.userProfile;
  const prompt = BUSINESS_AGENT_PROMPT
    .replace("{name}", profile.name || "bạn")
    .replace("{profession}", profile.profession || "chưa cung cấp")
    .replace("{level}", profile.level);

  const response = await llm.invoke([
    new SystemMessage(prompt),
    ...state.messages,
  ]);

  return {
    messages: [response],
    activeAgent: "business_agent",
  };
}
