/**
 * Skill: Verify and Submit
 * ============================================================================
 * Hướng dẫn agent verify code bằng tsc/build trước khi submit_feature.
 *
 * Shared: Dev + Tester (format report khác nhau dựa trên role)
 * Kích hoạt: Khi đã write file (hasWrittenFiles) VÀ không có lỗi VÀ round >= 3
 */

import type { AgentSkill, SkillSelectionContext } from "./types.js";

export const verifySubmitSkill: AgentSkill = {
    name: "verify-submit",
    description:
        "Quy trình verify code (tsc --noEmit) và submit_feature với report format chuẩn.",
    applicableRoles: ["dev", "tester"],
    priority: 90, // Gần cuối — chỉ khi đã viết xong

    shouldActivate(context: SkillSelectionContext): boolean {
        // Kích hoạt khi đã viết file VÀ không đang trong error mode
        // VÀ đã qua giai đoạn explore (round >= 3)
        return context.hasWrittenFiles && !context.hasError && context.currentRound >= 3;
    },

    getPromptFragment(context?: SkillSelectionContext): string {
        const role = context?.agentRole ?? "dev";

        const baseVerify = `
### Quy trình Verify & Submit (BẮT BUỘC trước khi submit)

**Bước 1: Type-check**
- Chạy \`tsc --noEmit\` qua \`execute_command\`
- Nếu có lỗi ở file bạn đã viết → SỬA NGAY (xem skill error-fix-loop)
- Nếu lỗi chỉ ở file pre-existing → ghi nhận vào report

**Bước 2: Submit**
- Khi verify pass → gọi \`submit_feature\` với report chi tiết
- Report PHẢI bằng tiếng Việt
- Liệt kê TẤT CẢ file đã tạo/sửa
- Giải thích các quyết định kỹ thuật quan trọng
`.trim();

        if (role === "dev") {
            return `${baseVerify}

**Format report cho Dev:**
- Danh sách file đã tạo/sửa với mô tả ngắn
- Giải thích kiến trúc/patterns đã dùng
- Ghi chú về pre-existing errors nếu có
- KHÔNG cần viết unit test (việc đó của Tester)`;
        }

        // Tester format
        return `${baseVerify}

**Format report cho Tester:**

| Check | Command | Result | Details |
|-------|---------|--------|---------|
| Type Safety | tsc --noEmit | ✅/❌ | X errors |
| Build | npm run build | ✅/❌ | Compile success/fail |
| Unit Tests | npm test | ✅/❌ | X passed, Y failed |

### Kết luận
- ✅ PASS - Tất cả checks pass
- ⚠️ PASS WITH CONDITIONS - Minor issues
- ❌ FAIL - Có bugs, xem Bug Report`;
    },

    requiredTools: ["execute_command", "submit_feature"],
};
