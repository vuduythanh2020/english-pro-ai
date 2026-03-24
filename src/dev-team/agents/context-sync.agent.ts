import * as fs from "fs";
import * as path from "path";
import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { config } from "../../config/env.js";
import { CONTEXT_SYNC_PROMPT } from "../prompts/context-sync.prompts.js";
import {
    generateProjectContext,
    diffProjectContext,
} from "../project-context.js";
import type { DevTeamStateType } from "../state.js";
import { logger } from "../../utils/logger.js";

const PROJECT_ROOT = process.cwd();

// LLM cho Phase 2 — temperature thấp vì cần đánh giá chính xác
const llm = new ChatAnthropic({
    anthropicApiKey: config.anthropic.apiKey,
    modelName: "claude-sonnet-4-20250514",
    temperature: 0.1,
    maxTokens: 8192,
    clientOptions: config.anthropic.baseUrl
        ? {
            baseURL: config.anthropic.baseUrl,
            defaultHeaders: {
                Authorization: `Bearer ${config.anthropic.apiKey}`,
            },
        }
        : undefined,
});

/**
 * Đọc file an toàn — trả về nội dung hoặc error message.
 */
function safeReadFile(relativePath: string): string {
    try {
        const fullPath = path.join(PROJECT_ROOT, relativePath);
        return fs.readFileSync(fullPath, "utf-8");
    } catch {
        return `(Không đọc được file: ${relativePath})`;
    }
}

/**
 * Phase 1: Deterministic Context Refresh.
 *
 * Re-scan project structure và so sánh với context cũ.
 * Luôn chạy, không tốn API call.
 */
function phase1RefreshContext(oldContext: string): {
    newContext: string;
    changeSummary: string;
    hasSignificantChanges: boolean;
} {
    logger.info("🔄 [ContextSync] Phase 1: Re-scanning project structure...");

    const newContext = generateProjectContext();
    const diff = diffProjectContext(oldContext, newContext);

    logger.info(
        `🔄 [ContextSync] Phase 1 complete: +${diff.addedLines.length} -${diff.removedLines.length} changes, significant=${diff.hasSignificantChanges}`
    );

    return {
        newContext,
        changeSummary: diff.changeSummary,
        hasSignificantChanges: diff.hasSignificantChanges,
    };
}

/**
 * Phase 2: AI-powered Prompt Drift Detection.
 *
 * Đọc code thực tế (prompts, state, graph) và nhờ LLM đánh giá
 * xem prompts có còn phản ánh đúng code không.
 *
 * Chỉ chạy khi Phase 1 phát hiện significant changes.
 *
 * @returns Proposal string nếu phát hiện drift, empty string nếu không.
 */
async function phase2DetectDrift(
    changeSummary: string,
    sprintSummary: string
): Promise<string> {
    logger.info(
        "🤖 [ContextSync] Phase 2: AI Drift Detection starting..."
    );

    // Đọc 3 source-of-truth files
    const promptsContent = safeReadFile(
        "src/dev-team/prompts/dev-team.prompts.ts"
    );
    const stateContent = safeReadFile("src/dev-team/state.ts");
    const graphContent = safeReadFile("src/dev-team/graph.ts");

    const userMessage = `## Change Summary từ sprint vừa hoàn thành
${changeSummary}

## Sprint Summary (báo cáo Dev + Tester)
${sprintSummary}

---

## File 1: dev-team.prompts.ts (PROMPTS HIỆN TẠI — đối tượng đánh giá)
\`\`\`typescript
${promptsContent}
\`\`\`

## File 2: state.ts (STATE DEFINITION — source of truth)
\`\`\`typescript
${stateContent}
\`\`\`

## File 3: graph.ts (GRAPH FLOW — source of truth)
\`\`\`typescript
${graphContent}
\`\`\`

---

Hãy đánh giá xem prompts trong File 1 có phản ánh đúng code trong File 2 và File 3 không.
Trả về STATUS: NO_DRIFT hoặc STATUS: DRIFT_DETECTED kèm đề xuất cụ thể.`;

    try {
        const response = await llm.invoke([
            new SystemMessage(CONTEXT_SYNC_PROMPT),
            new HumanMessage(userMessage),
        ]);

        const content =
            typeof response.content === "string"
                ? response.content
                : JSON.stringify(response.content);

        logger.info(
            `🤖 [ContextSync] Phase 2 complete: ${content.length} chars response`
        );

        // Kiểm tra kết quả
        if (content.includes("NO_DRIFT")) {
            logger.info("✅ [ContextSync] Không phát hiện drift. Prompts OK.");
            return "";
        }

        if (content.includes("DRIFT_DETECTED")) {
            logger.warn(
                "⚠️ [ContextSync] Phát hiện drift! Cần PM duyệt đề xuất thay đổi."
            );
            return content;
        }

        // Fallback: nếu LLM không tuân theo format
        logger.warn(
            "⚠️ [ContextSync] LLM response không theo format. Treating as no drift."
        );
        return "";
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.error(`❌ [ContextSync] Phase 2 lỗi: ${errMsg}`);
        // Fail-safe: nếu LLM lỗi, skip drift detection, không block workflow
        return "";
    }
}

/**
 * Context Sync Agent Node — chạy sau mỗi sprint hoàn thành.
 *
 * Phase 1 (luôn chạy): Deterministic re-scan → cập nhật projectContext.
 * Phase 2 (khi có significant changes): AI drift detection → đề xuất sửa prompts.
 *
 * Nếu Phase 2 phát hiện drift, set nextAgent = "prompt_sync_approval"
 * để PM duyệt trước khi sửa. Nếu không, tiếp tục về us_router.
 */
export async function contextSyncAgentNode(
    state: DevTeamStateType
): Promise<Partial<DevTeamStateType>> {
    const oldContext = state.projectContext || "";
    const sprintIndex = state.currentUsIndex || 0;
    const totalStories = state.allUserStories?.length || 0;

    logger.info(
        `🔄 [ContextSync] Sprint ${sprintIndex}/${totalStories} hoàn thành. Bắt đầu sync...`
    );

    // ── Phase 1: Deterministic Refresh ──────────────────────────────
    const { newContext, changeSummary, hasSignificantChanges } =
        phase1RefreshContext(oldContext);

    // Tạo sprint summary từ state
    const sprintSummary = [
        `User Story: ${state.userStories?.slice(0, 500) || "(không có)"}`,
        `Dev Report: ${state.sourceCode?.slice(0, 500) || "(không có)"}`,
        `Test Results: ${state.testResults?.slice(0, 500) || "(không có)"}`,
    ].join("\n\n");

    // ── Phase 2: AI Drift Detection (chỉ khi cần) ──────────────────
    let promptChangeProposal = "";

    if (hasSignificantChanges) {
        logger.info(
            "🤖 [ContextSync] Significant changes detected → Running Phase 2..."
        );
        promptChangeProposal = await phase2DetectDrift(
            changeSummary,
            sprintSummary
        );
    } else {
        logger.info(
            "✅ [ContextSync] No significant changes → Skipping Phase 2."
        );
    }

    // ── Capture story summary (tích lũy qua append reducer) ──────────
    const storySummary = [
        `## Story ${sprintIndex}/${totalStories}`,
        `**Yêu cầu**: ${state.userStories?.slice(0, 300) || "(không có)"}`,
        `**Thiết kế**: ${state.designDocument?.slice(0, 300) || "(không có)"}`,
        `**Code**: ${state.sourceCode?.slice(0, 500) || "(không có)"}`,
        `**Test**: ${state.testResults?.slice(0, 300) || "(không có)"}`,
    ].join("\n");

    logger.info(`📝 [ContextSync] Captured story summary ${sprintIndex}/${totalStories} (${storySummary.length} chars)`);

    // ── Quyết định routing ──────────────────────────────────────────
    const hasProposal = promptChangeProposal.length > 0;

    return {
        projectContext: newContext,
        contextSyncSummary: changeSummary,
        promptChangeProposal,
        completedStorySummaries: [storySummary],  // Append nhờ reducer
        nextAgent: hasProposal ? "prompt_sync_approval" : "us_router",
    };
}
