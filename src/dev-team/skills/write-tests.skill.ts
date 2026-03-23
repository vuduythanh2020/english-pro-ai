/**
 * Skill: Write Tests
 * ============================================================================
 * Hướng dẫn Tester Agent viết unit tests đúng cách.
 * Bao gồm conventions, patterns, và quy trình verify test file.
 *
 * Tester only
 * Kích hoạt: Khi round >= 2 (đã đọc source code) VÀ chưa viết test file
 */

import type { AgentSkill, SkillSelectionContext } from "./types.js";

export const writeTestsSkill: AgentSkill = {
    name: "write-tests",
    description:
        "Hướng dẫn viết unit tests: conventions, patterns, verify syntax trước khi chạy npm test.",
    applicableRoles: ["tester"],
    priority: 25, // Sau explore-codebase (10), trước verify-submit (90)

    shouldActivate(context: SkillSelectionContext): boolean {
        // Kích hoạt khi đã qua giai đoạn explore VÀ không đang fix lỗi
        return context.currentRound >= 2 && !context.hasError;
    },

    getPromptFragment(): string {
        return `
### Quy trình viết Unit Tests (BẮT BUỘC)

**THÔNG TIN CỐ ĐỊNH (KHÔNG CẦN TÌM KIẾM):**
- Test runner: **vitest** (devDependency)
- Lệnh chạy test: \`npm test\` (tương đương \`vitest run\`)
- Test file pattern: \`*.test.ts\` trong thư mục \`src/\`
- Module system: ESM (import/export)

**Guidelines viết test ĐÚNG CÁCH:**

1. **LUÔN đọc source code TRƯỚC** — Dùng \`read_project_file\` để đọc function body
   TRƯỚC KHI viết test. KHÔNG BAO GIỜ đoán return type hay behavior.

2. **Kiểm tra return type chính xác** — Nếu hàm trả \`undefined\` khi không tìm thấy,
   dùng \`toBeUndefined()\`, KHÔNG dùng \`toBeNull()\`.

3. **Mock đúng module path** — ESM imports dùng \`.js\` extension.
   Mock phải khớp đúng module path mà source code import.

4. **Viết test đơn giản trước** — Bắt đầu happy path test, rồi mới adversarial.

5. **Import paths** — Dùng relative paths với \`.js\`: \`import { fn } from "./module.js"\`

6. **KHÔNG dùng TypeScript-only syntax trong runtime** — \`const { type X } = ...\` là INVALID.

**Quy trình BẮT BUỘC:**
1. Đọc source code bằng \`read_project_file\`
2. Viết test file bằng \`write_file\` (đặt cùng thư mục, đuôi \`.test.ts\`)
3. Chạy \`tsc --noEmit\` để verify test syntax TRƯỚC
4. Nếu tsc lỗi → đọc lại test file → sửa → verify lại
5. CHỈ KHI tsc pass → mới chạy \`npm test\`

⚠️ TUYỆT ĐỐI KHÔNG chạy \`npm test\` TRƯỚC KHI viết test files và verify syntax.
`.trim();
    },

    requiredTools: [
        "read_project_file",
        "write_file",
        "execute_command",
    ],
};
