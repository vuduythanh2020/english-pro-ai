import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { config } from "../../config/env.js";
import { PRONUNCIATION_AGENT_PROMPT } from "../prompts/tutor.prompts.js";
import type { TutorStateType } from "../state.js";

const llm = new ChatOpenAI({
  modelName: config.openai.model,
  apiKey: config.openai.apiKey,
  temperature: 0.5,
});

/**
 * Pronunciation Agent - Chuyên gia phát âm
 */
export async function pronunciationAgentNode(
  state: TutorStateType
): Promise<Partial<TutorStateType>> {
  const profile = state.userProfile;
  const prompt = PRONUNCIATION_AGENT_PROMPT
    .replace("{name}", profile.name || "bạn")
    .replace("{profession}", profile.profession || "chưa cung cấp")
    .replace("{level}", profile.level);

  const response = await llm.invoke([
    new SystemMessage(prompt),
    ...state.messages,
  ]);

  return {
    messages: [response],
    activeAgent: "pronunciation_agent",
  };
}
