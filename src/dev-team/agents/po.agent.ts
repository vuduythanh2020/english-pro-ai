import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { config } from "../../config/env.js";
import { PO_PROMPT } from "../prompts/dev-team.prompts.js";
import type { DevTeamStateType } from "../state.js";
import { logger } from "../../utils/logger.js";

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
