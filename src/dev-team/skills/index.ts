/**
 * Skill Registry — Central hub quản lý và điều phối Agent Skills.
 * ============================================================================
 *
 * Responsibilities:
 * 1. register() — Đăng ký skill vào registry
 * 2. selectSkills() — Tự động chọn skills phù hợp dựa trên context
 * 3. buildPrompt() — Ghép base prompt + active skills thành system prompt hoàn chỉnh
 *
 * Usage:
 *   const registry = new SkillRegistry();
 *   registry.register(exploreCodebaseSkill);
 *   registry.register(errorFixLoopSkill);
 *
 *   const result = registry.buildPrompt({
 *     basePrompt: DEV_BASE_PROMPT,
 *     context: { agentRole: "dev", currentRound: 3, hasError: true, ... },
 *   });
 *   // result.prompt = base + explore-codebase + error-fix-loop fragments
 */

import type {
    AgentSkill,
    SkillSelectionContext,
    SkillBuildResult,
} from "./types.js";
import { logger } from "../../utils/logger.js";

export class SkillRegistry {
    private skills: Map<string, AgentSkill> = new Map();

    /**
     * Đăng ký một skill vào registry.
     * Nếu skill cùng tên đã tồn tại → ghi đè (cho phép override/update).
     */
    register(skill: AgentSkill): void {
        if (this.skills.has(skill.name)) {
            logger.warn(
                `⚠️ [SkillRegistry] Overwriting existing skill: ${skill.name}`
            );
        }
        this.skills.set(skill.name, skill);
        logger.debug(`📚 [SkillRegistry] Registered skill: ${skill.name}`);
    }

    /**
     * Đăng ký nhiều skills cùng lúc.
     */
    registerAll(skills: AgentSkill[]): void {
        for (const skill of skills) {
            this.register(skill);
        }
    }

    /**
     * Lấy skill theo tên.
     */
    get(name: string): AgentSkill | undefined {
        return this.skills.get(name);
    }

    /**
     * Lấy tất cả skills đã đăng ký.
     */
    getAll(): AgentSkill[] {
        return Array.from(this.skills.values());
    }

    /**
     * Số lượng skills đã đăng ký.
     */
    get size(): number {
        return this.skills.size;
    }

    /**
     * Tự động chọn skills phù hợp dựa trên context hiện tại.
     *
     * Logic:
     * 1. Filter skills theo applicableRoles (chỉ lấy skills phù hợp với role)
     * 2. Gọi shouldActivate() trên mỗi skill với context
     * 3. Sort theo priority (thấp = ưu tiên cao)
     * 4. Return danh sách tên skills đã chọn
     *
     * @param context - Trạng thái hiện tại của agent
     * @returns Danh sách tên skills được kích hoạt, đã sort theo priority
     */
    selectSkills(context: SkillSelectionContext): string[] {
        const selected: AgentSkill[] = [];

        for (const skill of this.skills.values()) {
            // Filter by role
            if (!skill.applicableRoles.includes(context.agentRole)) {
                continue;
            }

            // Check activation condition
            if (skill.shouldActivate(context)) {
                selected.push(skill);
            }
        }

        // Sort by priority (ascending — lower = higher priority)
        selected.sort((a, b) => a.priority - b.priority);

        const names = selected.map((s) => s.name);

        logger.debug(
            `📚 [SkillRegistry] Selected ${names.length} skills for ${context.agentRole} ` +
            `(round ${context.currentRound}): [${names.join(", ")}]`
        );

        return names;
    }

    /**
     * Build system prompt hoàn chỉnh = base prompt + active skill fragments.
     *
     * Mỗi skill fragment được wrapped trong section header rõ ràng
     * để LLM biết đây là instruction block riêng biệt.
     *
     * @param params.basePrompt - Prompt cơ bản (vai trò + tools available)
     * @param params.context - Trạng thái hiện tại để selectSkills() và getPromptFragment()
     * @param params.skillOverrides - Optional: danh sách skill names cụ thể thay vì auto-select
     * @returns SkillBuildResult chứa prompt hoàn chỉnh + metadata
     */
    buildPrompt(params: {
        basePrompt: string;
        context: SkillSelectionContext;
        skillOverrides?: string[];
    }): SkillBuildResult {
        const { basePrompt, context, skillOverrides } = params;

        // Chọn skills: dùng overrides nếu có, ngược lại auto-select
        const skillNames = skillOverrides ?? this.selectSkills(context);

        // Build fragments
        const fragments: string[] = [];
        const activeSkillNames: string[] = [];

        for (const name of skillNames) {
            const skill = this.skills.get(name);
            if (!skill) {
                logger.warn(
                    `⚠️ [SkillRegistry] Skill not found: ${name}. Skipping.`
                );
                continue;
            }

            const fragment = skill.getPromptFragment(context);
            if (fragment.trim().length === 0) {
                continue; // Skip empty fragments
            }

            fragments.push(
                `\n## SKILL: ${skill.name.toUpperCase()}\n${fragment}`
            );
            activeSkillNames.push(name);
        }

        // Compose final prompt
        const skillSection =
            fragments.length > 0
                ? `\n\n${"=".repeat(60)}\nACTIVE SKILLS (${activeSkillNames.length})\n${"=".repeat(60)}${fragments.join("\n")}`
                : "";

        const prompt = `${basePrompt}${skillSection}`;

        // Estimate tokens (~3 chars/token for mixed Vietnamese/English)
        const estimatedTokens = Math.ceil(prompt.length / 3);

        logger.info(
            `📚 [SkillRegistry] Built prompt: ${prompt.length} chars (~${estimatedTokens} tokens), ` +
            `${activeSkillNames.length} skills: [${activeSkillNames.join(", ")}]`
        );

        return {
            prompt,
            activeSkillNames,
            estimatedTokens,
        };
    }

    /**
     * Xóa một skill khỏi registry.
     */
    unregister(name: string): boolean {
        return this.skills.delete(name);
    }

    /**
     * Xóa tất cả skills.
     */
    clear(): void {
        this.skills.clear();
    }
}

// ============================================================================
// Singleton instance — dùng chung cho toàn bộ dev-team workflow
// ============================================================================

let _defaultRegistry: SkillRegistry | null = null;

/**
 * Lấy singleton SkillRegistry instance.
 * Tạo mới nếu chưa có. Dùng chung cho Dev Agent và Tester Agent.
 */
export function getDefaultRegistry(): SkillRegistry {
    if (!_defaultRegistry) {
        _defaultRegistry = new SkillRegistry();
    }
    return _defaultRegistry;
}

/**
 * Reset singleton registry (dùng trong tests).
 */
export function resetDefaultRegistry(): void {
    _defaultRegistry = null;
}

// Re-export types for convenience
export type {
    AgentSkill,
    AgentRole,
    SkillSelectionContext,
    SkillBuildResult,
} from "./types.js";
