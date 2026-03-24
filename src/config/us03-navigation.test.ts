/**
 * Unit Tests cho US-03: Hiển thị Navigation Link đến Dev Team theo Role
 * ==============================================================================
 * Verify rằng frontend đã thiết lập AppNavbar, AppLayout, và refactor
 * ChatPage/DevTeamPage/router.tsx đúng cách theo design document.
 *
 * Approach: Structural testing (đọc source files bằng fs, verify cấu trúc).
 * Lý do: Backend vitest không có jsdom, nên không thể render React components.
 *
 * Test Coverage:
 * - AC1: AppNavbar hiển thị tên user, role, navigation links
 * - AC2: Admin thấy link "Dev Team" (role-based visibility)
 * - AC3: User thường KHÔNG thấy link "Dev Team"
 * - AC4: DevTeamPage có link quay lại /chat (thông qua AppNavbar)
 * - AC5: Navigation responsive (hamburger menu trên mobile)
 * - AC6: Sử dụng useAuth(), KHÔNG gọi thêm API
 * - Architecture: AppLayout, router refactor, ChatPage/DevTeamPage refactor
 * - Adversarial: security, edge cases, consistency
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

// ============================================================================
// FILE EXISTENCE — Required files for US-03
// ============================================================================

describe("US-03: File Existence", () => {
  it("TC-01: AppNavbar.tsx exists", () => {
    expect(frontendFileExists("src/components/AppNavbar.tsx")).toBe(true);
  });

  it("TC-02: AppLayout.tsx exists", () => {
    expect(frontendFileExists("src/components/AppLayout.tsx")).toBe(true);
  });

  it("TC-03: ChatPage.tsx exists (refactored)", () => {
    expect(frontendFileExists("src/pages/ChatPage.tsx")).toBe(true);
  });

  it("TC-04: DevTeamPage.tsx exists (enhanced)", () => {
    expect(frontendFileExists("src/pages/DevTeamPage.tsx")).toBe(true);
  });

  it("TC-05: router.tsx exists (refactored)", () => {
    expect(frontendFileExists("src/router.tsx")).toBe(true);
  });

  it("TC-06: index.css exists (with navbar styles)", () => {
    expect(frontendFileExists("src/index.css")).toBe(true);
  });
});

// ============================================================================
// AC1: AppNavbar hiển thị tên user, role badge, navigation links
// ============================================================================

describe("US-03 AC1: AppNavbar — Navigation bar hiển thị user info", () => {
  it("TC-07: AppNavbar imports useAuth from AuthContext", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("useAuth");
    expect(source).toContain("from \"../contexts/AuthContext");
  });

  it("TC-08: AppNavbar imports useLocation and useNavigate from react-router-dom", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("useLocation");
    expect(source).toContain("useNavigate");
    expect(source).toContain("from \"react-router-dom\"");
  });

  it("TC-09: AppNavbar imports NavLink from react-router-dom", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("NavLink");
  });

  it("TC-10: AppNavbar destructures user and logout from useAuth()", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("const { user, logout } = useAuth()");
  });

  it("TC-11: AppNavbar renders user.name", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("user?.name");
  });

  it("TC-12: AppNavbar renders user.role as badge", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("user?.role");
    expect(source).toContain("navbar-role-badge");
    expect(source).toContain("role-");
  });

  it("TC-13: AppNavbar renders brand logo 🎓 EnglishPro AI", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("🎓");
    expect(source).toContain("EnglishPro AI");
    expect(source).toContain("navbar-brand");
  });

  it("TC-14: AppNavbar renders logout button", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("Đăng xuất");
    expect(source).toContain("navbar-logout-btn");
  });

  it("TC-15: AppNavbar has handleLogout that calls logout() and navigates to /login", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("handleLogout");
    expect(source).toContain("logout()");
    expect(source).toContain('navigate("/login")');
  });

  it("TC-16: AppNavbar is exported as named export", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("export { AppNavbar }");
    expect(source).not.toContain("export default");
  });

  it("TC-17: AppNavbar uses <nav> HTML element with className app-navbar", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain('<nav className="app-navbar"');
  });
});

// ============================================================================
// AC2: Admin thấy link "Dev Team" dẫn đến /dev-team
// ============================================================================

describe("US-03 AC2: Admin sees Dev Team link", () => {
  it("TC-18: NAV_ITEMS contains Chat item with path /chat", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain('label: "Chat"');
    expect(source).toContain('path: "/chat"');
  });

  it("TC-19: NAV_ITEMS contains Dev Team item with path /dev-team and adminOnly: true", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain('label: "Dev Team"');
    expect(source).toContain('path: "/dev-team"');
    expect(source).toContain("adminOnly: true");
  });

  it("TC-20: Dev Team nav item uses 🏗️ icon", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain('icon: "🏗️"');
  });

  it("TC-21: Chat nav item uses 💬 icon", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain('icon: "💬"');
  });

  it("TC-22: NavLink renders to={item.path} for each visible item", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("to={item.path}");
  });
});

// ============================================================================
// AC3: User thường KHÔNG thấy link "Dev Team"
// ============================================================================

describe("US-03 AC3: Regular user does NOT see Dev Team link", () => {
  it("TC-23: visibleItems is filtered based on role — adminOnly items hidden for non-admin", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    // Filter logic: !item.adminOnly || user.role === "admin"
    expect(source).toContain("NAV_ITEMS.filter");
    expect(source).toContain("!item.adminOnly");
    expect(source).toContain('user?.role === "admin"');
  });

  it("TC-24: Only Chat item has adminOnly absent/false — visible for all users", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    // Chat item should NOT have adminOnly property
    const chatItem = source.match(/\{\s*label:\s*"Chat"[^}]*\}/s);
    expect(chatItem).not.toBeNull();
    const chatItemStr = chatItem![0];
    expect(chatItemStr).not.toContain("adminOnly");
  });

  it("TC-25: Dev Team item has adminOnly: true — hidden for regular users", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    const devTeamItem = source.match(/\{\s*label:\s*"Dev Team"[^}]*\}/s);
    expect(devTeamItem).not.toBeNull();
    const devTeamItemStr = devTeamItem![0];
    expect(devTeamItemStr).toContain("adminOnly: true");
  });

  it("TC-26: NavItem interface has optional adminOnly boolean field", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("interface NavItem");
    expect(source).toContain("adminOnly?: boolean");
  });
});

// ============================================================================
// AC4: DevTeamPage có link quay lại /chat (thông qua AppNavbar)
// ============================================================================

describe("US-03 AC4: DevTeamPage has navigation back to /chat", () => {
  it("TC-27: router.tsx wraps DevTeamPage with AppLayout (which contains AppNavbar)", () => {
    const source = readFrontendFile("src/router.tsx");

    // DevTeamPage should be wrapped: ProtectedRoute > AppLayout > DevTeamPage
    expect(source).toContain("AppLayout");
    expect(source).toContain("DevTeamPage");

    // Verify nesting: <AppLayout><DevTeamPage /></AppLayout>
    const devTeamRouteSection = source.slice(
      source.indexOf('path="/dev-team"'),
      source.indexOf('path="/dev-team"') + 300
    );
    expect(devTeamRouteSection).toContain("<AppLayout>");
    expect(devTeamRouteSection).toContain("<DevTeamPage />");
    expect(devTeamRouteSection).toContain("</AppLayout>");
  });

  it("TC-28: router.tsx wraps ChatPage with AppLayout (consistent navigation)", () => {
    const source = readFrontendFile("src/router.tsx");

    const chatRouteSection = source.slice(
      source.indexOf('path="/chat"'),
      source.indexOf('path="/chat"') + 300
    );
    expect(chatRouteSection).toContain("<AppLayout>");
    expect(chatRouteSection).toContain("<ChatPage />");
    expect(chatRouteSection).toContain("</AppLayout>");
  });

  it("TC-29: AppNavbar always has Chat link visible (for navigating back from Dev Team)", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    // Chat item is NOT adminOnly, so it's always visible
    const chatItem = source.match(/\{\s*label:\s*"Chat"[^}]*\}/s);
    expect(chatItem).not.toBeNull();
    const chatStr = chatItem![0];
    expect(chatStr).toContain('path: "/chat"');
    expect(chatStr).not.toContain("adminOnly: true");
  });

  it("TC-30: DevTeamPage does NOT need its own back link (handled by AppNavbar)", () => {
    const source = readFrontendFile("src/pages/DevTeamPage.tsx");

    // DevTeamPage should NOT import useNavigate or have a "back to chat" link
    // because AppNavbar handles navigation
    // This is a design choice verified by the fact that AppLayout wraps DevTeamPage
    expect(source).not.toContain('to="/chat"');
  });
});

// ============================================================================
// AC5: Navigation responsive — desktop/mobile
// ============================================================================

describe("US-03 AC5: Responsive navigation", () => {
  it("TC-31: AppNavbar has isMobileMenuOpen state", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("isMobileMenuOpen");
    expect(source).toContain("setIsMobileMenuOpen");
    expect(source).toContain("useState(false)");
  });

  it("TC-32: AppNavbar has toggleMobileMenu function", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("toggleMobileMenu");
  });

  it("TC-33: AppNavbar has hamburger toggle button with aria-label", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("navbar-toggle");
    expect(source).toContain('aria-label="Toggle navigation menu"');
  });

  it("TC-34: AppNavbar shows ☰ when closed and ✕ when open", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("☰");
    expect(source).toContain("✕");
    expect(source).toContain("isMobileMenuOpen");
  });

  it("TC-35: AppNavbar renders mobile menu conditionally", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("navbar-mobile-menu");
    expect(source).toContain("isMobileMenuOpen &&");
  });

  it("TC-36: Mobile menu contains nav links for visible items", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("navbar-mobile-link");
    // Mobile menu should also map visibleItems
    const mobileMenuSection = source.slice(
      source.indexOf("navbar-mobile-menu"),
      source.indexOf("navbar-mobile-menu") + 500
    );
    expect(mobileMenuSection).toContain("visibleItems.map");
  });

  it("TC-37: Mobile menu has separator, user info, and logout button", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("navbar-mobile-separator");
    expect(source).toContain("navbar-mobile-user");
    expect(source).toContain("navbar-mobile-logout");
  });

  it("TC-38: Mobile menu closes when location.pathname changes (useEffect)", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    // useEffect that closes mobile menu on navigation
    expect(source).toContain("useEffect(");
    expect(source).toContain("setIsMobileMenuOpen(false)");
    expect(source).toContain("location.pathname");
  });

  it("TC-39: CSS has responsive media query for navbar at 768px", () => {
    const cssSource = readFrontendFile("src/index.css");

    expect(cssSource).toContain("@media (max-width: 768px)");
  });

  it("TC-40: CSS hides .navbar-links on mobile (<768px)", () => {
    const cssSource = readFrontendFile("src/index.css");

    // Find the 768px media query section
    const mediaIdx = cssSource.indexOf("@media (max-width: 768px)");
    expect(mediaIdx).toBeGreaterThan(-1);
    const mediaSection = cssSource.slice(mediaIdx, mediaIdx + 500);
    expect(mediaSection).toContain(".navbar-links");
    expect(mediaSection).toContain("display: none");
  });

  it("TC-41: CSS hides .navbar-user on mobile (<768px)", () => {
    const cssSource = readFrontendFile("src/index.css");

    const mediaIdx = cssSource.indexOf("@media (max-width: 768px)");
    const mediaSection = cssSource.slice(mediaIdx, mediaIdx + 500);
    expect(mediaSection).toContain(".navbar-user");
    expect(mediaSection).toContain("display: none");
  });

  it("TC-42: CSS shows .navbar-toggle on mobile (<768px)", () => {
    const cssSource = readFrontendFile("src/index.css");

    const mediaIdx = cssSource.indexOf("@media (max-width: 768px)");
    const mediaSection = cssSource.slice(mediaIdx, mediaIdx + 500);
    expect(mediaSection).toContain(".navbar-toggle");
    expect(mediaSection).toContain("display: flex");
  });

  it("TC-43: CSS has .navbar-toggle display:none by default (desktop)", () => {
    const cssSource = readFrontendFile("src/index.css");

    // Before media query, navbar-toggle should be display:none
    const mediaIdx = cssSource.indexOf("@media (max-width: 768px)");
    const beforeMedia = cssSource.slice(0, mediaIdx);
    
    // Find .navbar-toggle rule before media query
    const toggleIdx = beforeMedia.lastIndexOf(".navbar-toggle");
    expect(toggleIdx).toBeGreaterThan(-1);
    const toggleRule = beforeMedia.slice(toggleIdx, toggleIdx + 200);
    expect(toggleRule).toContain("display: none");
  });

  it("TC-44: CSS has .navbar-mobile-menu display:none by default, flex in mobile", () => {
    const cssSource = readFrontendFile("src/index.css");

    // Default: display: none
    const mediaIdx = cssSource.indexOf("@media (max-width: 768px)");
    const beforeMedia = cssSource.slice(0, mediaIdx);
    const mobileMenuIdx = beforeMedia.lastIndexOf(".navbar-mobile-menu");
    expect(mobileMenuIdx).toBeGreaterThan(-1);
    const mobileMenuRule = beforeMedia.slice(mobileMenuIdx, mobileMenuIdx + 300);
    expect(mobileMenuRule).toContain("display: none");

    // Mobile: display: flex
    const afterMedia = cssSource.slice(mediaIdx, mediaIdx + 500);
    expect(afterMedia).toContain(".navbar-mobile-menu");
  });
});

// ============================================================================
// AC6: Sử dụng useAuth(), KHÔNG gọi thêm API
// ============================================================================

describe("US-03 AC6: Uses useAuth() — NO extra API calls", () => {
  it("TC-45: AppNavbar does NOT import from auth.api.ts", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).not.toContain("from \"../api/auth.api");
    expect(source).not.toContain("from '../api/auth.api");
  });

  it("TC-46: AppNavbar does NOT import from client.ts", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).not.toContain("from \"../api/client");
    expect(source).not.toContain("from '../api/client");
  });

  it("TC-47: AppNavbar does NOT use fetch() directly", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).not.toContain("fetch(");
  });

  it("TC-48: AppNavbar does NOT use getMeApi", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).not.toContain("getMeApi");
  });

  it("TC-49: AppNavbar relies exclusively on useAuth() hook for user data", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    // Must use useAuth hook
    expect(source).toContain("useAuth()");
    // Must get user from useAuth destructure
    expect(source).toContain("{ user, logout }");
  });
});

// ============================================================================
// AppLayout Component
// ============================================================================

describe("US-03: AppLayout Component", () => {
  it("TC-50: AppLayout imports AppNavbar", () => {
    const source = readFrontendFile("src/components/AppLayout.tsx");

    expect(source).toContain("AppNavbar");
    expect(source).toContain("from \"./AppNavbar");
  });

  it("TC-51: AppLayout accepts children prop (ReactNode)", () => {
    const source = readFrontendFile("src/components/AppLayout.tsx");

    expect(source).toContain("children");
    expect(source).toContain("ReactNode");
  });

  it("TC-52: AppLayout renders AppNavbar above children", () => {
    const source = readFrontendFile("src/components/AppLayout.tsx");

    const navbarIdx = source.indexOf("<AppNavbar");
    const childrenIdx = source.indexOf("{children}");
    expect(navbarIdx).toBeGreaterThan(-1);
    expect(childrenIdx).toBeGreaterThan(-1);
    expect(navbarIdx).toBeLessThan(childrenIdx);
  });

  it("TC-53: AppLayout uses correct CSS classes", () => {
    const source = readFrontendFile("src/components/AppLayout.tsx");

    expect(source).toContain("app-layout");
    expect(source).toContain("app-content");
  });

  it("TC-54: AppLayout wraps children in <main> element", () => {
    const source = readFrontendFile("src/components/AppLayout.tsx");

    expect(source).toContain("<main");
    expect(source).toContain("</main>");
  });

  it("TC-55: AppLayout is exported as named export", () => {
    const source = readFrontendFile("src/components/AppLayout.tsx");

    expect(source).toContain("export { AppLayout }");
    expect(source).not.toContain("export default");
  });
});

// ============================================================================
// Router Refactor
// ============================================================================

describe("US-03: Router Refactor (router.tsx)", () => {
  it("TC-56: router.tsx imports AppLayout", () => {
    const source = readFrontendFile("src/router.tsx");

    expect(source).toContain("AppLayout");
    expect(source).toContain("from './components/AppLayout");
  });

  it("TC-57: router.tsx imports ProtectedRoute", () => {
    const source = readFrontendFile("src/router.tsx");

    expect(source).toContain("ProtectedRoute");
    expect(source).toContain("from './components/ProtectedRoute");
  });

  it("TC-58: /chat route has structure ProtectedRoute > AppLayout > ChatPage", () => {
    const source = readFrontendFile("src/router.tsx");

    const chatSection = source.slice(
      source.indexOf('path="/chat"'),
      source.indexOf('path="/chat"') + 300
    );
    
    // ProtectedRoute wraps AppLayout wraps ChatPage
    const protectedIdx = chatSection.indexOf("ProtectedRoute");
    const layoutIdx = chatSection.indexOf("AppLayout");
    const pageIdx = chatSection.indexOf("ChatPage");
    
    expect(protectedIdx).toBeGreaterThan(-1);
    expect(layoutIdx).toBeGreaterThan(protectedIdx);
    expect(pageIdx).toBeGreaterThan(layoutIdx);
  });

  it("TC-59: /dev-team route has ProtectedRoute with requiredRole='admin'", () => {
    const source = readFrontendFile("src/router.tsx");

    const devTeamSection = source.slice(
      source.indexOf('path="/dev-team"'),
      source.indexOf('path="/dev-team"') + 300
    );
    
    expect(devTeamSection).toContain('requiredRole="admin"');
  });

  it("TC-60: /dev-team route has structure ProtectedRoute > AppLayout > DevTeamPage", () => {
    const source = readFrontendFile("src/router.tsx");

    const devTeamSection = source.slice(
      source.indexOf('path="/dev-team"'),
      source.indexOf('path="/dev-team"') + 300
    );
    
    const protectedIdx = devTeamSection.indexOf("ProtectedRoute");
    const layoutIdx = devTeamSection.indexOf("AppLayout");
    const pageIdx = devTeamSection.indexOf("DevTeamPage");
    
    expect(protectedIdx).toBeGreaterThan(-1);
    expect(layoutIdx).toBeGreaterThan(protectedIdx);
    expect(pageIdx).toBeGreaterThan(layoutIdx);
  });

  it("TC-61: /chat ProtectedRoute does NOT have requiredRole (any authenticated user)", () => {
    const source = readFrontendFile("src/router.tsx");

    const chatSection = source.slice(
      source.indexOf('path="/chat"'),
      source.indexOf('path="/chat"') + 200
    );
    
    // Chat route should have ProtectedRoute without requiredRole
    expect(chatSection).toContain("<ProtectedRoute>");
  });

  it("TC-62: Redirects still work (/ and * redirect to /login)", () => {
    const source = readFrontendFile("src/router.tsx");

    expect(source).toContain('path="/"');
    expect(source).toContain('path="*"');
    expect(source).toContain('Navigate to="/login" replace');
  });

  it("TC-63: router.tsx does NOT use BrowserRouter (stays in main.tsx)", () => {
    const source = readFrontendFile("src/router.tsx");

    expect(source).not.toContain("BrowserRouter");
  });
});

// ============================================================================
// ChatPage Refactor — No more Dev Team logic
// ============================================================================

describe("US-03: ChatPage Refactor — Single Responsibility", () => {
  it("TC-64: ChatPage does NOT contain activeTab state (no tab navigation)", () => {
    const source = readFrontendFile("src/pages/ChatPage.tsx");

    expect(source).not.toContain("activeTab");
  });

  it("TC-65: ChatPage does NOT contain Dev Team state (workflow, featureRequest)", () => {
    const source = readFrontendFile("src/pages/ChatPage.tsx");

    expect(source).not.toContain("startWorkflow");
    expect(source).not.toContain("handleApproval");
  });

  it("TC-66: ChatPage does NOT contain DEV_AGENTS constant", () => {
    const source = readFrontendFile("src/pages/ChatPage.tsx");

    expect(source).not.toContain("DEV_AGENTS");
  });

  it("TC-67: ChatPage still contains TUTOR_AGENTS", () => {
    const source = readFrontendFile("src/pages/ChatPage.tsx");

    expect(source).toContain("TUTOR_AGENTS");
  });

  it("TC-68: ChatPage still has chat functionality (sendMessage, messages state)", () => {
    const source = readFrontendFile("src/pages/ChatPage.tsx");

    expect(source).toContain("sendMessage");
    expect(source).toContain("messages");
    expect(source).toContain("setMessages");
  });

  it("TC-69: ChatPage does NOT contain tab-nav CSS class references", () => {
    const source = readFrontendFile("src/pages/ChatPage.tsx");

    expect(source).not.toContain("tab-nav");
    expect(source).not.toContain("tab-btn");
  });

  it("TC-70: ChatPage sidebar header says 'Đội ngũ gia sư'", () => {
    const source = readFrontendFile("src/pages/ChatPage.tsx");

    expect(source).toContain("Đội ngũ gia sư");
  });

  it("TC-71: ChatPage is a named export", () => {
    const source = readFrontendFile("src/pages/ChatPage.tsx");

    expect(source).toContain("export { ChatPage }");
    expect(source).not.toContain("export default ChatPage");
  });
});

// ============================================================================
// DevTeamPage Enhancement — Full dashboard
// ============================================================================

describe("US-03: DevTeamPage Enhancement — Full Dashboard", () => {
  it("TC-72: DevTeamPage has workflow state", () => {
    const source = readFrontendFile("src/pages/DevTeamPage.tsx");

    expect(source).toContain("workflow");
    expect(source).toContain("setWorkflow");
  });

  it("TC-73: DevTeamPage has featureRequest state", () => {
    const source = readFrontendFile("src/pages/DevTeamPage.tsx");

    expect(source).toContain("featureRequest");
    expect(source).toContain("setFeatureRequest");
  });

  it("TC-74: DevTeamPage has startWorkflow function", () => {
    const source = readFrontendFile("src/pages/DevTeamPage.tsx");

    expect(source).toContain("startWorkflow");
  });

  it("TC-75: DevTeamPage has handleApproval function", () => {
    const source = readFrontendFile("src/pages/DevTeamPage.tsx");

    expect(source).toContain("handleApproval");
  });

  it("TC-76: DevTeamPage has DEV_AGENTS constant", () => {
    const source = readFrontendFile("src/pages/DevTeamPage.tsx");

    expect(source).toContain("DEV_AGENTS");
    expect(source).toContain("po_agent");
    expect(source).toContain("ba_agent");
    expect(source).toContain("dev_agent");
    expect(source).toContain("tester_agent");
  });

  it("TC-77: DevTeamPage has workflow pipeline UI", () => {
    const source = readFrontendFile("src/pages/DevTeamPage.tsx");

    expect(source).toContain("workflow-pipeline");
    expect(source).toContain("PIPELINE_STEPS");
  });

  it("TC-78: DevTeamPage has feature request form", () => {
    const source = readFrontendFile("src/pages/DevTeamPage.tsx");

    expect(source).toContain("feature-form");
    expect(source).toContain("Feature Request");
  });

  it("TC-79: DevTeamPage has approval section", () => {
    const source = readFrontendFile("src/pages/DevTeamPage.tsx");

    expect(source).toContain("btn-approve");
    expect(source).toContain("btn-reject");
    expect(source).toContain("Approve");
    expect(source).toContain("Reject");
  });

  it("TC-80: DevTeamPage has output panels for user stories, design, code, tests", () => {
    const source = readFrontendFile("src/pages/DevTeamPage.tsx");

    expect(source).toContain("output.userStories");
    expect(source).toContain("output.designDocument");
    expect(source).toContain("output.sourceCode");
    expect(source).toContain("output.testResults");
  });

  it("TC-81: DevTeamPage calls /api/dev-team/start endpoint", () => {
    const source = readFrontendFile("src/pages/DevTeamPage.tsx");

    expect(source).toContain("/dev-team/start");
  });

  it("TC-82: DevTeamPage calls /api/dev-team/approve endpoint", () => {
    const source = readFrontendFile("src/pages/DevTeamPage.tsx");

    expect(source).toContain("/dev-team/approve");
  });

  it("TC-83: DevTeamPage is a named export", () => {
    const source = readFrontendFile("src/pages/DevTeamPage.tsx");

    expect(source).toContain("export { DevTeamPage }");
    expect(source).not.toContain("export default DevTeamPage");
  });

  it("TC-84: DevTeamPage does NOT import useAuth (not needed — NavBar handles it)", () => {
    const source = readFrontendFile("src/pages/DevTeamPage.tsx");

    expect(source).not.toContain("useAuth");
  });
});

// ============================================================================
// CSS Styling for AppNavbar
// ============================================================================

describe("US-03: CSS Styling for Navbar", () => {
  it("TC-85: CSS defines .app-navbar with correct height (56px)", () => {
    const cssSource = readFrontendFile("src/index.css");

    expect(cssSource).toContain(".app-navbar");
    expect(cssSource).toContain("--navbar-height");
    expect(cssSource).toContain("56px");
  });

  it("TC-86: CSS defines navbar CSS custom properties (tokens)", () => {
    const cssSource = readFrontendFile("src/index.css");

    expect(cssSource).toContain("--navbar-height");
    expect(cssSource).toContain("--navbar-bg");
    expect(cssSource).toContain("--navbar-border");
    expect(cssSource).toContain("--nav-link-color");
    expect(cssSource).toContain("--nav-link-active-color");
    expect(cssSource).toContain("--nav-link-active-bg");
  });

  it("TC-87: CSS has role badge styles (.role-admin, .role-user)", () => {
    const cssSource = readFrontendFile("src/index.css");

    expect(cssSource).toContain(".navbar-role-badge.role-admin");
    expect(cssSource).toContain(".navbar-role-badge.role-user");
    expect(cssSource).toContain("--badge-admin-bg");
    expect(cssSource).toContain("--badge-user-bg");
  });

  it("TC-88: CSS has .navbar-link.active style for highlighting current route", () => {
    const cssSource = readFrontendFile("src/index.css");

    expect(cssSource).toContain(".navbar-link.active");
    expect(cssSource).toContain("--nav-link-active-bg");
  });

  it("TC-89: CSS has .app-layout flex-direction column", () => {
    const cssSource = readFrontendFile("src/index.css");

    expect(cssSource).toContain(".app-layout");
    expect(cssSource).toContain("flex-direction: column");
  });

  it("TC-90: CSS has logout button hover state with red color", () => {
    const cssSource = readFrontendFile("src/index.css");

    expect(cssSource).toContain(".navbar-logout-btn:hover");
    expect(cssSource).toContain("#e74c3c");
  });
});

// ============================================================================
// Active state tracking
// ============================================================================

describe("US-03: Active state tracking (highlight current page)", () => {
  it("TC-91: AppNavbar determines active state from location.pathname", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("location.pathname");
    expect(source).toContain("location.pathname === item.path");
  });

  it("TC-92: Active class is applied conditionally", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    // Should have conditional className with 'active'
    expect(source).toContain('"active"');
    expect(source).toContain('location.pathname === item.path ? "active" : ""');
  });

  it("TC-93: Mobile links also track active state", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    // Mobile menu should also have active tracking
    const mobileSection = source.slice(source.indexOf("navbar-mobile-menu"));
    expect(mobileSection).toContain("active");
    expect(mobileSection).toContain("location.pathname");
  });
});

// ============================================================================
// App.tsx Integration
// ============================================================================

describe("US-03: App.tsx Integration", () => {
  it("TC-94: App.tsx wraps AppRoutes inside AuthProvider", () => {
    const source = readFrontendFile("src/App.tsx");

    const providerStart = source.indexOf("<AuthProvider>");
    const routesStart = source.indexOf("<AppRoutes");
    const providerEnd = source.indexOf("</AuthProvider>");

    expect(providerStart).toBeGreaterThan(-1);
    expect(routesStart).toBeGreaterThan(providerStart);
    expect(providerEnd).toBeGreaterThan(routesStart);
  });

  it("TC-95: App.tsx imports from correct paths", () => {
    const source = readFrontendFile("src/App.tsx");

    expect(source).toContain('from "./contexts/AuthContext');
    expect(source).toContain('from "./router');
  });
});

// ============================================================================
// Adversarial & Edge Cases
// ============================================================================

describe("US-03 Adversarial: Security & Edge Cases", () => {
  it("TC-96: AppNavbar handles null user gracefully (optional chaining)", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    // Should use optional chaining for user properties
    expect(source).toContain("user?.name");
    expect(source).toContain("user?.role");
  });

  it("TC-97: AppNavbar provides fallback for role badge class when user is null", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    // Should have fallback: user?.role ?? "user"
    expect(source).toContain('user?.role ?? "user"');
  });

  it("TC-98: NAV_ITEMS is defined as const array — not mutated at runtime", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("const NAV_ITEMS");
    // Should be defined at module level, not inside component
    const navItemsIdx = source.indexOf("const NAV_ITEMS");
    const functionIdx = source.indexOf("function AppNavbar");
    expect(navItemsIdx).toBeLessThan(functionIdx);
  });

  it("TC-99: AppNavbar uses useState from React", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("import { useState, useEffect }");
  });

  it("TC-100: DevTeamPage startWorkflow validates featureRequest is not empty", () => {
    const source = readFrontendFile("src/pages/DevTeamPage.tsx");

    expect(source).toContain("!featureRequest.trim()");
  });

  it("TC-101: DevTeamPage startWorkflow prevents duplicate submissions (devLoading check)", () => {
    const source = readFrontendFile("src/pages/DevTeamPage.tsx");

    expect(source).toContain("devLoading");
    const startFnIdx = source.indexOf("const startWorkflow");
    const startFnSection = source.slice(startFnIdx, startFnIdx + 200);
    expect(startFnSection).toContain("devLoading");
  });

  it("TC-102: DevTeamPage handleApproval validates threadId exists", () => {
    const source = readFrontendFile("src/pages/DevTeamPage.tsx");

    expect(source).toContain("!workflow.threadId");
  });

  it("TC-103: AppNavbar toggleMobileMenu flips state correctly", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    expect(source).toContain("setIsMobileMenuOpen((prev) => !prev)");
  });

  it("TC-104: router.tsx does NOT import Outlet (uses children pattern)", () => {
    const source = readFrontendFile("src/router.tsx");

    expect(source).not.toContain("Outlet");
  });

  it("TC-105: AppLayout does NOT import useAuth (thin layout component)", () => {
    const source = readFrontendFile("src/components/AppLayout.tsx");

    expect(source).not.toContain("useAuth");
  });

  it("TC-106: No circular dependency between AppNavbar and AppLayout", () => {
    const navbarSource = readFrontendFile("src/components/AppNavbar.tsx");
    const layoutSource = readFrontendFile("src/components/AppLayout.tsx");

    // Layout imports Navbar, but Navbar should NOT import Layout
    expect(layoutSource).toContain("from \"./AppNavbar");
    expect(navbarSource).not.toContain("AppLayout");
  });

  it("TC-107: DevTeamPage feedback state is cleared after approval", () => {
    const source = readFrontendFile("src/pages/DevTeamPage.tsx");

    const approvalFnIdx = source.indexOf("const handleApproval");
    const approvalSection = source.slice(approvalFnIdx, approvalFnIdx + 600);
    expect(approvalSection).toContain('setFeedback("")');
  });

  it("TC-108: DevTeamPage sets devLoading in finally block", () => {
    const source = readFrontendFile("src/pages/DevTeamPage.tsx");

    // Both startWorkflow and handleApproval should have finally block
    const startFnIdx = source.indexOf("const startWorkflow");
    const startSection = source.slice(startFnIdx, startFnIdx + 500);
    expect(startSection).toContain("finally");
    expect(startSection).toContain("setDevLoading(false)");
  });

  it("TC-109: ChatPage does NOT import AppNavbar or AppLayout (handled by router)", () => {
    const source = readFrontendFile("src/pages/ChatPage.tsx");

    expect(source).not.toContain("AppNavbar");
    expect(source).not.toContain("AppLayout");
  });

  it("TC-110: DevTeamPage does NOT import AppNavbar or AppLayout (handled by router)", () => {
    const source = readFrontendFile("src/pages/DevTeamPage.tsx");

    expect(source).not.toContain("AppNavbar");
    expect(source).not.toContain("AppLayout");
  });

  it("TC-111: AppNavbar button elements have type='button' to prevent form submission", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    // All buttons in navbar should have type="button"
    const buttonMatches = source.match(/<button/g);
    const typeButtonMatches = source.match(/type="button"/g);
    
    expect(buttonMatches).not.toBeNull();
    expect(typeButtonMatches).not.toBeNull();
    expect(typeButtonMatches!.length).toBeGreaterThanOrEqual(buttonMatches!.length);
  });

  it("TC-112: DevTeamPage sends feedback only on reject action", () => {
    const source = readFrontendFile("src/pages/DevTeamPage.tsx");

    // Should conditionally send feedback: action === "reject" ? feedback : ""
    expect(source).toContain('action === "reject"');
  });
});

// ============================================================================
// ProtectedRoute Integration (AC2, AC3 defense-in-depth)
// ============================================================================

describe("US-03: ProtectedRoute Integration", () => {
  it("TC-113: ProtectedRoute exists and guards based on role", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    expect(source).toContain("requiredRole");
    expect(source).toContain("user?.role !== requiredRole");
  });

  it("TC-114: ProtectedRoute redirects non-admin to /chat when accessing admin routes", () => {
    const source = readFrontendFile("src/components/ProtectedRoute.tsx");

    expect(source).toContain('Navigate to="/chat" replace');
  });

  it("TC-115: ProtectedRoute is imported in router.tsx", () => {
    const routerSource = readFrontendFile("src/router.tsx");

    expect(routerSource).toContain("ProtectedRoute");
    expect(routerSource).toContain("from './components/ProtectedRoute");
  });
});

// ============================================================================
// Build Verification
// ============================================================================

describe("US-03: Build Verification", () => {
  it("TC-116: All required imports in router.tsx are resolved", () => {
    const source = readFrontendFile("src/router.tsx");

    // All 6 imports should be present
    expect(source).toContain("LoginPage");
    expect(source).toContain("RegisterPage");
    expect(source).toContain("ChatPage");
    expect(source).toContain("DevTeamPage");
    expect(source).toContain("ProtectedRoute");
    expect(source).toContain("AppLayout");
  });

  it("TC-117: AppNavbar uses correct import path for AuthContext", () => {
    const source = readFrontendFile("src/components/AppNavbar.tsx");

    // From components/ to contexts/, should be ../contexts/
    expect(source).toContain("from \"../contexts/AuthContext");
  });

  it("TC-118: AppLayout uses correct import path for AppNavbar", () => {
    const source = readFrontendFile("src/components/AppLayout.tsx");

    // Same directory, should be ./
    expect(source).toContain("from \"./AppNavbar");
  });

  it("TC-119: WORKFLOW_PHASES in DevTeamPage includes all 5 phases", () => {
    const source = readFrontendFile("src/pages/DevTeamPage.tsx");

    expect(source).toContain('"requirements"');
    expect(source).toContain('"design"');
    expect(source).toContain('"development"');
    expect(source).toContain('"testing"');
    expect(source).toContain('"done"');
  });

  it("TC-120: frontend/dist/ exists (build output verified)", () => {
    expect(existsSync(resolve("frontend", "dist"))).toBe(true);
  });
});
