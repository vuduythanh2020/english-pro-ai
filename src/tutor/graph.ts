import { StateGraph, MemorySaver } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { TutorState, type TutorStateType } from "./state.js";
import { TUTOR_SUPERVISOR_PROMPT } from "./prompts/tutor.prompts.js";
import { generalTutorNode } from "./agents/tutor.agent.js";
import { grammarAgentNode } from "./agents/grammar.agent.js";
import { vocabularyAgentNode } from "./agents/vocabulary.agent.js";
import { pronunciationAgentNode } from "./agents/pronunciation.agent.js";
import { businessAgentNode } from "./agents/business.agent.js";
import { assessmentAgentNode } from "./agents/assessment.agent.js";
import { config } from "../config/env.js";
import { logger } from "../utils/logger.js";

const AGENT_NAMES = [
  "general_tutor",
  "grammar_agent",
  "vocabulary_agent",
  "pronunciation_agent",
  "business_agent",
  "assessment_agent",
] as const;

type AgentName = (typeof AGENT_NAMES)[number];

const routerLlm = new ChatOpenAI({
  modelName: config.openai.model,
  apiKey: config.openai.apiKey,
  temperature: 0,
});

/**
 * Supervisor node - phân tích intent và route đến agent phù hợp
 */
async function supervisorNode(
  state: TutorStateType
): Promise<Partial<TutorStateType>> {
  const profile = state.userProfile;
  const prompt = TUTOR_SUPERVISOR_PROMPT
    .replace("{name}", profile.name || "bạn")
    .replace("{profession}", profile.profession || "chưa cung cấp")
    .replace("{level}", profile.level)
    .replace("{goals}", profile.goals.join(", ") || "chưa cung cấp");

  const lastMessage = state.messages[state.messages.length - 1];
  const userInput =
    typeof lastMessage.content === "string"
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);

  const response = await routerLlm.invoke([
    new SystemMessage(prompt),
    new HumanMessage(
      `Learner's message: "${userInput}"\n\nWhich agent should handle this? Respond with ONLY the agent name.`
    ),
  ]);

  const agentName = (
    typeof response.content === "string"
      ? response.content
      : "general_tutor"
  )
    .trim()
    .toLowerCase()
    .replace(/[^a-z_]/g, "");

  const selectedAgent: AgentName = AGENT_NAMES.includes(agentName as AgentName)
    ? (agentName as AgentName)
    : "general_tutor";

  logger.info(`🧠 Supervisor routed to: ${selectedAgent}`);

  return {
    activeAgent: selectedAgent,
  };
}

/**
 * Route function - dựa vào activeAgent để chọn next node
 */
function routeToAgent(state: TutorStateType): string {
  return state.activeAgent || "general_tutor";
}

/**
 * Build the Tutor Supervisor graph
 *
 * Flow: User Message → Supervisor (route) → Selected Agent → Response
 */
export function buildTutorGraph() {
  const checkpointer = new MemorySaver();

  const graph = new StateGraph(TutorState)
    // Supervisor node
    .addNode("supervisor", supervisorNode)

    // Agent nodes
    .addNode("general_tutor", generalTutorNode)
    .addNode("grammar_agent", grammarAgentNode)
    .addNode("vocabulary_agent", vocabularyAgentNode)
    .addNode("pronunciation_agent", pronunciationAgentNode)
    .addNode("business_agent", businessAgentNode)
    .addNode("assessment_agent", assessmentAgentNode)

    // Start → Supervisor
    .addEdge("__start__", "supervisor")

    // Supervisor → route to agent
    .addConditionalEdges("supervisor", routeToAgent, [
      "general_tutor",
      "grammar_agent",
      "vocabulary_agent",
      "pronunciation_agent",
      "business_agent",
      "assessment_agent",
    ])

    // All agents → End (response sent back to user)
    .addEdge("general_tutor", "__end__")
    .addEdge("grammar_agent", "__end__")
    .addEdge("vocabulary_agent", "__end__")
    .addEdge("pronunciation_agent", "__end__")
    .addEdge("business_agent", "__end__")
    .addEdge("assessment_agent", "__end__");

  return graph.compile({ checkpointer });
}
