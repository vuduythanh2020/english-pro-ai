/**
 * Agent Skill Type Definitions
 * ============================================================================
 * Skill = một đơn vị kiến thức + quy trình có thể inject động vào agent prompt.
 *
 * Thay vì nhồi tất cả vào system prompt monolithic, skill system cho phép:
 * - Chỉ inject skill cần thiết tại thời điểm cần → tiết kiệm token budget
 * - Tái sử dụng cross-agent (Dev + Tester share explore-codebase, error-fix-loop)
 * - Dễ iterate: sửa 1 skill → cả Dev + Tester đều được cải thiện
 */

/**
 * Vai trò agent có thể sử dụng skill.
 * Giới hạn chỉ Dev + Tester vì PO/BA/Context Sync prompt đủ đơn giản.
 */
export type AgentRole = "dev" | "tester";

/**
 * Điều kiện kích hoạt skill dựa trên context hiện tại của agent.
 * SkillRegistry.selectSkills() dùng interface này để quyết định inject skill nào.
 */
export interface SkillSelectionContext {
    /** Vai trò agent hiện tại */
    agentRole: AgentRole;

    /** Round hiện tại trong tool loop (0-based) */
    currentRound: number;

    /** Tổng số rounds tối đa */
    maxRounds: number;

    /** Round cuối có gặp lỗi execute_command không */
    hasError: boolean;

    /** Có humanFeedback hoặc testResults fail không (revision mode) */
    hasFeedback: boolean;

    /** Đã gọi write_file ít nhất 1 lần chưa */
    hasWrittenFiles: boolean;

    /** Danh sách file đã write (để error-fix skill biết focus vào đâu) */
    writtenFiles: string[];
}

/**
 * Một Agent Skill — đơn vị kiến thức inject được vào prompt.
 *
 * Mỗi skill chứa:
 * - Metadata (name, description, applicableRoles)
 * - shouldActivate(): logic quyết định có inject skill này không
 * - promptFragment: nội dung prompt sẽ được ghép vào system message
 * - priority: thứ tự sắp xếp khi ghép nhiều skills (thấp hơn = ưu tiên hơn)
 */
export interface AgentSkill {
    /** Tên unique của skill, dùng làm key trong registry. VD: "explore-codebase" */
    name: string;

    /** Mô tả ngắn gọn skill làm gì */
    description: string;

    /** Roles nào có thể dùng skill này */
    applicableRoles: AgentRole[];

    /** Priority khi ghép vào prompt. Số nhỏ = ưu tiên cao = đặt trước */
    priority: number;

    /**
     * Logic quyết định skill có nên được kích hoạt ở context hiện tại không.
     * Return true → skill sẽ được inject vào prompt.
     *
     * @param context - Thông tin về trạng thái hiện tại của agent
     */
    shouldActivate(context: SkillSelectionContext): boolean;

    /**
     * Nội dung prompt fragment.
     * Có thể là static string hoặc dynamic dựa trên context.
     *
     * @param context - Thông tin về trạng thái hiện tại (optional, cho dynamic skills)
     * @returns Prompt fragment sẽ được ghép vào system message
     */
    getPromptFragment(context?: SkillSelectionContext): string;

    /**
     * Danh sách tools cần thiết cho skill này (informational).
     * Không ảnh hưởng runtime — chỉ dùng cho documentation và validation.
     */
    requiredTools?: string[];
}

/**
 * Kết quả từ SkillRegistry.buildPrompt()
 */
export interface SkillBuildResult {
    /** System prompt hoàn chỉnh (base + skills) */
    prompt: string;

    /** Danh sách skills đã được activate */
    activeSkillNames: string[];

    /** Estimated token count (rough: ~3 chars/token) */
    estimatedTokens: number;
}
