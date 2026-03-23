import { ChatAnthropic } from "@langchain/anthropic";
import {
  SystemMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { config } from "../../config/env.js";
import { TESTER_BASE_PROMPT } from "../prompts/dev-team.prompts.js";
import type { DevTeamStateType } from "../state.js";
import { allDevTools } from "../tools/codebase-tools.js";
import { executeToolCall, buildToolErrorMessage } from "../utils/execute-tool.js";
import { logger } from "../../utils/logger.js";
import { startPhaseTracking, completePhaseTracking } from "../utils/tracking-helper.js";
import { SkillRegistry } from "../skills/index.js";
import { exploreCodebaseSkill } from "../skills/explore-codebase.skill.js";
import { errorFixLoopSkill } from "../skills/error-fix-loop.skill.js";
import { verifySubmitSkill } from "../skills/verify-submit.skill.js";
import { writeTestsSkill } from "../skills/write-tests.skill.js";
import type { SkillSelectionContext } from "../skills/types.js";

/**
 * Tất cả tools mà Tester Agent có thể sử dụng.
 * allDevTools đã bao gồm: readProjectFile, listDirectory, readFileFull, writeFile, executeCommand, getProjectStructure, submitFeature.
 */
const testerToolkit = allDevTools;

// ============================================================================
// Khởi tạo SkillRegistry cho Tester Agent
// ============================================================================
const testerSkillRegistry = new SkillRegistry();
testerSkillRegistry.registerAll([
  exploreCodebaseSkill,
  writeTestsSkill,
  errorFixLoopSkill,
  verifySubmitSkill,
]);

// Khởi tạo model Claude cho TESTER
const llm = new ChatAnthropic({
  anthropicApiKey: config.anthropic.apiKey,
  modelName: 'claude-opus-4-6',
  temperature: 0.2,
  maxTokens: 16384, // Tester cần output dài cho báo cáo test chi tiết + viết test files
  clientOptions: config.anthropic.baseUrl
    ? {
      baseURL: config.anthropic.baseUrl,
      defaultHeaders: {
        "Authorization": `Bearer ${config.anthropic.apiKey}`
      }
    }
    : undefined,
});

/**
 * Phân tích execution logs để tính code quality metrics.
 */
function parseCodeQualityMetrics(executionLogs: string): {
  typeErrors: number;
  lintErrors: number;
  testsPassed: number;
  testsFailed: number;
  testCoverage: number;
} {
  const metrics = {
    typeErrors: 0,
    lintErrors: 0,
    testsPassed: 0,
    testsFailed: 0,
    testCoverage: 0,
  };

  // Parse type errors từ tsc output
  const typeErrorMatch = executionLogs.match(/Found (\d+) error/);
  if (typeErrorMatch) {
    metrics.typeErrors = parseInt(typeErrorMatch[1], 10);
  }

  // Parse lint errors từ eslint output
  const lintErrorMatch = executionLogs.match(/(\d+) error/);
  if (lintErrorMatch && !typeErrorMatch) {
    metrics.lintErrors = parseInt(lintErrorMatch[1], 10);
  }

  // Parse test results
  const testPassMatch = executionLogs.match(/(\d+) pass/i);
  if (testPassMatch) {
    metrics.testsPassed = parseInt(testPassMatch[1], 10);
  }

  const testFailMatch = executionLogs.match(/(\d+) fail/i);
  if (testFailMatch) {
    metrics.testsFailed = parseInt(testFailMatch[1], 10);
  }

  // Parse coverage
  const coverageMatch = executionLogs.match(/All files\s*\|\s*([\d.]+)/);
  if (coverageMatch) {
    metrics.testCoverage = parseFloat(coverageMatch[1]);
  }

  return metrics;
}

/**
 * Ước tính token count từ text (~3 chars/token mixed content).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/**
 * Truncate text nếu vượt quá maxChars.
 */
function truncateText(text: string, maxChars: number, keepEnd = false): string {
  if (text.length <= maxChars) return text;
  if (keepEnd) {
    return `...(truncated ${text.length - maxChars} chars)...\n` + text.slice(-maxChars);
  }
  return text.slice(0, maxChars) + `\n...(truncated ${text.length - maxChars} chars)...`;
}

/**
 * Gọi LLM với retry logic cho 502/503/429.
 */
async function invokeWithRetry(
  llmInstance: ReturnType<typeof llm.bindTools>,
  messages: BaseMessage[],
  agentName: string,
  round: number,
): Promise<any> {
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await llmInstance.invoke(messages);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const isRetryable = /502|503|429|overloaded|temporarily unavailable|rate.?limit/i.test(errMsg);

      logger.warn(`⚠️ [${agentName}] API Error (vòng ${round + 1}, thử ${attempt}/${MAX_RETRIES}): ${errMsg}`);

      if (!isRetryable || attempt === MAX_RETRIES) {
        logger.error(`❌ [${agentName}] Hết retry hoặc lỗi không retryable. Throwing...`);
        throw e;
      }

      const delay = 3000 * Math.pow(2, attempt - 1);
      logger.info(`⏳ [${agentName}] Đợi ${delay / 1000}s trước khi retry...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * TESTER Agent - Chạy test thực tế, review code, và báo cáo kết quả.
 *
 * Khả năng:
 * - Đọc codebase qua tools để hiểu code thực tế
 * - Chạy npm test, tsc --noEmit, eslint để kiểm tra code
 * - Viết test files nếu cần
 * - Phân tích output để tạo bug report chính xác
 * - Tính toán code quality metrics
 * - Retry khi gặp 502/503/429 từ API
 *
 * US-01: Tích hợp Phase Tracking — ghi nhận phase bắt đầu/kết thúc vào DB.
 */
export async function testerAgentNode(
  state: DevTeamStateType
): Promise<Partial<DevTeamStateType>> {
  const projectContext = state.projectContext;

  // --- Phase Tracking: START (AC1, AC2, AC3, AC5) ---
  const { phaseId } = await startPhaseTracking({
    workflowRunId: state.workflowRunId,
    phaseName: "testing",
    agentName: "tester",
    inputSummary: state.sourceCode,
  });

  // Base prompt + project context (skills sẽ được inject động trong loop)
  const basePromptWithContext = projectContext
    ? `${TESTER_BASE_PROMPT}\n\n## BỐI CẢNH DỰ ÁN HIỆN TẠI\n${projectContext}`
    : TESTER_BASE_PROMPT;

  // Truncate large fields — tăng limit cho design doc vì BA giờ trả output dài hơn
  const truncatedDesign = truncateText(state.designDocument || "", 16000);
  const truncatedSource = truncateText(state.sourceCode || "", 12000);
  const truncatedDevLogs = truncateText(state.executionLogs || "", 5000, true);

  // Xây dựng user message — phân biệt giữa lần đầu vs revision mode
  let userMessage: string;

  if (state.humanFeedback) {
    // REVISION MODE: PM yêu cầu Tester sửa lại test (action "retest" từ releaseApproval)
    logger.info(`🔄 [TESTER] Revision mode — PM feedback: "${state.humanFeedback.slice(0, 100)}..."`);

    const truncatedPrevTestResults = truncateText(state.testResults || "", 8000);

    userMessage = `⚠️ PM YÊU CẦU SỬA LẠI TEST. Bạn đang ở chế độ REVISION.

## Feedback từ Product Manager
${state.humanFeedback}

## Kết quả test cũ (cần xem lại và sửa)
${truncatedPrevTestResults || "Không có kết quả test trước đó."}

## User Stories & Acceptance Criteria (tham khảo)
${state.userStories}

## Source Code hiện tại (tham khảo)
${truncatedSource}

QUY TRÌNH SỬA TEST BẮT BUỘC:
1. Đọc feedback PM ở trên để hiểu vấn đề
2. Đọc lại test file đã viết trước đó bằng read_project_file
3. Sửa test file theo yêu cầu của PM bằng write_file
4. Chạy tsc --noEmit để verify syntax TRƯỚC
5. Chạy npm test để verify test pass
6. Gọi submit_feature với report mới (bao gồm thay đổi đã thực hiện)

THÔNG TIN TEST RUNNER (ĐÃ BIẾT — KHÔNG CẦN TÌM):
- Test runner: vitest | Lệnh: npm test
- KHÔNG dùng pipe |, ||, &&, redirect >, 2> trong execute_command
- Chỉ dùng lệnh đơn giản: npm test, tsc --noEmit, npm run build, npm run lint`;
  } else {
    // NORMAL MODE: Lần đầu Tester được gọi — chạy test từ đầu
    userMessage = `Hãy review code và chạy test thực tế dựa trên:

## User Stories & Acceptance Criteria
${state.userStories}

## Design Document
${truncatedDesign}

## Source Code (báo cáo từ Dev)
${truncatedSource}

## Execution Logs từ Dev (nếu có)
${truncatedDevLogs || "Không có logs từ dev."}

QUAN TRỌNG: Bạn PHẢI sử dụng tools THEO ĐÚNG THỨ TỰ SAU:
1. Đọc code thực tế trong dự án (read_project_file hoặc read_file_full) — KHÔNG dựa vào Source Code ở trên vì có thể bị truncate
2. Chạy tsc --noEmit để kiểm tra type errors (execute_command)
3. Chạy npm run build để verify code compile thành công (execute_command)
4. Chạy npm run lint (execute_command) — nếu fail vì chưa có linter thì BỎ QUA
5. VIẾT test files (*.test.ts) bằng write_file TRƯỚC — TUYỆT ĐỐI KHÔNG chạy npm test trước khi viết test files
6. SAU KHI đã viết test files → Chạy npm test (execute_command)
7. Dựa trên kết quả thực tế → gọi submit_feature để nộp kết luận PASS/FAIL

THÔNG TIN TEST RUNNER (ĐÃ BIẾT — KHÔNG CẦN TÌM):
- Test runner: vitest | Lệnh: npm test
- KHÔNG dùng pipe |, ||, &&, redirect >, 2> trong execute_command
- Chỉ dùng lệnh đơn giản: npm test, tsc --noEmit, npm run build, npm run lint

Nếu phát hiện bugs, hãy gợi ý cách fix CỤ THỂ (file nào, dòng nào, sửa gì).`;
  }

  // Bind tools vào LLM để kích hoạt Native Tool Calling.
  // XML parsing bên dưới vẫn giữ như safety net phòng trường hợp LLM fallback sang text.
  const llmWithTools = llm.bindTools(testerToolkit);

  // Agent loop: LLM suy nghĩ → gọi tool → nhận kết quả → tiếp tục
  const MAX_TOOL_ROUNDS = 18; // Tăng lên 18 vòng để có room cho error-fix cycles
  const MAX_TOOLS_PER_ROUND = 5;
  let executionLogs = "";
  const writtenFiles = new Set<string>(); // Track file đã write để phân biệt lỗi "do mình" vs "pre-existing"
  let hasWrittenTestFile = false; // Track xem đã viết test file chưa
  let lastRoundHadError = false; // Track error state cho SkillRegistry

  // Build initial system prompt with skills (round 0 context)
  const initialSkillContext: SkillSelectionContext = {
    agentRole: "tester",
    currentRound: 0,
    maxRounds: MAX_TOOL_ROUNDS,
    hasError: false,
    hasFeedback: false,
    hasWrittenFiles: false,
    writtenFiles: [],
  };
  const initialBuild = testerSkillRegistry.buildPrompt({
    basePrompt: basePromptWithContext,
    context: initialSkillContext,
  });

  // Diagnostic logging
  const totalChars = initialBuild.prompt.length + userMessage.length;
  logger.info(`📊 [TESTER] Prompt Diagnostics: system=${initialBuild.prompt.length}c, user=${userMessage.length}c, total=${totalChars}c (~${initialBuild.estimatedTokens + estimateTokens(userMessage)} tokens), tools=${testerToolkit.length}`);
  logger.info(`📚 [TESTER] Initial active skills: [${initialBuild.activeSkillNames.join(", ")}]`);

  const messages: BaseMessage[] = [
    new SystemMessage(initialBuild.prompt),
    new HumanMessage(userMessage),
  ];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      // --- Dynamic Skill Selection: rebuild system prompt mỗi round ---
      const skillContext: SkillSelectionContext = {
        agentRole: "tester",
        currentRound: round,
        maxRounds: MAX_TOOL_ROUNDS,
        hasError: lastRoundHadError,
        hasFeedback: false,
        hasWrittenFiles: writtenFiles.size > 0,
        writtenFiles: [...writtenFiles],
      };
      const skillBuild = testerSkillRegistry.buildPrompt({
        basePrompt: basePromptWithContext,
        context: skillContext,
      });

      // Cập nhật system message (luôn ở index 0)
      messages[0] = new SystemMessage(skillBuild.prompt);

      if (round > 0) {
        logger.debug(`📚 [TESTER] Round ${round + 1} skills: [${skillBuild.activeSkillNames.join(", ")}] (~${skillBuild.estimatedTokens} tokens)`);
      }

      // Reset error flag cho round mới
      lastRoundHadError = false;

      const totalMsgChars = messages.reduce((sum, m) => sum + (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content).length), 0);
      logger.debug(`📨 [TESTER] Vòng ${round + 1}: ${messages.length} messages, ~${totalMsgChars} chars`);

      const response = await invokeWithRetry(llmWithTools, messages, "TESTER", round);
      messages.push(response);

      // Debug: dump LLM response mỗi vòng ra file để phân tích
      try {
        const fs = await import("fs");
        const debugDir = "debug-logs";
        if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
        const dumpPath = `${debugDir}/tester-round-${round + 1}.json`;
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
        logger.debug(`📝 [TESTER] Response vòng ${round + 1} dumped to ${dumpPath}`);
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
        let finalTestReport = "";
        while ((match = submitRegex.exec(contentStr)) !== null) {
          finalTestReport = match[1].trim();
          toolCalls.push({
            name: "submit_feature",
            args: { report: finalTestReport },
            id: `call_xml_${Math.random().toString(36).substring(7)}`
          });
        }

        if (toolCalls.length > 0 && (!response.tool_calls || response.tool_calls.length === 0)) {
          logger.info("🔧 XML Safety Net: Bóc tách tool calls từ văn bản trả về (TESTER LLM không dùng native tool API).");
        }
      }

      if (toolCalls.length === 0) {
        logger.warn(`⚠️ TESTER Agent không gọi tool nào ở vòng ${round + 1}. Nội dung: ${typeof response.content === "string" ? response.content.slice(0, 200) : "..."}`);
        messages.push(new HumanMessage("CẢNH BÁO: Bạn vừa trả lời văn bản thuần tuý mà KHÔNG GỌI TOOL NÀO. Bạn PHẢI gọi tool (read_project_file, write_file, execute_command, submit_feature...) qua Function Call API. HÃY GỌI TOOL NGAY."));
        continue;
      }

      if (toolCalls.length > MAX_TOOLS_PER_ROUND) {
        logger.warn(`⚠️ TESTER Agent muốn gọi ${toolCalls.length} tools, chỉ xử lý ${MAX_TOOLS_PER_ROUND}`);
      }

      logger.info(`🔧 TESTER Agent gọi ${Math.min(toolCalls.length, MAX_TOOLS_PER_ROUND)} tool(s) (vòng ${round + 1}/${MAX_TOOL_ROUNDS})`);

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
          const filePath = (tc.args as any).filePath;
          if (filePath) {
            writtenFiles.add(filePath);
            if (filePath.endsWith(".test.ts")) hasWrittenTestFile = true;
          }
        }

        if (tc.name === "submit_feature") {
          isFinished = true;
          finalReport = (tc.args as any).report;
          messages.push(new ToolMessage({
            content: `✅ Đã tiếp nhận submit_feature.`,
            tool_call_id: tc.id || `err_${Date.now()}`
          }));
          continue;
        }

        let toolMsg: any;
        try {
          toolMsg = await executeToolCall(tc);
          messages.push(toolMsg);

          // Thu thập execution logs
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

      // --- Error-aware nudge: phát hiện execute_command fail → guide Tester sửa test ---
      const lastMessages = messages.slice(-callCount);
      const hasCommandFail = lastMessages.some(
        (m) => m instanceof ToolMessage && typeof m.content === "string" && m.content.startsWith("❌ Lệnh thất bại")
      );

      // Cập nhật error flag cho SkillRegistry — round tiếp theo sẽ inject error-fix-loop skill
      if (hasCommandFail) {
        lastRoundHadError = true;
      }

      if (hasCommandFail && !isFinished) {
        const writtenFilesList = writtenFiles.size > 0
          ? `Danh sách file bạn đã tạo/sửa: ${[...writtenFiles].join(", ")}`
          : "Bạn chưa write file nào.";

        // Phân biệt loại lỗi dựa trên content
        const failedContent = lastMessages
          .filter((m) => m instanceof ToolMessage && typeof m.content === "string" && m.content.startsWith("❌ Lệnh thất bại"))
          .map((m) => typeof m.content === "string" ? m.content : "")
          .join("\n");

        const isSyntaxError = /Expected "|but found|Unexpected token|Transform failed|SyntaxError/i.test(failedContent);
        const isAssertionError = /AssertionError|expected .* to be|toEqual|toBeNull|toHaveBeenCalled/i.test(failedContent);

        let errorTypeHint = "";
        if (isSyntaxError) {
          errorTypeHint = `\n🔴 PHÁT HIỆN LỖI SYNTAX trong test file. Nguyên nhân thường gặp:
- Dùng TypeScript syntax không hợp lệ trong runtime (vd: \`const { type X }\` — KHÔNG hợp lệ)
- Import sai cú pháp
- Template literal không đóng đúng
→ HÃY ĐỌC LẠI FILE TEST BẠN VỪA VIẾT bằng \`read_project_file\`, SỬA SYNTAX, rồi chạy \`tsc --noEmit\` để verify TRƯỚC KHI chạy \`npm test\` lại.`;
        } else if (isAssertionError) {
          errorTypeHint = `\n🟡 PHÁT HIỆN LỖI ASSERTION trong test. Nguyên nhân thường gặp:
- expect(result).toBeNull() nhưng hàm thật trả undefined → đổi thành toBeUndefined()
- Mock không được gọi vì bạn mock sai function/module path
- Return type giả định sai so với source code thực tế
→ HÃY ĐỌC LẠI SOURCE CODE THỰC TẾ của hàm đang test bằng \`read_project_file\`, kiểm tra return type và behavior thật, rồi SỬA TEST cho khớp.`;
        }

        const nudgeMsg = `⚠️ HỆ THỐNG PHÁT HIỆN LỆNH THẤT BẠI TRONG VÒNG NÀY.
${errorTypeHint}

QUY TRÌNH SỬA LỖI TEST BẮT BUỘC:
1. ĐỌC KỸ error output ở trên — tìm file + dòng + loại lỗi
2. ${writtenFilesList}
3. Dùng \`read_project_file\` để đọc lại file test LỖI + file source code liên quan
4. Dùng \`write_file\` để sửa test file
5. Chạy \`tsc --noEmit\` để verify syntax TRƯỚC
6. Chạy \`npm test\` lại SAU KHI tsc pass

TUYỆT ĐỐI KHÔNG retry \`npm test\` mà không sửa gì. TUYỆT ĐỐI KHÔNG submit khi test còn lỗi syntax.
HÃY BẮT ĐẦU SỬA NGAY.`;

        logger.info(`🔔 [TESTER] Injecting error nudge (round ${round + 1}). Error type: ${isSyntaxError ? "SYNTAX" : isAssertionError ? "ASSERTION" : "OTHER"}. Written files: [${[...writtenFiles].join(", ")}]`);
        messages.push(new HumanMessage(nudgeMsg));
      }

      // --- Test file written reminder: nhắc verify syntax trước khi run ---
      if (hasWrittenTestFile && !isFinished && !hasCommandFail) {
        // Kiểm tra xem round này có write test file không
        const wroteTestThisRound = toolCalls.some(
          (tc: any) => tc.name === "write_file" && (tc.args as any).filePath?.endsWith(".test.ts")
        );
        if (wroteTestThisRound) {
          logger.info(`🔔 [TESTER] Test file written reminder injected (round ${round + 1})`);
          messages.push(new HumanMessage(
            `📝 Bạn vừa viết test file. TRƯỚC KHI chạy \`npm test\`, hãy chạy \`tsc --noEmit\` để verify test file KHÔNG CÓ syntax error. Nếu tsc báo lỗi ở file test → sửa ngay. Chỉ chạy \`npm test\` khi tsc pass.`
          ));
        }
      }

      if (isFinished) {
        // Phân tích metrics từ execution logs
        const codeQualityMetrics = parseCodeQualityMetrics(executionLogs);

        // Trích xuất tester feedback (gợi ý fix cụ thể)
        const testerFeedback = extractTesterFeedback(finalReport);

        // --- Phase Tracking: COMPLETE (normal submit) ---
        await completePhaseTracking(state.workflowRunId, phaseId, "tester", finalReport);

        return {
          testResults: finalReport,
          currentPhase: "testing",
          humanFeedback: "",
          executionLogs,
          codeQualityMetrics,
          testerFeedback,
          currentPhaseId: phaseId,
        };
      }
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error(`❌ TESTER Agent lỗi LLM Crash: ${errMsg}`);
    logger.info("🔄 TESTER Crash. Trả quyền phân xử về cho PM.");

    const codeQualityMetrics = parseCodeQualityMetrics(executionLogs);

    // --- Phase Tracking: COMPLETE (LLM crash path) ---
    await completePhaseTracking(
      state.workflowRunId, phaseId, "tester",
      `LỖI API TESTER: ${errMsg}`
    );

    return {
      testResults: `LỖI API TESTER: ${errMsg}\n\nHãy yêu cầu Tester chạy lại.`,
      currentPhase: "testing",
      humanFeedback: "",
      executionLogs: executionLogs + `\n[SYSTEM ERROR]: TESTER API crashed.`,
      codeQualityMetrics,
      testerFeedback: "Tester Agent bị crash, không có feedback.",
      currentPhaseId: phaseId,
    };
  }

  // Nếu chạy hết MAX_TOOL_ROUNDS vòng mà vẫn không submit
  const errorMsg = `LỖI: Tester Agent không hoàn thành nhiệm vụ sau ${MAX_TOOL_ROUNDS} vòng lặp.`;
  logger.error(`❌ ${errorMsg}`);

  const codeQualityMetrics = parseCodeQualityMetrics(executionLogs);

  // --- Phase Tracking: COMPLETE (timeout/exhausted path) ---
  await completePhaseTracking(state.workflowRunId, phaseId, "tester", errorMsg);

  return {
    testResults: errorMsg,
    currentPhase: "testing",
    humanFeedback: "",
    executionLogs: executionLogs + `\n[SYSTEM ERROR]: Tester agent exhausted rounds.`,
    codeQualityMetrics,
    testerFeedback: "Tester Agent không hoàn thành.",
    currentPhaseId: phaseId,
  };
}

/**
 * Trích xuất phần gợi ý fix từ test results.
 * Tìm các section Bug Report và Recommendation.
 */
function extractTesterFeedback(testResults: string): string {
  const lines = testResults.split("\n");
  const feedbackLines: string[] = [];
  let inBugSection = false;
  let inRecommendation = false;

  for (const line of lines) {
    if (line.includes("BUG-") || line.includes("Bug Report")) {
      inBugSection = true;
    }
    if (line.includes("Recommendation") || line.includes("Gợi ý fix")) {
      inRecommendation = true;
    }
    if (line.includes("Kết luận") || line.includes("### Test Cases")) {
      inBugSection = false;
      inRecommendation = false;
    }

    if (inBugSection || inRecommendation) {
      feedbackLines.push(line);
    }
  }

  return feedbackLines.length > 0
    ? feedbackLines.join("\n")
    : "Không có gợi ý fix cụ thể.";
}
