/**
 * Skill: Write TypeScript Code
 * ============================================================================
 * Coding conventions và patterns đặc thù của dự án.
 * Inject khi agent đã hiểu codebase và sẵn sàng viết code.
 *
 * Dev only
 * Kích hoạt: Sau rounds khám phá (round >= 2) VÀ chưa submit
 */

import type { AgentSkill, SkillSelectionContext } from "./types.js";

export const writeTypescriptSkill: AgentSkill = {
    name: "write-typescript",
    description:
        "Coding conventions, TypeScript patterns, và hướng dẫn viết code theo style của dự án.",
    applicableRoles: ["dev"],
    priority: 20, // Sau explore-codebase

    shouldActivate(context: SkillSelectionContext): boolean {
        // Kích hoạt từ round 2 trở đi (đã có thời gian khám phá)
        // VÀ không đang trong error mode
        return context.currentRound >= 2 && !context.hasError;
    },

    getPromptFragment(): string {
        return `
### Quy tắc viết code TypeScript trong dự án này

**Module system & Imports:**
- ESM modules (import/export), KHÔNG dùng CommonJS (require)
- Import paths PHẢI có đuôi \`.js\`: \`import { foo } from "./bar.js"\`
- Dùng \`import type { X }\` cho type-only imports
- Named exports only, KHÔNG dùng default export

**TypeScript patterns:**
- Strict mode — khai báo types/interfaces rõ ràng
- Dùng \`type\` cho union/intersection types, \`interface\` cho object shapes
- Error handling: try/catch với type guard \`error instanceof Error\`
- Graceful degradation: catch errors → log warning → tiếp tục (không crash workflow)

**Project-specific patterns:**
- Logger: \`import { logger } from "../../utils/logger.js"\`
- Config: \`import { config } from "../../config/env.js"\`
- File naming: kebab-case (\`tracking-helper.ts\`, \`codebase-tools.ts\`)
- Thư mục sandbox: code PHẢI nằm trong \`src/\` hoặc \`frontend/\`

**Lưu ý write_file:**
- TUYỆT ĐỐI KHÔNG in code ra dạng markdown text. Mọi code PHẢI ghi qua tool \`write_file\`
- Ghi TOÀN BỘ nội dung file (không partial update) — tool sẽ overwrite
- Tạo thư mục tự động nếu chưa tồn tại
`.trim();
    },

    requiredTools: ["write_file"],
};
