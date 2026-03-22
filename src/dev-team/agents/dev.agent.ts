import { ChatAnthropic } from "@langchain/anthropic";
import {
  SystemMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { config } from "../../config/env.js";
import { DEV_PROMPT } from "../prompts/dev-team.prompts.js";
import type { DevTeamStateType } from "../state.js";
import { allDevTools } from "../tools/codebase-tools.js";
import { executeToolCall, buildToolErrorMessage } from "../utils/execute-tool.js";
import { logger } from "../../utils/logger.js";
import { startPhaseTracking, completePhaseTracking } from "../utils/tracking-helper.js";

// Khởi tạo model Claude cho DEV
const llm = new ChatAnthropic({
  anthropicApiKey: config.anthropic.apiKey,
  modelName: 'claude-opus-4-6',
  temperature: 0.2,
  maxTokens: 16384, // Explicit max tokens cho Dev Agent (cần output dài cho code)
  clientOptions: config.anthropic.baseUrl
    ? {
      baseURL: config.anthropic.baseUrl,
      defaultHeaders: {
        "Authorization": `Bearer ${config.anthropic.apiKey}`
      },
      // Debug: log request và dump body vào file để phân tích
      fetch: async (url: any, init?: any) => {
        const bodyStr = typeof init?.body === "string" ? init.body : "";
        const bodySize = bodyStr.length;
        logger.info(`🌐 [DEV] API Request: ${url} | Body size: ${bodySize} chars`);
        if (bodySize > 0) {
          try {
            const parsed = JSON.parse(bodyStr);
            logger.info(`🌐 [DEV] Request details: model=${parsed.model}, max_tokens=${parsed.max_tokens}, tools=${parsed.tools?.length || 0}, messages=${parsed.messages?.length || 0}, system=${parsed.system ? "yes" : "no"}`);
            // Dump full request body vào file (1 lần duy nhất)
            const fs = await import("fs");
            const dumpPath = "debug-dev-request.json";
            if (!fs.existsSync(dumpPath)) {
              fs.writeFileSync(dumpPath, JSON.stringify(parsed, null, 2), "utf-8");
              logger.info(`📝 [DEV] Request body dumped to ${dumpPath}`);
            }
          } catch { /* ignore parse errors */ }
        }
        const res = await globalThis.fetch(url, init);
        if (!res.ok) {
          const errorBody = await res.clone().text();
          logger.error(`🌐 [DEV] API Response ERROR: status=${res.status} body=${errorBody.slice(0, 500)}`);
        }
        return res;
      },
    }
    : undefined,
});

/**
 * Tất cả tools mà Dev Agent có thể sử dụng.
 * allDevTools đã bao gồm: readProjectFile, listDirectory, readFileFull, writeFile, executeCommand, getProjectStructure, submitFeature.
 */
const devToolkit = allDevTools;

/**
 * Ước tính token count từ text.
 * Rough estimation: ~4 chars/token cho tiếng Anh, ~2.5 chars/token cho tiếng Việt mixed.
 * Dùng ~3 chars/token trung bình cho mixed content.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/**
 * Truncate text nếu vượt quá maxChars, giữ phần đầu hoặc phần cuối.
 */
function truncateText(text: string, maxChars: number, keepEnd = false): string {
  if (text.length <= maxChars) return text;
  if (keepEnd) {
    return `...(truncated ${text.length - maxChars} chars)...\n` + text.slice(-maxChars);
  }
  return text.slice(0, maxChars) + `\n...(truncated ${text.length - maxChars} chars)...`;
}

/**
 * Log diagnostic info cho prompt trước khi gửi LLM.
 */
function logPromptDiagnostics(agentName: string, systemPrompt: string, userMessage: string, toolCount: number) {
  const systemChars = systemPrompt.length;
  const userChars = userMessage.length;
  const totalChars = systemChars + userChars;
  const estimatedTokensTotal = estimateTokens(systemPrompt) + estimateTokens(userMessage);

  logger.info(`📊 [${agentName}] Prompt Diagnostics:`);
  logger.info(`   System prompt: ${systemChars} chars (~${estimateTokens(systemPrompt)} tokens)`);
  logger.info(`   User message:  ${userChars} chars (~${estimateTokens(userMessage)} tokens)`);
  logger.info(`   Tools bound:   ${toolCount}`);
  logger.info(`   Total:         ${totalChars} chars (~${estimatedTokensTotal} tokens)`);

  if (estimatedTokensTotal > 50000) {
    logger.warn(`⚠️ [${agentName}] Prompt rất lớn (>50K tokens estimated). Có thể gây timeout hoặc 502.`);
  }
}

/**
 * Gọi LLM với retry logic cho 502/503/429.
 * Retry 3 lần với exponential backoff: 3s → 6s → 12s.
 */
async function invokeWithRetry(
  llmWithTools: ReturnType<typeof llm.bindTools>,
  messages: BaseMessage[],
  agentName: string,
  round: number,
): Promise<any> {
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await llmWithTools.invoke(messages);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const isRetryable = /502|503|429|overloaded|temporarily unavailable|rate.?limit/i.test(errMsg);

      logger.warn(`⚠️ [${agentName}] API Error (vòng ${round + 1}, thử ${attempt}/${MAX_RETRIES}): ${errMsg}`);

      if (!isRetryable || attempt === MAX_RETRIES) {
        logger.error(`❌ [${agentName}] Hết retry hoặc lỗi không retryable. Throwing...`);
        throw e;
      }

      const delay = 3000 * Math.pow(2, attempt - 1); // 3s, 6s, 12s
      logger.info(`⏳ [${agentName}] Đợi ${delay / 1000}s trước khi retry...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * DEV Agent - Viết source code, tạo file, và tự verify trước khi submit.
 *
 * Khả năng:
 * - Đọc codebase qua tools để hiểu code hiện tại
 * - Ghi file mới hoặc sửa file hiện tại
 * - Chạy tsc --noEmit, npm test, eslint để verify code
 * - Tự động fix lỗi nếu phát hiện qua execution
 * - Retry khi gặp 502/503/429 từ API
 *
 * US-01: Tích hợp Phase Tracking — ghi nhận phase bắt đầu/kết thúc vào DB.
 */
export async function devAgentNode(
  state: DevTeamStateType
): Promise<Partial<DevTeamStateType>> {
  const humanFeedback = state.humanFeedback;
  const projectContext = state.projectContext;
  const devAttempts = (state.devAttempts || 0) + 1;

  // --- Phase Tracking: START (AC1, AC2, AC3, AC5) ---
  const { phaseId } = await startPhaseTracking({
    workflowRunId: state.workflowRunId,
    phaseName: "development",
    agentName: "dev",
    inputSummary: humanFeedback
      ? `[REVISION] Feedback: ${humanFeedback}. TestResults: ${(state.testResults || "").slice(0, 200)}`
      : state.designDocument,
  });

  // System prompt + project context
  const systemPrompt = projectContext
    ? `${DEV_PROMPT}\n\n## BỐI CẢNH DỰ ÁN HIỆN TẠI\n${projectContext}`
    : DEV_PROMPT;

  // Truncate large state fields to avoid bloating the prompt
  // Tăng limit cho design doc vì BA giờ trả output dài hơn (maxTokens=16384)
  const truncatedDesign = truncateText(state.designDocument || "", 20000);
  const truncatedSource = truncateText(state.sourceCode || "", 12000);
  const truncatedLogs = truncateText(state.executionLogs || "", 6000, true); // giữ phần cuối
  const truncatedTestResults = truncateText(state.testResults || "", 6000);

  let userMessage = `Nhiệm vụ: Triển khai mã nguồn cho Feature Request dựa trên Design Doc.\n` +
    `YÊU CẦU: BẮT BUỘC dùng tool 'write_file' để ghi code. Tuyệt đối không in text code ra màn hình.\n` +
    `Khi đã ghi xong TẤT CẢ các file, BẮT BUỘC CHẠY tool 'submit_feature' để nộp bài.\n\n` +
    `## User Stories\n${state.userStories}\n` +
    `## Design Document\n${truncatedDesign}`;

  if (humanFeedback && state.testResults) {
    // Quay lại từ giai đoạn testing → có báo cáo lỗi từ Tester
    userMessage = `Code trước đó bị lỗi khi test (lần thử #${devAttempts}). Hãy dựa vào báo cáo của Tester để sửa code.

## Báo cáo lỗi từ Tester
${truncatedTestResults}

## Chi tiết feedback từ Tester
${state.testerFeedback || "Không có chi tiết thêm."}

## Execution Logs (output thực tế)
${truncatedLogs || "Không có logs."}

## Feedback từ Product Manager
${humanFeedback}

## Code cũ cần sửa
${truncatedSource}

## Design Document (tham khảo)
${truncatedDesign}

QUAN TRỌNG: Hãy đọc kỹ execution logs và tester feedback để hiểu chính xác lỗi gì. Dùng tool read_project_file để đọc code gốc nếu cần. Sau khi sửa, hãy dùng execute_command để verify lại.`;
  } else if (humanFeedback) {
    // Quay lại từ code review → chỉ có feedback của PM
    userMessage = `Code trước đó cần chỉnh sửa (lần thử #${devAttempts}). Feedback từ Product Manager:

${humanFeedback}

## Design Document (Mục tiêu của bạn)
${truncatedDesign}

## User Stories
${state.userStories}

## Code cũ cần sửa
${truncatedSource}

Chú ý: Hãy dùng tool \`write_file\` để lưu code mới. Tuyệt đối không in code bằng markdown văn xuôi. Sau khi sửa, gọi \`execute_command\` để biên dịch kiểm tra.`;
  }

  // Diagnostic logging — giúp debug 502/prompt size issues
  logPromptDiagnostics("DEV", systemPrompt, userMessage, devToolkit.length);

  // Bind tools vào LLM để kích hoạt Native Tool Calling.
  // XML parsing bên dưới vẫn giữ như safety net phòng trường hợp LLM fallback sang text.
  const llmWithTools = llm.bindTools(devToolkit);

  const messages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    new HumanMessage(userMessage),
  ];

  const MAX_TOOL_ROUNDS = 15; // Tăng lên 15 vòng để có room cho error-fix cycles
  const MAX_TOOLS_PER_ROUND = 5;
  let executionLogs = "";
  let hasCalledWriteFile = false;
  const writtenFiles = new Set<string>(); // Track file đã write để phân biệt lỗi "do mình" vs "pre-existing"

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      // Log tổng messages size trước mỗi vòng
      const totalMsgChars = messages.reduce((sum, m) => sum + (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content).length), 0);
      logger.debug(`📨 [DEV] Vòng ${round + 1}: ${messages.length} messages, ~${totalMsgChars} chars (~${estimateTokens(totalMsgChars.toString())} tokens)`);

      const response = await invokeWithRetry(llmWithTools, messages, "DEV", round);
      messages.push(response);

      // Debug: dump LLM response mỗi vòng ra file để phân tích
      try {
        const fs = await import("fs");
        const debugDir = "debug-logs";
        if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
        const dumpPath = `${debugDir}/dev-round-${round + 1}.json`;
        const responseData = {
          round: round + 1,
          timestamp: new Date().toISOString(),
          contentType: typeof response.content,
          contentPreview: typeof response.content === "string" ? response.content.slice(0, 500) : "(non-string)",
          toolCalls: response.tool_calls?.map((tc: any) => ({
            name: tc.name,
            argsKeys: Object.keys(tc.args || {}),
            argsPreview: JSON.stringify(tc.args).slice(0, 300),
            id: tc.id,
          })) || [],
          toolCallCount: response.tool_calls?.length || 0,
        };
        fs.writeFileSync(dumpPath, JSON.stringify(responseData, null, 2), "utf-8");
        logger.debug(`📝 [DEV] Response vòng ${round + 1} dumped to ${dumpPath}`);
      } catch { /* ignore debug dump errors */ }

      // Ưu tiên native tool calls từ API
      let toolCalls = response.tool_calls || [];

      // Safety net: parse XML tags nếu LLM không dùng native tool calling
      if (typeof response.content === "string") {
        const contentStr = response.content;

        // Match write_file
        const writeRegex = /<write_file>\s*<path>(.*?)<\/path>\s*<content>([\s\S]*?)<\/content>\s*<\/write_file>/g;
        let match;
        while ((match = writeRegex.exec(contentStr)) !== null) {
          toolCalls.push({
            name: "write_file",
            args: { filePath: match[1].trim(), content: match[2].trim() },
            id: `call_xml_${Math.random().toString(36).substring(7)}`
          });
        }

        // Match execute_command
        const cmdRegex = /<execute_command>\s*<command>(.*?)<\/command>\s*<\/execute_command>/g;
        while ((match = cmdRegex.exec(contentStr)) !== null) {
          toolCalls.push({
            name: "execute_command",
            args: { command: match[1].trim(), cwd: "." },
            id: `call_xml_${Math.random().toString(36).substring(7)}`
          });
        }

        // Match generic tool_call (read_project_file, list_directory...)
        const genericRegex = /<tool_call>\s*<name>(.*?)<\/name>\s*<args>([\s\S]*?)<\/args>\s*<\/tool_call>/g;
        while ((match = genericRegex.exec(contentStr)) !== null) {
          try {
            toolCalls.push({
              name: match[1].trim(),
              args: JSON.parse(match[2].trim()),
              id: `call_xml_${Math.random().toString(36).substring(7)}`
            });
          } catch (e) {
            logger.error(`❌ Lỗi parse JSON trong thẻ <args>: ${e}`);
          }
        }

        // Match submit_feature
        const submitRegex = /<submit_feature>([\s\S]*?)<\/submit_feature>/g;
        while ((match = submitRegex.exec(contentStr)) !== null) {
          toolCalls.push({
            name: "submit_feature",
            args: { report: match[1].trim() },
            id: `call_xml_${Math.random().toString(36).substring(7)}`
          });
        }

        if (toolCalls.length > 0 && (!response.tool_calls || response.tool_calls.length === 0)) {
          logger.info("🔧 XML Safety Net: Bóc tách tool calls từ văn bản trả về (LLM không dùng native tool API).");
        }
      }

      if (toolCalls.length === 0) {
        logger.warn(`⚠️ DEV Agent không gọi tool nào ở vòng ${round + 1}. Nội dung: ${typeof response.content === "string" ? response.content.slice(0, 200) : "..."}`);
        messages.push(new HumanMessage("CẢNH BÁO: Bạn vừa trả lời văn bản thuần tuý mà KHÔNG GỌI TOOL NÀO. Bạn PHẢI gọi tool (write_file, read_project_file, execute_command, submit_feature...) qua Function Call API. HÃY GỌI TOOL NGAY."));
        continue;
      }

      if (toolCalls.length > MAX_TOOLS_PER_ROUND) {
        logger.warn(`⚠️ DEV Agent muốn gọi ${toolCalls.length} tools, chỉ xử lý ${MAX_TOOLS_PER_ROUND}`);
      }
      logger.info(`🔧 DEV Agent gọi ${Math.min(toolCalls.length, MAX_TOOLS_PER_ROUND)} tool(s) (vòng ${round + 1}/${MAX_TOOL_ROUNDS})`);

      let isFinished = false;
      let finalReport = "";

      let callCount = 0;
      for (const tc of toolCalls) {
        callCount++;

        if (isFinished) {
          messages.push(new ToolMessage({
            content: `❌ Tool bị bỏ qua vì bạn đã gọi submit_feature trước đó trong cùng vòng.`,
            tool_call_id: tc.id || `err_${Date.now()}`
          }));
          continue;
        }

        if (callCount > MAX_TOOLS_PER_ROUND) {
          messages.push(new ToolMessage({
            content: `❌ Lỗi: Bạn đã gọi quá ${MAX_TOOLS_PER_ROUND} tools trong một vòng. Tool này bị bỏ qua để tránh nghẽn hệ thống. Vui lòng gọi lại ở vòng sau nếu cần thiết.`,
            tool_call_id: tc.id || `err_${Date.now()}`
          }));
          continue;
        }

        if (tc.name === "write_file") {
          hasCalledWriteFile = true;
          const filePath = (tc.args as any).filePath;
          if (filePath) writtenFiles.add(filePath);
        }

        // Bắt sự kiện nộp bài
        if (tc.name === "submit_feature") {
          isFinished = true;
          finalReport = (tc.args as any).report;
          messages.push(new ToolMessage({
            content: `✅ Đã tiếp nhận submit_feature.`,
            tool_call_id: tc.id || `err_${Date.now()}`
          }));
          continue;
        }

        // Thực thi các tool thông thường với try/catch TỪNG TOOL MỘT
        let toolMsg: any;
        try {
          toolMsg = await executeToolCall(tc);
          messages.push(toolMsg);

          if (tc.name === "execute_command") {
            executionLogs += `\n--- ${tc.args.command} ---\n${typeof toolMsg.content === "string" ? toolMsg.content : JSON.stringify(toolMsg.content)}\n`;
          }
        } catch (e: unknown) {
          messages.push(buildToolErrorMessage(
            tc.name,
            tc.id || `err_${Date.now()}`,
            e,
            tc.args,
          ));
        }
      }

      // --- Error-aware nudge: phát hiện execute_command fail → guide LLM sửa lỗi ---
      // Scan tool results vừa thực thi trong round này để detect command failures
      const lastMessages = messages.slice(-callCount);
      const hasCommandFail = lastMessages.some(
        (m) => m instanceof ToolMessage && typeof m.content === "string" && m.content.startsWith("❌ Lệnh thất bại")
      );

      if (hasCommandFail && !isFinished) {
        const writtenFilesList = writtenFiles.size > 0
          ? `Danh sách file bạn đã tạo/sửa: ${[...writtenFiles].join(", ")}`
          : "Bạn chưa write file nào.";

        const nudgeMsg = `⚠️ HỆ THỐNG PHÁT HIỆN LỆNH THẤT BẠI TRONG VÒNG NÀY.

QUY TRÌNH SỬA LỖI BẮT BUỘC:
1. ĐỌC KỸ error output ở trên — tìm pattern: \`file(line,col): error TSxxxx: message\`
2. XÁC ĐỊNH file lỗi:
   - ${writtenFilesList}
   - Nếu file lỗi NẰM TRONG danh sách trên → BẮT BUỘC SỬA NGAY bằng \`read_project_file\` rồi \`write_file\`
   - Nếu file lỗi KHÔNG nằm trong danh sách (pre-existing) → GHI NHẬN, tiếp tục công việc
3. Sau khi sửa → chạy lại \`tsc --noEmit\` để verify
4. TUYỆT ĐỐI KHÔNG: retry cùng command mà không sửa gì, hoặc bỏ qua lỗi rồi submit

HÃY BẮT ĐẦU SỬA LỖI NGAY.`;

        logger.info(`🔔 [DEV] Injecting error nudge (round ${round + 1}). Written files: [${[...writtenFiles].join(", ")}]`);
        messages.push(new HumanMessage(nudgeMsg));
      }

      // Nộp bài
      if (isFinished) {
        if (!hasCalledWriteFile) {
          logger.warn(`⚠️ Dev Agent gọi submit_feature khi chưa write_file.`);
          messages.push(new HumanMessage(
            "TỪ CHỐI NỘP BÀI: Bạn vừa gọi `submit_feature` NHƯNG chưa hề gọi `write_file` lần nào để lưu mã nguồn xuống đĩa! Hãy dùng `write_file` tạo code trước rồi mới gọi `submit_feature`."
          ));
          continue;
        }

        // --- Phase Tracking: COMPLETE (normal submit) ---
        await completePhaseTracking(state.workflowRunId, phaseId, "dev", finalReport);

        return {
          sourceCode: finalReport,
          currentPhase: "development",
          humanFeedback: "",
          devAttempts,
          executionLogs,
          currentPhaseId: phaseId,
        };
      }
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error(`❌ DEV Agent lỗi LLM Crash: ${errMsg}`);
    logger.info("🔄 LLM Crash. Trả quyền phân xử về cho PM.");

    // --- Phase Tracking: COMPLETE (LLM crash path) ---
    await completePhaseTracking(
      state.workflowRunId, phaseId, "dev",
      `LỖI API: ${errMsg}`
    );

    return {
      sourceCode: `LỖI API: ${errMsg}\n\nHãy yêu cầu Dev chạy lại.`,
      currentPhase: "development",
      humanFeedback: "",
      devAttempts,
      executionLogs: executionLogs + `\n[SYSTEM ERROR]: API Provider crashed.`,
      currentPhaseId: phaseId,
    };
  }

  // Nếu chạy hết MAX_TOOL_ROUNDS vòng mà vẫn thất bại / không chịu dùng tool
  const errorMsg = `LỖI: Dev Agent không hoàn thành nhiệm vụ sau ${MAX_TOOL_ROUNDS} vòng lặp. Agent không gọi write_file hoặc không gọi submit_feature.`;
  logger.error(`❌ ${errorMsg}`);

  // --- Phase Tracking: COMPLETE (timeout/exhausted path) ---
  await completePhaseTracking(state.workflowRunId, phaseId, "dev", errorMsg);

  return {
    sourceCode: errorMsg,
    currentPhase: "development",
    humanFeedback: "",
    devAttempts,
    executionLogs: executionLogs + `\n[SYSTEM ERROR]: Agent failed to write files.`,
    currentPhaseId: phaseId,
  };
}
