/**
 * Unit Tests cho US-02: Hệ thống Routing Frontend
 * ==============================================================================
 * Verify rằng frontend đã thiết lập react-router-dom routing đúng cách.
 *
 * Vì frontend là React app (JSX) và không có test runner riêng (không có vitest
 * hay jsdom trong frontend devDependencies), ta sử dụng structural testing:
 * - Đọc source code files và verify cấu trúc, imports, exports, route definitions
 * - Kiểm tra tính nhất quán giữa các file (router.tsx, App.tsx, main.tsx, pages)
 *
 * Test Coverage:
 * - TC-01: package.json có react-router-dom dependency (AC1)
 * - TC-02: router.tsx định nghĩa routes /login, /register, /chat, /, * (AC2)
 * - TC-03: App.tsx render AppRoutes từ router.tsx (AC3)
 * - TC-04: main.tsx wrap BrowserRouter (AC3)
 * - TC-05: LoginPage.tsx dùng Link từ react-router-dom (AC4)
 * - TC-06: RegisterPage.tsx dùng Link từ react-router-dom (AC4)
 * - TC-07: ChatPage.tsx là placeholder hoạt động (AC4)
 * - TC-08: vite.config.ts có SPA fallback config (AC5)
 * - TC-09: Type declarations cho react-router-dom tồn tại
 * - TC-10: Route "/" redirect về "/login" (BR-01)
 * - TC-11: Catch-all route "*" redirect về "/login" (BR-02)
 * - TC-12: LoginPage có link đến /register (BR-06)
 * - TC-13: RegisterPage có link đến /login (BR-06)
 * - TC-14: Không còn import custom router cũ (AppLink, useRouter, RouterProvider cũ)
 * - TC-15: Tất cả page components đều được export dạng named export
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

describe("US-02: Frontend Routing — Structural Tests", () => {
  // ===== AC1: react-router-dom trong package.json =====
  describe("AC1: react-router-dom dependency", () => {
    it("TC-01: package.json should have react-router-dom in dependencies", () => {
      const packageJson = JSON.parse(readFrontendFile("package.json"));

      expect(packageJson.dependencies).toBeDefined();
      expect(packageJson.dependencies["react-router-dom"]).toBeDefined();
      expect(packageJson.dependencies["react-router-dom"]).toMatch(/^\^?7\./);
    });

    it("TC-01b: react-router-dom should NOT be in devDependencies", () => {
      const packageJson = JSON.parse(readFrontendFile("package.json"));

      // react-router-dom là runtime dependency, không phải devDependency
      if (packageJson.devDependencies) {
        expect(packageJson.devDependencies["react-router-dom"]).toBeUndefined();
      }
    });
  });

  // ===== AC2: router.tsx định nghĩa routes =====
  describe("AC2: router.tsx route definitions", () => {
    it("TC-02: router.tsx should define all required routes", () => {
      const source = readFrontendFile("src/router.tsx");

      // Phải import từ react-router-dom
      expect(source).toContain("from 'react-router-dom'");

      // Phải import Routes, Route, Navigate
      expect(source).toContain("Routes");
      expect(source).toContain("Route");
      expect(source).toContain("Navigate");

      // Phải có 5 routes: /login, /register, /chat, /, *
      expect(source).toContain('path="/login"');
      expect(source).toContain('path="/register"');
      expect(source).toContain('path="/chat"');
      expect(source).toContain('path="/"');
      expect(source).toContain('path="*"');
    });

    it("TC-02b: router.tsx should import all page components", () => {
      const source = readFrontendFile("src/router.tsx");

      expect(source).toContain("LoginPage");
      expect(source).toContain("RegisterPage");
      expect(source).toContain("ChatPage");

      // Import từ pages directory
      expect(source).toContain("./pages/LoginPage");
      expect(source).toContain("./pages/RegisterPage");
      expect(source).toContain("./pages/ChatPage");
    });

    it("TC-02c: router.tsx should export AppRoutes", () => {
      const source = readFrontendFile("src/router.tsx");

      expect(source).toContain("export");
      expect(source).toContain("AppRoutes");
    });

    it("TC-10: Route '/' should redirect to '/login' (BR-01)", () => {
      const source = readFrontendFile("src/router.tsx");

      // Phải có Navigate to="/login" cho route "/"
      // Kiểm tra pattern: path="/" kết hợp với Navigate to="/login"
      expect(source).toContain('Navigate to="/login"');

      // Navigate phải có replace để không push history
      expect(source).toContain("replace");
    });

    it("TC-11: Catch-all route '*' should redirect to '/login' (BR-02)", () => {
      const source = readFrontendFile("src/router.tsx");

      // path="*" phải có Navigate to="/login"
      // Verify cả hai cùng tồn tại (không cần check order vì đã verify từng route ở TC-02)
      expect(source).toContain('path="*"');
      expect(source).toContain('Navigate to="/login"');
    });

    it("TC-02d: router.tsx should render page components as route elements", () => {
      const source = readFrontendFile("src/router.tsx");

      // Mỗi page phải được render qua element prop
      expect(source).toContain("element={<LoginPage />");
      expect(source).toContain("element={<RegisterPage />");
      expect(source).toContain("element={<ChatPage />");
    });
  });

  // ===== AC3: App.tsx và main.tsx =====
  describe("AC3: App.tsx and main.tsx setup", () => {
    it("TC-03: App.tsx should render AppRoutes from router.tsx", () => {
      const source = readFrontendFile("src/App.tsx");

      // Import AppRoutes
      expect(source).toContain("AppRoutes");
      expect(source).toContain("from './router");

      // Render AppRoutes
      expect(source).toContain("<AppRoutes");
    });

    it("TC-03b: App.tsx should NOT contain custom router logic", () => {
      const source = readFrontendFile("src/App.tsx");

      // Không nên chứa switch/case routing cũ
      expect(source).not.toContain("switch (");
      expect(source).not.toContain("case '/login'");
      expect(source).not.toContain("useRouter");
    });

    it("TC-04: main.tsx should wrap App with BrowserRouter", () => {
      const source = readFrontendFile("src/main.tsx");

      // Import BrowserRouter từ react-router-dom
      expect(source).toContain("BrowserRouter");
      expect(source).toContain("from 'react-router-dom'");

      // Wrap App trong BrowserRouter
      expect(source).toContain("<BrowserRouter>");
      expect(source).toContain("</BrowserRouter>");

      // Render App
      expect(source).toContain("<App");
    });

    it("TC-14: main.tsx should NOT import old custom RouterProvider", () => {
      const source = readFrontendFile("src/main.tsx");

      // Không import RouterProvider từ router.tsx cũ
      // (RouterProvider từ react-router-dom cũng không được dùng trong design)
      expect(source).not.toContain("RouterProvider");
    });
  });

  // ===== AC4: Page components =====
  describe("AC4: Page components", () => {
    it("TC-05: LoginPage.tsx should use Link from react-router-dom", () => {
      const source = readFrontendFile("src/pages/LoginPage.tsx");

      // Import Link từ react-router-dom
      expect(source).toContain("import { Link }");
      expect(source).toContain("from 'react-router-dom'");

      // Sử dụng Link component
      expect(source).toContain("<Link");
    });

    it("TC-12: LoginPage should have link to /register (BR-06)", () => {
      const source = readFrontendFile("src/pages/LoginPage.tsx");

      expect(source).toContain('to="/register"');
      // Phải có text hướng dẫn đăng ký
      expect(source).toContain("Đăng ký");
    });

    it("TC-06: RegisterPage.tsx should use Link from react-router-dom", () => {
      const source = readFrontendFile("src/pages/RegisterPage.tsx");

      // Import Link từ react-router-dom
      expect(source).toContain("import { Link }");
      expect(source).toContain("from 'react-router-dom'");

      // Sử dụng Link component
      expect(source).toContain("<Link");
    });

    it("TC-13: RegisterPage should have link to /login (BR-06)", () => {
      const source = readFrontendFile("src/pages/RegisterPage.tsx");

      expect(source).toContain('to="/login"');
      // Phải có text hướng dẫn đăng nhập
      expect(source).toContain("Đăng nhập");
    });

    it("TC-07: ChatPage.tsx should exist and be a valid component", () => {
      const source = readFrontendFile("src/pages/ChatPage.tsx");

      // ChatPage phải export
      expect(source).toContain("ChatPage");
      // Phải là function component
      expect(source).toContain("function ChatPage");
      // Phải return JSX
      expect(source).toContain("return");
    });

    it("TC-07b: ChatPage.tsx should NOT depend on custom router", () => {
      const source = readFrontendFile("src/pages/ChatPage.tsx");

      // ChatPage không import từ router.tsx
      expect(source).not.toContain("AppLink");
      expect(source).not.toContain("useRouter");
    });

    it("TC-15: All page components should use named exports", () => {
      const loginSource = readFrontendFile("src/pages/LoginPage.tsx");
      const registerSource = readFrontendFile("src/pages/RegisterPage.tsx");

      // Named export, không default export
      expect(loginSource).toContain("export { LoginPage }");
      expect(registerSource).toContain("export { RegisterPage }");

      // Không nên có "export default"
      expect(loginSource).not.toContain("export default");
      expect(registerSource).not.toContain("export default");
    });

    it("TC-04b: All three page files should exist", () => {
      expect(frontendFileExists("src/pages/LoginPage.tsx")).toBe(true);
      expect(frontendFileExists("src/pages/RegisterPage.tsx")).toBe(true);
      expect(frontendFileExists("src/pages/ChatPage.tsx")).toBe(true);
    });

    it("TC-04c: LoginPage should display page name for routing verification", () => {
      const source = readFrontendFile("src/pages/LoginPage.tsx");

      // Phải hiển thị tên trang / title để verify routing hoạt động
      expect(source).toContain("Đăng nhập");
    });

    it("TC-04d: RegisterPage should display page name for routing verification", () => {
      const source = readFrontendFile("src/pages/RegisterPage.tsx");

      expect(source).toContain("Tạo tài khoản");
    });

    it("TC-04e: LoginPage should have a form with email and password fields", () => {
      const source = readFrontendFile("src/pages/LoginPage.tsx");

      expect(source).toContain('type="email"');
      expect(source).toContain('type="password"');
      expect(source).toContain("<form");
      expect(source).toContain('type="submit"');
    });

    it("TC-04f: RegisterPage should have form with name, email, and password fields", () => {
      const source = readFrontendFile("src/pages/RegisterPage.tsx");

      expect(source).toContain('type="text"');
      expect(source).toContain('type="email"');
      expect(source).toContain('type="password"');
      expect(source).toContain("<form");
    });
  });

  // ===== AC5: Vite SPA fallback config =====
  describe("AC5: Vite SPA fallback configuration", () => {
    it("TC-08: vite.config.ts should exist and have valid configuration", () => {
      expect(frontendFileExists("vite.config.ts")).toBe(true);
      const source = readFrontendFile("vite.config.ts");

      // Phải có defineConfig
      expect(source).toContain("defineConfig");
      // Phải dùng react plugin
      expect(source).toContain("react()");
    });

    it("TC-08b: vite.config.ts should have build config with correct input", () => {
      const source = readFrontendFile("vite.config.ts");

      // Build config phải có rollupOptions.input
      expect(source).toContain("build");
      expect(source).toContain("rollupOptions");
      expect(source).toContain("index.html");
    });

    it("TC-08c: vite.config.ts should have SPA fallback comment/config", () => {
      const source = readFrontendFile("vite.config.ts");

      // Phải có comment/config liên quan đến SPA fallback
      // Vite mặc định hỗ trợ SPA fallback (appType: 'spa' là default)
      // nhưng cần có documentation/comment giải thích
      const hasSpaReference =
        source.includes("SPA") ||
        source.includes("spa") ||
        source.includes("fallback") ||
        source.includes("historyApiFallback") ||
        source.includes("appType");

      expect(hasSpaReference).toBe(true);
    });

    it("TC-08d: vite.config.ts should NOT set appType to 'mpa'", () => {
      const source = readFrontendFile("vite.config.ts");

      // Nếu có appType, nó phải là 'spa' hoặc không set (default là 'spa')
      expect(source).not.toContain("appType: 'mpa'");
      expect(source).not.toContain('appType: "mpa"');
    });

    it("TC-08e: vite.config.ts should have proxy config for API", () => {
      const source = readFrontendFile("vite.config.ts");

      expect(source).toContain("proxy");
      expect(source).toContain("/api");
      expect(source).toContain("localhost:3000");
    });
  });

  // ===== Type Declaration =====
  describe("Type declarations for react-router-dom", () => {
    it("TC-09: react-router-dom.d.ts should exist", () => {
      expect(frontendFileExists("src/types/react-router-dom.d.ts")).toBe(true);
    });

    it("TC-09b: type declarations should cover all used components and hooks", () => {
      const source = readFrontendFile("src/types/react-router-dom.d.ts");

      // Components used in the project
      expect(source).toContain("BrowserRouter");
      expect(source).toContain("Routes");
      expect(source).toContain("Route");
      expect(source).toContain("Navigate");
      expect(source).toContain("Link");

      // Hooks cho future use
      expect(source).toContain("useNavigate");
      expect(source).toContain("useLocation");
      expect(source).toContain("useParams");
    });

    it("TC-09c: type declarations should declare module 'react-router-dom'", () => {
      const source = readFrontendFile("src/types/react-router-dom.d.ts");

      expect(source).toContain("declare module 'react-router-dom'");
    });
  });

  // ===== Consistency & No Legacy Code =====
  describe("Consistency: no legacy custom router code", () => {
    it("TC-14b: router.tsx should NOT contain custom router code", () => {
      const source = readFrontendFile("src/router.tsx");

      // Không còn custom router cũ
      expect(source).not.toContain("RouterContext");
      expect(source).not.toContain("RouterProvider");
      expect(source).not.toContain("useRouter");
      expect(source).not.toContain("AppLink");
      expect(source).not.toContain("window.history.pushState");
      expect(source).not.toContain("popstate");
      expect(source).not.toContain("createContext");
    });

    it("TC-14c: LoginPage should NOT import AppLink (legacy)", () => {
      const source = readFrontendFile("src/pages/LoginPage.tsx");

      expect(source).not.toContain("AppLink");
      expect(source).not.toContain("useRouter");
    });

    it("TC-14d: RegisterPage should NOT import AppLink (legacy)", () => {
      const source = readFrontendFile("src/pages/RegisterPage.tsx");

      expect(source).not.toContain("AppLink");
      expect(source).not.toContain("useRouter");
    });
  });

  // ===== Route architecture correctness =====
  describe("Route architecture correctness", () => {
    it("TC-16: BrowserRouter should be at top level (main.tsx), not in App.tsx or router.tsx", () => {
      const mainSource = readFrontendFile("src/main.tsx");
      const appSource = readFrontendFile("src/App.tsx");
      const routerSource = readFrontendFile("src/router.tsx");

      // BrowserRouter chỉ nên ở main.tsx
      expect(mainSource).toContain("BrowserRouter");
      expect(appSource).not.toContain("BrowserRouter");
      expect(routerSource).not.toContain("BrowserRouter");
    });

    it("TC-17: Routes should be defined in router.tsx, not in App.tsx", () => {
      const appSource = readFrontendFile("src/App.tsx");

      // App.tsx không nên chứa route definitions trực tiếp
      expect(appSource).not.toContain("<Route");
      expect(appSource).not.toContain("<Routes");
    });

    it("TC-18: main.tsx should import App and render it", () => {
      const source = readFrontendFile("src/main.tsx");

      expect(source).toContain("import App from './App");
      expect(source).toContain("<App");
    });

    it("TC-19: main.tsx should use StrictMode", () => {
      const source = readFrontendFile("src/main.tsx");

      expect(source).toContain("StrictMode");
      expect(source).toContain("<StrictMode>");
    });

    it("TC-20: main.tsx should use createRoot", () => {
      const source = readFrontendFile("src/main.tsx");

      expect(source).toContain("createRoot");
      expect(source).toContain('document.getElementById');
    });
  });

  // ===== Edge Cases & Adversarial =====
  describe("Edge cases & Adversarial tests", () => {
    it("TC-21: Navigate components should use 'replace' to prevent back-button loop", () => {
      const source = readFrontendFile("src/router.tsx");

      // Tất cả Navigate phải có replace
      const navigateMatches = source.match(/<Navigate/g);
      const replaceMatches = source.match(/replace/g);

      expect(navigateMatches).not.toBeNull();
      expect(replaceMatches).not.toBeNull();

      // Số lượng replace >= số lượng Navigate (mỗi Navigate phải có replace)
      expect(replaceMatches!.length).toBeGreaterThanOrEqual(navigateMatches!.length);
    });

    it("TC-22: LoginPage form should prevent default submit", () => {
      const source = readFrontendFile("src/pages/LoginPage.tsx");

      expect(source).toContain("preventDefault");
    });

    it("TC-23: RegisterPage form should prevent default submit", () => {
      const source = readFrontendFile("src/pages/RegisterPage.tsx");

      expect(source).toContain("preventDefault");
    });

    it("TC-24: router.tsx should have catch-all as last route", () => {
      const source = readFrontendFile("src/router.tsx");

      // path="*" phải xuất hiện SAU path="/"
      const rootIndex = source.indexOf('path="/"');
      const catchAllIndex = source.indexOf('path="*"');

      expect(rootIndex).toBeGreaterThan(-1);
      expect(catchAllIndex).toBeGreaterThan(-1);
      expect(catchAllIndex).toBeGreaterThan(rootIndex);
    });

    it("TC-25: No circular imports between router.tsx and page components", () => {
      const loginSource = readFrontendFile("src/pages/LoginPage.tsx");
      const registerSource = readFrontendFile("src/pages/RegisterPage.tsx");

      // Pages không nên import từ router.tsx (circular dependency)
      expect(loginSource).not.toContain("from '../router");
      expect(registerSource).not.toContain("from '../router");
    });

    it("TC-26: package.json should have React 19 compatible with react-router-dom v7", () => {
      const packageJson = JSON.parse(readFrontendFile("package.json"));

      const reactVersion = packageJson.dependencies["react"];
      const routerVersion = packageJson.dependencies["react-router-dom"];

      // React 19.x
      expect(reactVersion).toMatch(/19/);
      // Router v7.x (compatible with React 19)
      expect(routerVersion).toMatch(/7/);
    });
  });
});
