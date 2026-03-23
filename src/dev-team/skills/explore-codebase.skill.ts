/**
 * Skill: Explore Codebase
 * ============================================================================
 * Hướng dẫn agent khám phá cấu trúc dự án trước khi bắt tay vào công việc.
 *
 * Shared: Dev + Tester (+ BA nếu cần mở rộng sau)
 * Kích hoạt: Rounds đầu tiên (0-2) khi chưa write file nào
 */

import type { AgentSkill, SkillSelectionContext } from "./types.js";

export const exploreCodebaseSkill: AgentSkill = {
    name: "explore-codebase",
    description:
        "Hướng dẫn agent dùng tools khám phá cấu trúc dự án, đọc code liên quan trước khi viết code mới.",
    applicableRoles: ["dev", "tester"],
    priority: 10, // Luôn chạy đầu tiên

    shouldActivate(context: SkillSelectionContext): boolean {
        // Chỉ kích hoạt ở 3 rounds đầu VÀ chưa write file nào
        return context.currentRound <= 2 && !context.hasWrittenFiles;
    },

    getPromptFragment(): string {
        return `
### Quy trình khám phá codebase (BẮT BUỘC trước khi viết code)

1. **Xem toàn cảnh**: Gọi \`get_project_structure\` với maxDepth=3 để hiểu cấu trúc dự án
2. **Đọc code liên quan**: Dùng \`read_project_file\` để đọc các file liên quan trực tiếp đến nhiệm vụ
3. **Hiểu conventions**: Chú ý:
   - File naming pattern (kebab-case: \`po.agent.ts\`, \`codebase-tools.ts\`)
   - Import style (ESM with \`.js\` extension)
   - Export style (named exports, không dùng default export)
   - Error handling patterns (try/catch, graceful degradation)
   - Logging patterns (dùng \`logger\` từ \`../../utils/logger.js\`)

**QUAN TRỌNG:** Chỉ đọc tối đa 3-5 files. Không đọc quá nhiều — tập trung vào file trực tiếp liên quan.
`.trim();
    },

    requiredTools: [
        "get_project_structure",
        "read_project_file",
        "list_directory",
    ],
};
