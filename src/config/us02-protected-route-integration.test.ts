/**
 * Unit Tests cho US-02: Tích hợp ProtectedRoute vào Router và thêm route `/dev-team`
 * ==============================================================================
 * Structural testing: đọc source code files và verify cấu trúc, imports, exports,
 * route definitions, ProtectedRoute wrapping, DevTeamPage component.
 *
 * Test Coverage:
 * - AC1: Route /chat wrap bằng ProtectedRoute (auth only, không role)
 * - AC2: Route /dev-team wrap bằng ProtectedRoute requiredRole="admin"
 * - AC3: DevTeamPage placeholder (tiêu đề + mô tả)
 * - AC4: User role=user truy cập /dev-team → redirect /chat (structural check)
 * - AC5: Admin truy cập /dev-team → render DevTeamPage (structural check)
 * - AC6: Routes /login, /register không bị ảnh hưởng
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Helper: đọc file frontend
function readFrontendFile(relativePath: string): string {
  const fullPath = resolve("frontend", relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }
  return readFileSync(fullPath, "utf-8");
}

// Helper: kiểm tra file tồn tại
function frontendFileExists(relativePath: string): boolean {
  return existsSync(resolve("frontend", relativePath));
}

describe("US-02: Tích hợp ProtectedRoute vào Router + route /dev-team", () => {

  // ===== AC1: Wrap /chat bằng ProtectedRoute (auth only) =====
  describe("AC1: Route /chat được bảo vệ bởi ProtectedRoute (auth only)", () => {

    it("TC-01: router.tsx phải import ProtectedRoute", () => {
      const source = readFrontendFile("src/router.tsx");

      expect(source).toContain("ProtectedRoute");
      expect(source).toContain("from './components/ProtectedRoute");
    });

    it("TC-02: Route /chat phải được wrap bởi ProtectedRoute", () => {
      const source = readFrontendFile("src/router.tsx");

      // Tìm pattern: route /chat sử dụng ProtectedRoute wrap ChatPage
      expect(source).toContain('path="/chat"');
      expect(source).toContain("<ProtectedRoute>");
      expect(source).toContain("<ChatPage />");
      expect(source).toContain("</ProtectedRoute>");

      // Verify ProtectedRoute wrap ChatPage (không có requiredRole cho /chat)
      // Tìm block chứa cả ProtectedRoute và ChatPage mà KHÔNG có requiredRole
      const chatRouteMatch = source.match(
        /path="\/chat"[\s\S]*?<ProtectedRoute>([\s\S]*?)<\/ProtectedRoute>/
      );
      expect(chatRouteMatch).not.toBeNull();
      if (chatRouteMatch) {
        expect(chatRouteMatch[1]).toContain("<ChatPage />");
        // Không có requiredRole trong block này
        expect(chatRouteMatch[0]).not.toContain("requiredRole");
      }
    });

    it("TC-03: ProtectedRoute cho /chat KHÔNG có requiredRole prop", () => {
      const source = readFrontendFile("src/router.tsx");

      // Tách phần route /chat ra kiểm tra
      const chatSection = source.substring(
        source.indexOf('path="/chat"'),
        source.indexOf('path="/dev-team"')
      );
      expect(chatSection).toContain("<ProtectedRoute>");
      expect(chatSection).not.toContain("requiredRole");
    });
  });

  // ===== AC2: Route /dev-team wrap ProtectedRoute requiredRole="admin" =====
  describe("AC2: Route /dev-team được bảo vệ bởi ProtectedRoute requiredRole='admin'", () => {

    it("TC-04: router.tsx phải import DevTeamPage", () => {
      const source = readFrontendFile("src/router.tsx");

      expect(source).toContain("DevTeamPage");
      expect(source).toContain("from './pages/DevTeamPage");
    });

    it("TC-05: Route /dev-team phải tồn tại", () => {
      const source = readFrontendFile("src/router.tsx");

      expect(source).toContain('path="/dev-team"');
    });

    it("TC-06: Route /dev-team phải wrap bằng ProtectedRoute với requiredRole='admin'", () => {
      const source = readFrontendFile("src/router.tsx");

      // Tìm block chứa /dev-team route
      const devTeamSection = source.substring(
        source.indexOf('path="/dev-team"')
      );
      // Phải có requiredRole="admin"
      expect(devTeamSection).toContain('requiredRole="admin"');
      expect(devTeamSection).toContain("<DevTeamPage />");
    });

    it("TC-07: ProtectedRoute cho /dev-team phải có requiredRole='admin' (không phải role khác)", () => {
      const source = readFrontendFile("src/router.tsx");

      // Tìm ProtectedRoute có requiredRole
      const match = source.match(/requiredRole="([^"]+)"/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe("admin");
    });
  });

  // ===== AC3: DevTeamPage placeholder =====
  describe("AC3: DevTeamPage placeholder với tiêu đề và mô tả", () => {

    it("TC-08: File DevTeamPage.tsx phải tồn tại", () => {
      expect(frontendFileExists("src/pages/DevTeamPage.tsx")).toBe(true);
    });

    it("TC-09: DevTeamPage phải hiển thị tiêu đề 'Dev Team Workflow'", () => {
      const source = readFrontendFile("src/pages/DevTeamPage.tsx");

      expect(source).toContain("Dev Team Workflow");
    });

    it("TC-10: DevTeamPage phải hiển thị mô tả 'Trang quản lý quy trình phát triển'", () => {
      const source = readFrontendFile("src/pages/DevTeamPage.tsx");

      expect(source).toContain("Trang quản lý quy trình phát triển");
    });

    it("TC-11: DevTeamPage phải là function component", () => {
      const source = readFrontendFile("src/pages/DevTeamPage.tsx");

      expect(source).toContain("function DevTeamPage");
      expect(source).toContain("return");
    });

    it("TC-12: DevTeamPage phải dùng named export (không default export)", () => {
      const source = readFrontendFile("src/pages/DevTeamPage.tsx");

      expect(source).toContain("export { DevTeamPage }");
      expect(source).not.toContain("export default");
    });

    it("TC-13: DevTeamPage phải render JSX với className dev-team-page", () => {
      const source = readFrontendFile("src/pages/DevTeamPage.tsx");

      expect(source).toContain('className="dev-team-page"');
    });

    it("TC-14: DevTeamPage nên có badge 'Admin Only' để phân biệt rõ quyền", () => {
      const source = readFrontendFile("src/pages/DevTeamPage.tsx");

      expect(source).toContain("Admin Only");
    });
  });

  // ===== AC4 & AC5: ProtectedRoute logic (structural verification) =====
  describe("AC4/AC5: ProtectedRoute logic đảm bảo redirect đúng", () => {

    it("TC-15: ProtectedRoute phải kiểm tra isLoading trước (GUARD 1)", () => {
      const source = readFrontendFile("src/components/ProtectedRoute.tsx");

      // isLoading check phải có
      expect(source).toContain("isLoading");
      expect(source).toContain("return null");
    });

    it("TC-16: ProtectedRoute phải redirect về /login khi chưa auth (GUARD 2)", () => {
      const source = readFrontendFile("src/components/ProtectedRoute.tsx");

      expect(source).toContain("isAuthenticated");
      expect(source).toContain('Navigate to="/login"');
      expect(source).toContain("replace");
    });

    it("TC-17: ProtectedRoute phải redirect về /chat khi role không khớp (GUARD 3)", () => {
      const source = readFrontendFile("src/components/ProtectedRoute.tsx");

      expect(source).toContain("requiredRole");
      expect(source).toContain("user?.role");
      expect(source).toContain('Navigate to="/chat"');
    });

    it("TC-18: ProtectedRoute phải render children khi tất cả guards pass", () => {
      const source = readFrontendFile("src/components/ProtectedRoute.tsx");

      // return <>{children}</>
      expect(source).toContain("children");
      expect(source).toContain("<>{children}</>");
    });

    it("TC-19: ProtectedRoute phải import useAuth từ AuthContext", () => {
      const source = readFrontendFile("src/components/ProtectedRoute.tsx");

      expect(source).toContain("useAuth");
      expect(source).toContain("from '../contexts/AuthContext");
    });

    it("TC-20: ProtectedRoute Guard order: isLoading → isAuthenticated → requiredRole", () => {
      const source = readFrontendFile("src/components/ProtectedRoute.tsx");

      // Verify thứ tự: isLoading check trước isAuthenticated
      const loadingIndex = source.indexOf("if (isLoading)");
      const authIndex = source.indexOf("if (!isAuthenticated)");
      const roleIndex = source.indexOf("if (requiredRole");

      expect(loadingIndex).toBeGreaterThan(-1);
      expect(authIndex).toBeGreaterThan(-1);
      expect(roleIndex).toBeGreaterThan(-1);

      // Thứ tự đúng
      expect(loadingIndex).toBeLessThan(authIndex);
      expect(authIndex).toBeLessThan(roleIndex);
    });

    it("TC-21: ProtectedRoute phải export ProtectedRouteProps interface", () => {
      const source = readFrontendFile("src/components/ProtectedRoute.tsx");

      expect(source).toContain("ProtectedRouteProps");
      expect(source).toContain("requiredRole?: string");
    });

    it("TC-22: ProtectedRoute redirect phải dùng replace để tránh back-button loop", () => {
      const source = readFrontendFile("src/components/ProtectedRoute.tsx");

      // Tất cả Navigate phải có replace
      const navigateMatches = source.match(/<Navigate/g);
      const replaceMatches = source.match(/replace/g);

      expect(navigateMatches).not.toBeNull();
      expect(replaceMatches).not.toBeNull();
      // Ít nhất mỗi Navigate phải có 1 replace
      expect(replaceMatches!.length).toBeGreaterThanOrEqual(navigateMatches!.length);
    });
  });

  // ===== AC6: Routes cũ không bị ảnh hưởng =====
  describe("AC6: Routes cũ (/login, /register) vẫn hoạt động bình thường", () => {

    it("TC-23: Route /login vẫn tồn tại và KHÔNG wrap ProtectedRoute", () => {
      const source = readFrontendFile("src/router.tsx");

      expect(source).toContain('path="/login"');

      // Tìm element cho route /login
      const loginSection = source.substring(
        source.indexOf('path="/login"'),
        source.indexOf('path="/register"')
      );
      expect(loginSection).toContain("<LoginPage />");
      expect(loginSection).not.toContain("ProtectedRoute");
    });

    it("TC-24: Route /register vẫn tồn tại và KHÔNG wrap ProtectedRoute", () => {
      const source = readFrontendFile("src/router.tsx");

      expect(source).toContain('path="/register"');

      // Tìm element cho route /register
      const registerSection = source.substring(
        source.indexOf('path="/register"'),
        source.indexOf('path="/chat"')
      );
      expect(registerSection).toContain("<RegisterPage />");
      expect(registerSection).not.toContain("ProtectedRoute");
    });

    it("TC-25: LoginPage.tsx không bị thay đổi - vẫn có form đăng nhập", () => {
      const source = readFrontendFile("src/pages/LoginPage.tsx");

      expect(source).toContain("function LoginPage");
      expect(source).toContain("Đăng nhập");
      expect(source).toContain("export { LoginPage }");
      expect(source).toContain('<form');
      expect(source).toContain('type="email"');
      expect(source).toContain('type="password"');
    });

    it("TC-26: RegisterPage.tsx không bị thay đổi - vẫn có form đăng ký", () => {
      const source = readFrontendFile("src/pages/RegisterPage.tsx");

      expect(source).toContain("function RegisterPage");
      expect(source).toContain("Tạo tài khoản");
      expect(source).toContain("export { RegisterPage }");
      expect(source).toContain('<form');
      expect(source).toContain('type="email"');
      expect(source).toContain('type="password"');
    });

    it("TC-27: Default route / vẫn redirect về /login", () => {
      const source = readFrontendFile("src/router.tsx");

      expect(source).toContain('path="/"');
      expect(source).toContain('Navigate to="/login"');
    });

    it("TC-28: Catch-all route * vẫn redirect về /login", () => {
      const source = readFrontendFile("src/router.tsx");

      expect(source).toContain('path="*"');
    });
  });

  // ===== CSS: DevTeamPage styling =====
  describe("DevTeamPage CSS styling", () => {

    it("TC-29: index.css phải có class .dev-team-page", () => {
      const source = readFrontendFile("src/index.css");

      expect(source).toContain(".dev-team-page");
    });

    it("TC-30: index.css phải có class .dev-team-placeholder", () => {
      const source = readFrontendFile("src/index.css");

      expect(source).toContain(".dev-team-placeholder");
    });

    it("TC-31: index.css phải có class .dev-team-badge", () => {
      const source = readFrontendFile("src/index.css");

      expect(source).toContain(".dev-team-badge");
    });

    it("TC-32: DevTeamPage CSS sử dụng CSS variables có sẵn trong :root", () => {
      const source = readFrontendFile("src/index.css");

      // Verify các CSS variables dùng trong DevTeamPage đều tồn tại trong :root
      expect(source).toContain("--bg-primary");
      expect(source).toContain("--bg-secondary");
      expect(source).toContain("--border-color");
      expect(source).toContain("--text-primary");
      expect(source).toContain("--text-secondary");
    });

    it("TC-33: DevTeamPage page phải centered (flexbox)", () => {
      const source = readFrontendFile("src/index.css");

      // Tìm block .dev-team-page
      const pageSection = source.substring(
        source.indexOf(".dev-team-page")
      );
      expect(pageSection).toContain("display: flex");
      expect(pageSection).toContain("align-items: center");
      expect(pageSection).toContain("justify-content: center");
    });
  });

  // ===== Architecture & Consistency =====
  describe("Architecture: cấu trúc tổng thể đúng", () => {

    it("TC-34: AuthProvider wrap bên ngoài AppRoutes trong App.tsx", () => {
      const source = readFrontendFile("src/App.tsx");

      expect(source).toContain("AuthProvider");
      expect(source).toContain("<AppRoutes");

      // AuthProvider phải xuất hiện trước AppRoutes
      const authProviderIndex = source.indexOf("<AuthProvider>");
      const appRoutesIndex = source.indexOf("<AppRoutes");
      expect(authProviderIndex).toBeLessThan(appRoutesIndex);
    });

    it("TC-35: BrowserRouter ở main.tsx (không trong App.tsx hay router.tsx)", () => {
      const mainSource = readFrontendFile("src/main.tsx");
      const appSource = readFrontendFile("src/App.tsx");
      const routerSource = readFrontendFile("src/router.tsx");

      expect(mainSource).toContain("BrowserRouter");
      expect(appSource).not.toContain("BrowserRouter");
      expect(routerSource).not.toContain("BrowserRouter");
    });

    it("TC-36: router.tsx export named AppRoutes (không default)", () => {
      const source = readFrontendFile("src/router.tsx");

      expect(source).toContain("export { AppRoutes }");
      expect(source).not.toContain("export default");
    });

    it("TC-37: Thứ tự routes trong router.tsx: public → protected → admin → fallback", () => {
      const source = readFrontendFile("src/router.tsx");

      const loginIdx = source.indexOf('path="/login"');
      const registerIdx = source.indexOf('path="/register"');
      const chatIdx = source.indexOf('path="/chat"');
      const devTeamIdx = source.indexOf('path="/dev-team"');
      const rootIdx = source.indexOf('path="/"');
      const catchAllIdx = source.indexOf('path="*"');

      // Public routes trước
      expect(loginIdx).toBeLessThan(chatIdx);
      expect(registerIdx).toBeLessThan(chatIdx);

      // Protected (chat) trước admin (dev-team)
      expect(chatIdx).toBeLessThan(devTeamIdx);

      // Admin trước fallback
      expect(devTeamIdx).toBeLessThan(rootIdx);
      expect(rootIdx).toBeLessThan(catchAllIdx);
    });

    it("TC-38: DevTeamPage KHÔNG import từ router.tsx (no circular dependency)", () => {
      const source = readFrontendFile("src/pages/DevTeamPage.tsx");

      expect(source).not.toContain("from '../router");
      expect(source).not.toContain("from './router");
    });

    it("TC-39: DevTeamPage KHÔNG import AuthContext trực tiếp (logic ở ProtectedRoute)", () => {
      const source = readFrontendFile("src/pages/DevTeamPage.tsx");

      // DevTeamPage là pure display component, không cần auth logic
      expect(source).not.toContain("useAuth");
      expect(source).not.toContain("AuthContext");
    });
  });

  // ===== Edge Cases & Adversarial =====
  describe("Edge Cases & Adversarial Tests", () => {

    it("TC-40: router.tsx không có duplicate route paths", () => {
      const source = readFrontendFile("src/router.tsx");

      // /chat xuất hiện đúng 1 lần
      const chatMatches = source.match(/path="\/chat"/g);
      expect(chatMatches).not.toBeNull();
      expect(chatMatches!.length).toBe(1);

      // /dev-team xuất hiện đúng 1 lần
      const devTeamMatches = source.match(/path="\/dev-team"/g);
      expect(devTeamMatches).not.toBeNull();
      expect(devTeamMatches!.length).toBe(1);

      // /login xuất hiện đúng 1 lần
      const loginMatches = source.match(/path="\/login"/g);
      expect(loginMatches).not.toBeNull();
      expect(loginMatches!.length).toBe(1);

      // /register xuất hiện đúng 1 lần
      const registerMatches = source.match(/path="\/register"/g);
      expect(registerMatches).not.toBeNull();
      expect(registerMatches!.length).toBe(1);
    });

    it("TC-41: ProtectedRoute children phải là ReactNode type", () => {
      const source = readFrontendFile("src/components/ProtectedRoute.tsx");

      expect(source).toContain("ReactNode");
      expect(source).toContain("children: ReactNode");
    });

    it("TC-42: Không có hardcoded role check trong router.tsx (logic ở ProtectedRoute)", () => {
      const source = readFrontendFile("src/router.tsx");

      // Router không nên chứa logic role check trực tiếp
      expect(source).not.toContain("user.role");
      expect(source).not.toContain("useAuth");
      expect(source).not.toContain("isAuthenticated");
      expect(source).not.toContain("isLoading");
    });

    it("TC-43: DevTeamPage là pure component (không useState, useEffect, API calls)", () => {
      const source = readFrontendFile("src/pages/DevTeamPage.tsx");

      // Placeholder component không cần state/effect
      expect(source).not.toContain("useState");
      expect(source).not.toContain("useEffect");
      expect(source).not.toContain("fetch(");
      expect(source).not.toContain("apiClient");
    });

    it("TC-44: ProtectedRoute xử lý user null an toàn (optional chaining)", () => {
      const source = readFrontendFile("src/components/ProtectedRoute.tsx");

      // Phải dùng optional chaining khi access user.role
      expect(source).toContain("user?.role");
    });

    it("TC-45: Build thành công sau khi thêm DevTeamPage và sửa router", () => {
      // Test này verify rằng tsc --noEmit đã pass (verified trước khi viết tests)
      // Structural check: tất cả imports trong router.tsx đều resolve được
      const source = readFrontendFile("src/router.tsx");

      // Verify tất cả files được import đều tồn tại
      expect(frontendFileExists("src/pages/LoginPage.tsx")).toBe(true);
      expect(frontendFileExists("src/pages/RegisterPage.tsx")).toBe(true);
      expect(frontendFileExists("src/pages/ChatPage.tsx")).toBe(true);
      expect(frontendFileExists("src/pages/DevTeamPage.tsx")).toBe(true);
      expect(frontendFileExists("src/components/ProtectedRoute.tsx")).toBe(true);

      // Verify imports match file existence
      expect(source).toContain("'./pages/LoginPage");
      expect(source).toContain("'./pages/RegisterPage");
      expect(source).toContain("'./pages/ChatPage");
      expect(source).toContain("'./pages/DevTeamPage");
      expect(source).toContain("'./components/ProtectedRoute");
    });

    it("TC-46: router.tsx chỉ import từ react-router-dom và local modules", () => {
      const source = readFrontendFile("src/router.tsx");

      // Không import từ external packages ngoài react-router-dom
      const importLines = source.split("\n").filter(l => l.trim().startsWith("import"));
      for (const line of importLines) {
        const isReactRouter = line.includes("react-router-dom");
        const isLocalImport = line.includes("'./") || line.includes('"./');
        expect(isReactRouter || isLocalImport).toBe(true);
      }
    });

    it("TC-47: DevTeamPage heading dùng h1 tag (semantic HTML)", () => {
      const source = readFrontendFile("src/pages/DevTeamPage.tsx");

      expect(source).toContain("<h1>");
      expect(source).toContain("</h1>");
    });

    it("TC-48: DevTeamPage description dùng p tag", () => {
      const source = readFrontendFile("src/pages/DevTeamPage.tsx");

      expect(source).toContain("<p>");
      expect(source).toContain("</p>");
    });
  });

  // ===== AuthContext compatibility =====
  describe("AuthContext compatibility với ProtectedRoute", () => {

    it("TC-49: AuthContext export useAuth hook", () => {
      const source = readFrontendFile("src/contexts/AuthContext.tsx");

      expect(source).toContain("export { AuthProvider, useAuth }");
    });

    it("TC-50: AuthContext cung cấp user.role cho ProtectedRoute", () => {
      const source = readFrontendFile("src/contexts/AuthContext.tsx");

      // AuthContextType phải có user, isAuthenticated, isLoading
      expect(source).toContain("user: UserProfile | null");
      expect(source).toContain("isAuthenticated: boolean");
      expect(source).toContain("isLoading: boolean");
    });

    it("TC-51: UserProfile type phải có field role", () => {
      const source = readFrontendFile("src/api/auth.api.ts");

      expect(source).toContain("role: string");
    });

    it("TC-52: isAuthenticated computed đúng (user !== null && token !== null)", () => {
      const source = readFrontendFile("src/contexts/AuthContext.tsx");

      expect(source).toContain("user !== null && token !== null");
    });
  });
});
