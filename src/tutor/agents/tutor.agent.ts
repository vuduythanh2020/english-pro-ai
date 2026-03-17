import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { config } from "../../config/env.js";
import { GENERAL_TUTOR_PROMPT } from "../prompts/tutor.prompts.js";
import type { TutorStateType } from "../state.js";

const llm = new ChatOpenAI({
  modelName: config.openai.model,
  apiKey: config.openai.apiKey,
  temperature: 0.8,
});

/**
 * General Tutor - Gia sư chính, hội thoại tự do
 */
export async function generalTutorNode(
  state: TutorStateType
): Promise<Partial<TutorStateType>> {
  const profile = state.userProfile;
  const prompt = GENERAL_TUTOR_PROMPT
    .replace("{name}", profile.name || "bạn")
    .replace("{profession}", profile.profession || "chưa cung cấp")
    .replace("{level}", profile.level)
    .replace("{goals}", profile.goals.join(", ") || "chưa cung cấp");

  const response = await llm.invoke([
    new SystemMessage(prompt),
    ...state.messages,
  ]);

  return {
    messages: [response],
    activeAgent: "general_tutor",
  };
}
