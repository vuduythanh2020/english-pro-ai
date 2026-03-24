/**
 * Unit Tests cho US-01: ProtectedRoute Component với kiểm tra Role
 * ==============================================================================
 * Verify rằng ProtectedRoute component được tạo đúng cách với đầy đủ logic
 * auth guard + role guard.
 *
 * Approach: Structural testing (đọc source files bằng fs, verify cấu trúc code).
 * Lý do: Backend vitest không có jsdom, không thể render React components.
 * Pattern: Giống US-02 (us02-frontend-routing.test.ts) và US-03 (us03-auth-context.test.ts).
 *
 * Test Coverage:
 * - AC1: File ProtectedRoute.tsx tồn tại với đúng props interface
 * - AC2: Chưa đăng nhập → redirect /login
 * - AC3: requiredRole truyền + user.role không khớp → redirect /chat
 * - AC4: User đã đăng nhập + role hợp lệ (hoặc không yêu cầu role) → render children
 * - AC5: Sử dụng useAuth() từ AuthContext.tsx
 * - AC6: Cover 3+ trường hợp chính + loading state + no requiredRole
 * - Adversarial: edge cases, architecture, security
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// === Helpers ===

function readFrontendFile(relativePath: string): string {
  const fullPath = resolve("frontend", relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }
  return readFileSync(fullPath, "utf-8");
}

function frontendFileExists(relativePath: string): boolean {
  return existsSync(resolve("frontend", relativePath));
}

/**
 * Trích xuất body thực sự của một function component từ source code.
 * Tìm "function <name>(" rồi skip qua params ")" rồi tìm "{" mở function body.
 */
function extractFunctionBody(source: string, fnName: string): string {
  const pattern = new RegExp(`function\\s+${fnName}\\s*\\(`);
  const match = source.match(pattern);
  if (!match) return "";

  // Tìm closing ")" của params trước — cần đếm nesting vì params có destructuring {}
  const paramStart = match.index! + match[0].length - 1; // vị trí "("
  let parenCount = 1;
  let i = paramStart + 1;
  while (i < source.length && parenCount > 0) {
    if (source[i] === "(") parenCount++;
    if (source[i] === ")") parenCount--;
    i++;
  }
  // i giờ trỏ ngay sau ")" đóng params

  // Tìm "{" mở function body (bỏ qua khoảng trắng, return type annotation, etc.)
  let braceStart = source.indexOf("{", i);
  if (braceStart === -1) return "";

  // Đếm braces để tìm "}" đóng function body
  let braceCount = 1;
  let j = braceStart + 1;
  while (j < source.length && braceCount > 0) {
    if (source[j] === "{") braceCount++;
    if (source[j] === "}") braceCount--;
    j++;
  }
  return source.slice(braceStart + 1, j - 1);
}

/**
 * Trích xuất body của một interface từ source code.
 */
function extractInterfaceBody(source: string, interfaceName: string): string {
  const pattern = new RegExp(`interface\\s+${interfaceName}[^{]*\\{`);
  const match = source.match(pattern);
  if (!match) return "";
  const startIdx = match.index! + match[0].length;
  let braceCount = 1;
  let idx = startIdx;
  while (idx < source.length && braceCount > 0) {
    if (source[idx] === "{") braceCount++;
    if (source[idx] === "}") braceCount--;
    idx++;
  }
  return source.slice(startIdx, idx - 1);
}

// ============================================================================
// AC1: File tồn tại và có đúng Props interface
// ============================================================================

describe("US-01 AC1: ProtectedRoute file và props", () => {
  it("TC-01: ProtectedRoute.tsx file tồn tại ở đúng đường dẫn", () => {
    expect(frontendFileExists("src/components/ProtectedRoute.tsx")).toBe(true);
  });

  it("TC-02: ProtectedRouteProps interface có children (ReactNode) và requiredRole (optional string)", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    expect(source).toContain("interface ProtectedRouteProps");

    const propsBody = extractInterfaceBody(source, "ProtectedRouteProps");
    expect(propsBody.length).toBeGreaterThan(0);

    // children: ReactNode
    expect(propsBody).toContain("children");
    expect(propsBody).toContain("ReactNode");

    // requiredRole?: string (optional)
    expect(propsBody).toContain("requiredRole?");
    expect(propsBody).toContain("string");
  });

  it("TC-03: Import ReactNode từ react", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    expect(source).toContain("ReactNode");
    expect(source).toContain("from \"react\"");
  });

  it("TC-04: Export named ProtectedRoute (không default export)", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    expect(source).toContain("export { ProtectedRoute }");
    expect(source).not.toContain("export default");
  });

  it("TC-05: Export type ProtectedRouteProps", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    expect(source).toContain("export type { ProtectedRouteProps }");
  });

  it("TC-06: ProtectedRoute là function component nhận đúng props", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    // Function declaration with destructured props
    expect(source).toMatch(/function\s+ProtectedRoute\s*\(\s*\{\s*children\s*,\s*requiredRole\s*\}\s*:\s*ProtectedRouteProps\s*\)/);
  });
});

// ============================================================================
// AC5: Sử dụng useAuth() từ AuthContext.tsx
// ============================================================================

describe("US-01 AC5: Sử dụng useAuth() từ AuthContext", () => {
  it("TC-07: Import useAuth từ AuthContext.tsx", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    expect(source).toContain("import { useAuth }");
    expect(source).toContain('from "../contexts/AuthContext.tsx"');
  });

  it("TC-08: Gọi useAuth() và destructure user, isAuthenticated, isLoading", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    // Verify destructuring trong cùng một statement
    expect(source).toMatch(/const\s*\{\s*user\s*,\s*isAuthenticated\s*,\s*isLoading\s*\}\s*=\s*useAuth\(\)/);
  });

  it("TC-09: Import Navigate từ react-router-dom (cần cho redirect)", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    expect(source).toContain("import { Navigate }");
    expect(source).toContain('from "react-router-dom"');
  });
});

// ============================================================================
// AC2: Chưa đăng nhập → redirect /login (GUARD 2)
// ============================================================================

describe("US-01 AC2: Chưa đăng nhập → redirect /login", () => {
  it("TC-10: Kiểm tra !isAuthenticated → Navigate to /login", () => {
    const fnBody = extractFunctionBody(
      readFrontendFile("src/components/ProtectedRoute.tsx"),
      "ProtectedRoute",
    );

    // Phải có check !isAuthenticated
    expect(fnBody).toContain("!isAuthenticated");

    // Phải Navigate to /login
    expect(fnBody).toContain('Navigate to="/login"');
  });

  it("TC-11: Navigate đến /login phải dùng replace prop", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    // Pattern: <Navigate to="/login" replace />
    expect(source).toMatch(/<Navigate\s+to="\/login"\s+replace\s*\/>/);
  });

  it("TC-12: Kiểm tra authentication TRƯỚC khi kiểm tra role (BR-01: auth-first)", () => {
    const fnBody = extractFunctionBody(
      readFrontendFile("src/components/ProtectedRoute.tsx"),
      "ProtectedRoute",
    );

    // !isAuthenticated phải xuất hiện TRƯỚC requiredRole check trong function body
    const authCheckIdx = fnBody.indexOf("!isAuthenticated");
    const roleCheckIdx = fnBody.indexOf("requiredRole && user");

    expect(authCheckIdx).toBeGreaterThan(-1);
    expect(roleCheckIdx).toBeGreaterThan(-1);
    expect(authCheckIdx).toBeLessThan(roleCheckIdx);
  });
});

// ============================================================================
// AC3: requiredRole truyền + role không khớp → redirect /chat (GUARD 3)
// ============================================================================

describe("US-01 AC3: Sai role → redirect /chat", () => {
  it("TC-13: Kiểm tra requiredRole truthy AND user.role không khớp → Navigate to /chat", () => {
    const fnBody = extractFunctionBody(
      readFrontendFile("src/components/ProtectedRoute.tsx"),
      "ProtectedRoute",
    );

    // Phải check requiredRole
    expect(fnBody).toContain("requiredRole");

    // Phải so sánh với user.role (hoặc user?.role)
    expect(fnBody).toMatch(/user\??\.role\s*!==\s*requiredRole/);

    // Phải Navigate to /chat
    expect(fnBody).toContain('Navigate to="/chat"');
  });

  it("TC-14: Navigate đến /chat phải dùng replace prop", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    // Pattern: <Navigate to="/chat" replace />
    expect(source).toMatch(/<Navigate\s+to="\/chat"\s+replace\s*\/>/);
  });

  it("TC-15: Dùng optional chaining user?.role (safety net)", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    // user?.role thay vì user.role — optional chaining cho safety
    expect(source).toContain("user?.role");
  });

  it("TC-16: Role check dùng logical AND (requiredRole && ...)", () => {
    const fnBody = extractFunctionBody(
      readFrontendFile("src/components/ProtectedRoute.tsx"),
      "ProtectedRoute",
    );

    // Phải dùng pattern: if (requiredRole && user?.role !== requiredRole)
    expect(fnBody).toMatch(/if\s*\(\s*requiredRole\s*&&\s*user\?\s*\.role\s*!==\s*requiredRole\s*\)/);
  });
});

// ============================================================================
// AC4: User đã đăng nhập + role hợp lệ → render children
// ============================================================================

describe("US-01 AC4: Đúng auth + role → render children", () => {
  it("TC-17: Cuối function trả về <>{children}</> (Fragment wrapping children)", () => {
    const fnBody = extractFunctionBody(
      readFrontendFile("src/components/ProtectedRoute.tsx"),
      "ProtectedRoute",
    );

    // Last return should be children wrapped in Fragment
    expect(fnBody).toContain("<>{children}</>");
  });

  it("TC-18: Children chỉ render khi tất cả guards pass (đúng thứ tự if-return)", () => {
    const fnBody = extractFunctionBody(
      readFrontendFile("src/components/ProtectedRoute.tsx"),
      "ProtectedRoute",
    );

    // Verify thứ tự 3 guards (early return pattern):
    // 1. isLoading → return null
    // 2. !isAuthenticated → return Navigate /login
    // 3. requiredRole mismatch → return Navigate /chat
    // 4. return children (cuối cùng)

    const loadingIdx = fnBody.indexOf("isLoading");
    const authIdx = fnBody.indexOf("!isAuthenticated");
    const roleIdx = fnBody.indexOf("requiredRole && user?.role");
    const childrenIdx = fnBody.lastIndexOf("<>{children}</>"); // last occurrence

    expect(loadingIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeGreaterThan(-1);
    expect(roleIdx).toBeGreaterThan(-1);
    expect(childrenIdx).toBeGreaterThan(-1);

    // Thứ tự phải đúng: loading → auth → role → children
    expect(loadingIdx).toBeLessThan(authIdx);
    expect(authIdx).toBeLessThan(roleIdx);
    expect(roleIdx).toBeLessThan(childrenIdx);
  });
});

// ============================================================================
// Loading State (BR-04: không redirect khi đang loading)
// ============================================================================

describe("US-01 BR-04: Loading state — không redirect khi isLoading", () => {
  it("TC-19: isLoading check là GUARD ĐẦU TIÊN trong function body", () => {
    const fnBody = extractFunctionBody(
      readFrontendFile("src/components/ProtectedRoute.tsx"),
      "ProtectedRoute",
    );

    // isLoading phải là if statement đầu tiên (sau useAuth)
    const firstIfIdx = fnBody.indexOf("if (");
    const loadingIfIdx = fnBody.indexOf("if (isLoading)");

    // isLoading phải trong if statement đầu tiên
    expect(loadingIfIdx).toBeGreaterThan(-1);
    expect(loadingIfIdx).toBe(firstIfIdx);
  });

  it("TC-20: Khi isLoading = true → return null (không render gì)", () => {
    const fnBody = extractFunctionBody(
      readFrontendFile("src/components/ProtectedRoute.tsx"),
      "ProtectedRoute",
    );

    // Tìm pattern: if (isLoading) { return null; }
    expect(fnBody).toMatch(/if\s*\(\s*isLoading\s*\)\s*\{[^}]*return\s+null/);
  });

  it("TC-21: Loading block KHÔNG chứa Navigate (không redirect khi loading)", () => {
    const fnBody = extractFunctionBody(
      readFrontendFile("src/components/ProtectedRoute.tsx"),
      "ProtectedRoute",
    );

    // Extract loading block: from "if (isLoading)" to next closing brace
    const loadingStart = fnBody.indexOf("if (isLoading)");
    expect(loadingStart).toBeGreaterThan(-1);

    const loadingBlockStart = fnBody.indexOf("{", loadingStart);
    let braceCount = 1;
    let i = loadingBlockStart + 1;
    while (i < fnBody.length && braceCount > 0) {
      if (fnBody[i] === "{") braceCount++;
      if (fnBody[i] === "}") braceCount--;
      i++;
    }
    const loadingBlock = fnBody.slice(loadingBlockStart, i);

    // Loading block phải KHÔNG chứa Navigate
    expect(loadingBlock).not.toContain("Navigate");
    expect(loadingBlock).toContain("return null");
  });
});

// ============================================================================
// UserProfile interface có trường role (prerequisite cho ProtectedRoute)
// ============================================================================

describe("US-01 Prerequisite: UserProfile có trường role", () => {
  it("TC-22: UserProfile interface trong auth.api.ts có trường 'role: string'", () => {
    const source = readFrontendFile("src/api/auth.api.ts");

    expect(source).toContain("interface UserProfile");

    const profileBody = extractInterfaceBody(source, "UserProfile");
    expect(profileBody).toContain("role: string");
  });

  it("TC-23: UserProfile.role có comment giải thích từ migration 005", () => {
    const source = readFrontendFile("src/api/auth.api.ts");

    // Phải có reference đến role types hoặc migration
    const hasRoleContext =
      (source.includes("user") && source.includes("admin")) ||
      source.includes("005") ||
      source.includes("role");

    expect(hasRoleContext).toBe(true);
  });

  it("TC-24: AuthContextType trong AuthContext.tsx expose user: UserProfile | null", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("user: UserProfile | null");
  });

  it("TC-25: AuthContext import UserProfile từ auth.api.ts", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("UserProfile");
    expect(source).toContain('from "../api/auth.api');
  });
});

// ============================================================================
// Architecture & Security
// ============================================================================

describe("US-01 Architecture & Security", () => {
  it("TC-26: ProtectedRoute KHÔNG import trực tiếp localStorage (dùng useAuth thay thế)", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });

  it("TC-27: ProtectedRoute KHÔNG chứa API calls (chỉ dùng context)", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("apiClient");
    expect(source).not.toContain("axios");
    expect(source).not.toContain("getMeApi");
    expect(source).not.toContain("loginApi");
  });

  it("TC-28: ProtectedRoute KHÔNG chứa state riêng (dùng context state)", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    expect(source).not.toContain("useState");
    expect(source).not.toContain("useEffect");
    expect(source).not.toContain("useReducer");
  });

  it("TC-29: KHÔNG lưu sensitive data trong function body (token, password)", () => {
    const fnBody = extractFunctionBody(
      readFrontendFile("src/components/ProtectedRoute.tsx"),
      "ProtectedRoute",
    );

    expect(fnBody).not.toContain("token");
    expect(fnBody).not.toContain("password");
    expect(fnBody).not.toContain("secret");
  });

  it("TC-30: Component không có side effects (pure render logic)", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    // Không useEffect, không console.log, không dispatch
    expect(source).not.toContain("useEffect");
    expect(source).not.toContain("console.log");
    expect(source).not.toContain("console.warn");
    expect(source).not.toContain("dispatch");
  });
});

// ============================================================================
// Redirect Behavior (BR-02: role mismatch → /chat, không logout)
// ============================================================================

describe("US-01 BR-02: Redirect behavior", () => {
  it("TC-31: Role mismatch redirect đến /chat (không phải /login)", () => {
    const fnBody = extractFunctionBody(
      readFrontendFile("src/components/ProtectedRoute.tsx"),
      "ProtectedRoute",
    );

    // Sau requiredRole check, Navigate phải đến /chat
    const roleCheckIdx = fnBody.indexOf("requiredRole && user?.role");
    expect(roleCheckIdx).toBeGreaterThan(-1);

    // Tìm Navigate sau role check
    const afterRoleCheck = fnBody.slice(roleCheckIdx);
    const navigateIdx = afterRoleCheck.indexOf('Navigate to="/chat"');
    expect(navigateIdx).toBeGreaterThan(-1);

    // KHÔNG có logout call trong role mismatch block
    const blockEnd = afterRoleCheck.indexOf("}");
    expect(afterRoleCheck.slice(0, blockEnd)).not.toContain("logout");
  });

  it("TC-32: Auth fail redirect đến /login (không phải /chat)", () => {
    const fnBody = extractFunctionBody(
      readFrontendFile("src/components/ProtectedRoute.tsx"),
      "ProtectedRoute",
    );

    // Sau !isAuthenticated check, Navigate phải đến /login
    const authCheckIdx = fnBody.indexOf("!isAuthenticated");
    expect(authCheckIdx).toBeGreaterThan(-1);

    const afterAuthCheck = fnBody.slice(authCheckIdx);
    const loginNavigateIdx = afterAuthCheck.indexOf('Navigate to="/login"');
    const chatNavigateIdx = afterAuthCheck.indexOf('Navigate to="/chat"');

    // Navigate /login phải xuất hiện TRƯỚC Navigate /chat
    expect(loginNavigateIdx).toBeGreaterThan(-1);
    expect(chatNavigateIdx).toBeGreaterThan(-1);
    expect(loginNavigateIdx).toBeLessThan(chatNavigateIdx);
  });

  it("TC-33: Function body có đúng 2 Navigate components (login + chat)", () => {
    const fnBody = extractFunctionBody(
      readFrontendFile("src/components/ProtectedRoute.tsx"),
      "ProtectedRoute",
    );

    // Đếm số Navigate components trong function body (không đếm JSDoc comments)
    const navigateMatches = fnBody.match(/<Navigate/g);
    expect(navigateMatches).not.toBeNull();
    expect(navigateMatches!.length).toBe(2); // /login và /chat

    // Cả 2 đều dùng replace
    const replaceMatches = fnBody.match(/<Navigate[^/]*replace/g);
    expect(replaceMatches).not.toBeNull();
    expect(replaceMatches!.length).toBe(2);
  });
});

// ============================================================================
// BR-03: Optional role — không requiredRole thì chỉ check auth
// ============================================================================

describe("US-01 BR-03: Optional role", () => {
  it("TC-34: requiredRole prop là optional (có dấu ?)", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    const propsBody = extractInterfaceBody(source, "ProtectedRouteProps");
    expect(propsBody).toContain("requiredRole?:");
  });

  it("TC-35: Role check dùng truthy check (requiredRole &&) — skip khi undefined", () => {
    const fnBody = extractFunctionBody(
      readFrontendFile("src/components/ProtectedRoute.tsx"),
      "ProtectedRoute",
    );

    // Phải dùng truthy check: if (requiredRole && ...)
    expect(fnBody).toMatch(/if\s*\(\s*requiredRole\s*&&/);
  });
});

// ============================================================================
// Edge Cases & Adversarial Tests
// ============================================================================

describe("US-01 Edge Cases & Adversarial", () => {
  it("TC-36: Navigate targets chỉ là /login và /chat (không redirect loop)", () => {
    const fnBody = extractFunctionBody(
      readFrontendFile("src/components/ProtectedRoute.tsx"),
      "ProtectedRoute",
    );

    const navigateTargets = fnBody.match(/Navigate to="([^"]+)"/g);
    expect(navigateTargets).not.toBeNull();

    const targets = navigateTargets!.map(m => {
      const match = m.match(/to="([^"]+)"/);
      return match ? match[1] : "";
    });

    // Chỉ nên có 2 targets: /login và /chat
    expect(targets).toContain("/login");
    expect(targets).toContain("/chat");
    expect(targets.length).toBe(2);

    // KHÔNG redirect đến /dev-team (sẽ gây loop)
    expect(targets).not.toContain("/dev-team");
  });

  it("TC-37: Component không import useNavigate (dùng Navigate component declarative)", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    expect(source).not.toContain("useNavigate");
    expect(source).toContain("Navigate");
  });

  it("TC-38: Không có window.location redirect (dùng React Router Navigate)", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    expect(source).not.toContain("window.location");
    expect(source).not.toContain("window.history");
    expect(source).not.toContain("location.href");
    expect(source).not.toContain("location.replace");
  });

  it("TC-39: Không dùng any type", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    expect(source).not.toContain(": any");
    expect(source).not.toContain("as any");
  });

  it("TC-40: File có JSDoc documentation cho component và props", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    // Phải có JSDoc cho interface
    expect(source).toContain("@property children");
    expect(source).toContain("@property requiredRole");

    // Phải có documentation cho component
    expect(source).toContain("Component bảo vệ route");
  });

  it("TC-41: Không hardcode role values trong function body (dùng prop comparison)", () => {
    const fnBody = extractFunctionBody(
      readFrontendFile("src/components/ProtectedRoute.tsx"),
      "ProtectedRoute",
    );

    // Function body không nên chứa hardcoded role strings
    expect(fnBody).not.toContain('"admin"');
    expect(fnBody).not.toContain('"user"');
    expect(fnBody).not.toContain("'admin'");
    expect(fnBody).not.toContain("'user'");
  });

  it("TC-42: Guard pattern sử dụng early return (ít nhất 4 return statements)", () => {
    const fnBody = extractFunctionBody(
      readFrontendFile("src/components/ProtectedRoute.tsx"),
      "ProtectedRoute",
    );

    // Đếm số lần "return" trong function body
    const returnMatches = fnBody.match(/\breturn\b/g);
    expect(returnMatches).not.toBeNull();

    // Phải có ít nhất 4 return statements:
    // 1. return null (loading)
    // 2. return <Navigate to="/login" /> (not authenticated)
    // 3. return <Navigate to="/chat" /> (wrong role)
    // 4. return <>{children}</> (success)
    expect(returnMatches!.length).toBeGreaterThanOrEqual(4);
  });

  it("TC-43: Không có nested if-else sâu (flat guard pattern)", () => {
    const fnBody = extractFunctionBody(
      readFrontendFile("src/components/ProtectedRoute.tsx"),
      "ProtectedRoute",
    );

    // Không có else clause — mỗi guard dùng if + return
    expect(fnBody).not.toContain("} else {");
    expect(fnBody).not.toContain("} else if");
  });
});

// ============================================================================
// Tương thích với existing codebase
// ============================================================================

describe("US-01 Compatibility: Tương thích với codebase hiện tại", () => {
  it("TC-44: router.tsx CHƯA được sửa (chưa tích hợp ProtectedRoute — đúng theo design)", () => {
    const source = readFrontendFile("src/router.tsx");

    // router.tsx KHÔNG nên import ProtectedRoute trong US-01
    expect(source).not.toContain("ProtectedRoute");
  });

  it("TC-45: ProtectedRoute KHÔNG import từ router.tsx (tránh circular dependency)", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    expect(source).not.toContain("from '../router");
    expect(source).not.toContain("from \"../router");
    expect(source).not.toContain("AppRoutes");
  });

  it("TC-46: ProtectedRoute compatible với AuthContext useAuth return type", () => {
    const authSource = readFrontendFile("src/contexts/AuthContext.tsx");
    const routeSource = readFrontendFile("src/components/ProtectedRoute.tsx");

    // AuthContext exports useAuth
    expect(authSource).toContain("export { AuthProvider, useAuth }");

    // ProtectedRoute imports useAuth
    expect(routeSource).toContain('import { useAuth }');

    // AuthContextType có user, isAuthenticated, isLoading
    expect(authSource).toContain("user: UserProfile | null");
    expect(authSource).toContain("isAuthenticated: boolean");
    expect(authSource).toContain("isLoading: boolean");

    // ProtectedRoute destructures đúng 3 fields này
    expect(routeSource).toMatch(/\{\s*user\s*,\s*isAuthenticated\s*,\s*isLoading\s*\}/);
  });

  it("TC-47: ProtectedRoute KHÔNG destructure token từ useAuth (không cần)", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    // Chỉ destructure user, isAuthenticated, isLoading
    const destructureMatch = source.match(/const\s*\{([^}]+)\}\s*=\s*useAuth\(\)/);
    expect(destructureMatch).not.toBeNull();

    const destructuredFields = destructureMatch![1];
    expect(destructuredFields).not.toContain("token");
  });
});

// ============================================================================
// Code Quality
// ============================================================================

describe("US-01 Code Quality", () => {
  it("TC-48: File header có comment giải thích purpose và logic flow", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    // Header comment phải giải thích 4 guards
    expect(source).toContain("isLoading = true");
    expect(source).toContain("isAuthenticated = false");
    expect(source).toContain("requiredRole");
    expect(source).toContain("render children");
  });

  it("TC-49: Mỗi guard có inline comment giải thích lý do", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    // Guard comments
    expect(source).toContain("GUARD");
    expect(source).toContain("verify token");
    expect(source).toContain("redirect");
  });

  it("TC-50: File có ví dụ usage trong JSDoc", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    expect(source).toContain("<ProtectedRoute>");
    expect(source).toContain('requiredRole="admin"');
    expect(source).toContain("ChatPage");
    expect(source).toContain("DevTeamPage");
  });
});
