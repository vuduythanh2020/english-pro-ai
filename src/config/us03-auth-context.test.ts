/**
 * Unit Tests cho US-03: Auth Context và API Client
 * ==============================================================================
 * Verify rằng frontend đã thiết lập Auth Context, API Client, và kết nối
 * Login/Register pages đúng cách.
 *
 * Approach: Structural testing (đọc source files bằng fs, verify cấu trúc).
 * Lý do: Backend vitest không có jsdom, nên không thể render React components.
 *
 * Test Coverage:
 * - AC1: client.ts — API client với auto Bearer token, response format parsing
 * - AC2: auth.api.ts — registerApi, loginApi, getMeApi
 * - AC3: AuthContext.tsx — Context cung cấp user, token, isAuthenticated, isLoading, login, register, logout
 * - AC4: Login/Register pages kết nối AuthContext
 * - AC5: Token verification on mount
 * - AC6: AuthProvider wrap trong App.tsx
 * - Adversarial: security, architecture, edge cases
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
 * Trích xuất body của một interface/type từ source code.
 * Tìm "interface <name>" hoặc "type <name>", lấy nội dung {} bên trong.
 */
function extractInterfaceBody(source: string, interfaceName: string): string {
  const pattern = new RegExp(`(?:interface|type)\\s+${interfaceName}[^{]*\\{`);
  const match = source.match(pattern);
  if (!match) return "";
  const startIdx = match.index! + match[0].length;
  let braceCount = 1;
  let i = startIdx;
  while (i < source.length && braceCount > 0) {
    if (source[i] === "{") braceCount++;
    if (source[i] === "}") braceCount--;
    i++;
  }
  return source.slice(startIdx, i - 1);
}

// ============================================================================
// AC1: API Client — frontend/src/api/client.ts
// ============================================================================

describe("US-03 AC1: API Client (client.ts)", () => {
  it("TC-01: client.ts file exists", () => {
    expect(frontendFileExists("src/api/client.ts")).toBe(true);
  });

  it("TC-02: exports apiClient object with get, post, put, delete methods", () => {
    const source = readFrontendFile("src/api/client.ts");

    expect(source).toContain("export { apiClient");
    expect(source).toContain("get:");
    expect(source).toContain("post:");
    expect(source).toContain("put:");
    expect(source).toContain("delete:");
  });

  it("TC-03: exports ApiError class", () => {
    const source = readFrontendFile("src/api/client.ts");

    expect(source).toContain("class ApiError extends Error");
    expect(source).toContain("export { apiClient, ApiError");
  });

  it("TC-04: exports TOKEN_KEY constant with value 'auth_token'", () => {
    const source = readFrontendFile("src/api/client.ts");

    expect(source).toContain('TOKEN_KEY');
    expect(source).toContain('"auth_token"');
    expect(source).toContain("export { apiClient, ApiError, TOKEN_KEY");
  });

  it("TC-05: uses import.meta.env.VITE_API_BASE_URL with empty string fallback", () => {
    const source = readFrontendFile("src/api/client.ts");

    expect(source).toContain("import.meta.env.VITE_API_BASE_URL");
    // Fallback should be empty string for Vite proxy
    expect(source).toMatch(/VITE_API_BASE_URL\s*\|\|\s*""/);
  });

  it("TC-06: auto-attaches Authorization Bearer header from localStorage", () => {
    const source = readFrontendFile("src/api/client.ts");

    expect(source).toContain("localStorage.getItem(TOKEN_KEY)");
    expect(source).toContain("Authorization");
    expect(source).toContain("Bearer");
  });

  it("TC-07: sets Content-Type application/json by default", () => {
    const source = readFrontendFile("src/api/client.ts");

    expect(source).toContain('"Content-Type": "application/json"');
  });

  it("TC-08: handles backend response format { success, data, error }", () => {
    const source = readFrontendFile("src/api/client.ts");

    expect(source).toContain("!body.success");
    expect(source).toContain(".data");
    expect(source).toContain("throw new ApiError");
  });

  it("TC-09: defines ApiResponse, ApiSuccessResponse, ApiErrorResponse types", () => {
    const source = readFrontendFile("src/api/client.ts");

    expect(source).toContain("interface ApiSuccessResponse");
    expect(source).toContain("interface ApiErrorResponse");
    expect(source).toContain("type ApiResponse");
    expect(source).toContain("success: true");
    expect(source).toContain("success: false");
  });

  it("TC-10: ApiError has status and optional code properties", () => {
    const source = readFrontendFile("src/api/client.ts");

    expect(source).toContain("status: number");
    expect(source).toMatch(/code.*string/);
  });

  it("TC-11: uses fetch() native, not axios", () => {
    const source = readFrontendFile("src/api/client.ts");

    expect(source).toContain("fetch(url");
    expect(source).not.toContain("axios");
    expect(source).not.toContain("from 'axios'");
  });

  it("TC-12: constructs URL with BASE_URL + endpoint", () => {
    const source = readFrontendFile("src/api/client.ts");

    expect(source).toContain("BASE_URL");
    expect(source).toMatch(/`\$\{BASE_URL\}\$\{endpoint\}`/);
  });

  it("TC-13: POST method serializes body with JSON.stringify", () => {
    const source = readFrontendFile("src/api/client.ts");

    expect(source).toContain("JSON.stringify(data)");
  });

  it("TC-14: exports type definitions for external use", () => {
    const source = readFrontendFile("src/api/client.ts");

    expect(source).toContain("export type { ApiSuccessResponse, ApiErrorResponse, ApiResponse }");
  });
});

// ============================================================================
// AC2: Auth API Functions — frontend/src/api/auth.api.ts
// ============================================================================

describe("US-03 AC2: Auth API Functions (auth.api.ts)", () => {
  it("TC-15: auth.api.ts file exists", () => {
    expect(frontendFileExists("src/api/auth.api.ts")).toBe(true);
  });

  it("TC-16: imports apiClient from client.ts", () => {
    const source = readFrontendFile("src/api/auth.api.ts");

    expect(source).toContain('import { apiClient }');
    expect(source).toContain('from "./client');
  });

  it("TC-17: exports registerApi function targeting POST /api/auth/register", () => {
    const source = readFrontendFile("src/api/auth.api.ts");

    expect(source).toContain("function registerApi");
    expect(source).toContain('"/api/auth/register"');
    expect(source).toContain("apiClient.post");
    expect(source).toContain("export { registerApi");
  });

  it("TC-18: exports loginApi function targeting POST /api/auth/login", () => {
    const source = readFrontendFile("src/api/auth.api.ts");

    expect(source).toContain("function loginApi");
    expect(source).toContain('"/api/auth/login"');
    expect(source).toContain("apiClient.post");
    expect(source).toContain("loginApi");
  });

  it("TC-19: exports getMeApi function targeting GET /api/auth/me", () => {
    const source = readFrontendFile("src/api/auth.api.ts");

    expect(source).toContain("function getMeApi");
    expect(source).toContain('"/api/auth/me"');
    expect(source).toContain("apiClient.get");
    expect(source).toContain("getMeApi");
  });

  it("TC-20: defines UserProfile interface matching backend toUserResponse", () => {
    const source = readFrontendFile("src/api/auth.api.ts");

    expect(source).toContain("interface UserProfile");
    expect(source).toContain("id: string");
    expect(source).toContain("email: string");
    expect(source).toContain("name: string");
    expect(source).toContain("profession: string | null");
    expect(source).toContain("englishLevel: string | null");
    expect(source).toContain("goals: string[] | null");
    expect(source).toContain("createdAt: string");
  });

  it("TC-21: defines RegisterRequest with required and optional fields", () => {
    const source = readFrontendFile("src/api/auth.api.ts");

    // RegisterRequest must include password (either direct or via extend)
    expect(source).toMatch(/(?:interface|type)\s+RegisterRequest/);
    expect(source).toMatch(/email:\s*string/);
    expect(source).toMatch(/name:\s*string/);
    // Optional fields
    expect(source).toContain("profession?:");
    expect(source).toContain("englishLevel?:");
    expect(source).toContain("goals?:");
  });

  it("TC-22: defines LoginRequest with email and password", () => {
    const source = readFrontendFile("src/api/auth.api.ts");

    expect(source).toMatch(/(?:interface|type)\s+LoginRequest/);
  });

  it("TC-23: defines response types matching backend format", () => {
    const source = readFrontendFile("src/api/auth.api.ts");

    expect(source).toContain("interface RegisterResponse");
    expect(source).toContain("interface LoginResponse");
    expect(source).toContain("token: string");
    expect(source).toContain("interface GetMeResponse");
  });

  it("TC-24: exports UserProfile type for use by AuthContext", () => {
    const source = readFrontendFile("src/api/auth.api.ts");

    expect(source).toContain("export type { UserProfile");
  });

  it("TC-25: UserProfile interface does NOT contain password/password_hash fields (security)", () => {
    const source = readFrontendFile("src/api/auth.api.ts");

    // Extract ONLY the UserProfile interface body, not the whole file
    const userProfileBody = extractInterfaceBody(source, "UserProfile");
    expect(userProfileBody.length).toBeGreaterThan(0);

    // UserProfile must NOT have password-related fields
    expect(userProfileBody).not.toContain("password_hash");
    expect(userProfileBody).not.toContain("passwordHash");
    expect(userProfileBody).not.toContain("password");
  });

  it("TC-26: registerApi param type is RegisterRequest", () => {
    const source = readFrontendFile("src/api/auth.api.ts");

    expect(source).toMatch(/registerApi\s*\(\s*data:\s*RegisterRequest\s*\)/);
  });

  it("TC-27: loginApi param type is LoginRequest", () => {
    const source = readFrontendFile("src/api/auth.api.ts");

    expect(source).toMatch(/loginApi\s*\(\s*data:\s*LoginRequest\s*\)/);
  });

  it("TC-28: getMeApi takes no parameters", () => {
    const source = readFrontendFile("src/api/auth.api.ts");

    expect(source).toMatch(/getMeApi\s*\(\s*\)/);
  });
});

// ============================================================================
// AC3: AuthContext — frontend/src/contexts/AuthContext.tsx
// ============================================================================

describe("US-03 AC3: AuthContext (AuthContext.tsx)", () => {
  it("TC-29: AuthContext.tsx file exists", () => {
    expect(frontendFileExists("src/contexts/AuthContext.tsx")).toBe(true);
  });

  it("TC-30: imports React hooks (createContext, useContext, useState, useEffect, useCallback)", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("createContext");
    expect(source).toContain("useContext");
    expect(source).toContain("useState");
    expect(source).toContain("useEffect");
    expect(source).toContain("useCallback");
  });

  it("TC-31: imports auth API functions", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("registerApi");
    expect(source).toContain("loginApi");
    expect(source).toContain("getMeApi");
    expect(source).toContain('from "../api/auth.api');
  });

  it("TC-32: imports TOKEN_KEY from client.ts", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("TOKEN_KEY");
    expect(source).toContain('from "../api/client');
  });

  it("TC-33: imports UserProfile type", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("UserProfile");
  });

  it("TC-34: defines AuthContextType interface with all required fields", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("interface AuthContextType");
    expect(source).toContain("user: UserProfile | null");
    expect(source).toContain("token: string | null");
    expect(source).toContain("isAuthenticated: boolean");
    expect(source).toContain("isLoading: boolean");
    expect(source).toContain("login:");
    expect(source).toContain("register:");
    expect(source).toContain("logout:");
  });

  it("TC-35: login method signature is (email, password) => Promise<void>", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toMatch(/login:\s*\(\s*email:\s*string,\s*password:\s*string\s*\)\s*=>\s*Promise<void>/);
  });

  it("TC-36: register method accepts object with required and optional fields", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toMatch(/register:\s*\(\s*data:/);
  });

  it("TC-37: logout method returns void (synchronous)", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toMatch(/logout:\s*\(\s*\)\s*=>\s*void/);
  });

  it("TC-38: creates context with null default (forces AuthProvider usage)", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toMatch(/createContext<AuthContextType\s*\|\s*null>\s*\(\s*null\s*\)/);
  });

  it("TC-39: exports AuthProvider component", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("function AuthProvider");
    expect(source).toContain("export { AuthProvider");
  });

  it("TC-40: exports useAuth custom hook", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("function useAuth");
    expect(source).toContain("useAuth");
  });

  it("TC-41: useAuth throws Error when used outside AuthProvider", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("throw new Error");
    expect(source).toContain("useAuth");
    expect(source).toContain("AuthProvider");
  });

  it("TC-42: state has user (null default), token (null default), isLoading (true default)", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toMatch(/useState<UserProfile\s*\|\s*null>\s*\(\s*null\s*\)/);
    expect(source).toMatch(/useState<string\s*\|\s*null>\s*\(\s*null\s*\)/);
    // isLoading defaults to true — critical for preventing flash of login page
    expect(source).toMatch(/useState\s*\(\s*true\s*\)/);
  });

  it("TC-43: isAuthenticated is computed from user and token", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toMatch(/isAuthenticated\s*=\s*user\s*!==\s*null\s*&&\s*token\s*!==\s*null/);
  });

  it("TC-44: AuthProvider renders Context.Provider wrapping children", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("<AuthContext.Provider");
    expect(source).toContain("value={value}");
    expect(source).toContain("{children}");
    expect(source).toContain("</AuthContext.Provider>");
  });

  it("TC-45: exports AuthContextType type", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("export type { AuthContextType }");
  });
});

// ============================================================================
// AC4: Login/Register kết nối AuthContext + Token persistence
// ============================================================================

describe("US-03 AC4: Login flow — token persistence and user state", () => {
  it("TC-46: login function calls loginApi", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("loginApi({ email, password })");
  });

  it("TC-47: login function saves token to localStorage", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("localStorage.setItem(TOKEN_KEY");
    expect(source).toContain("saveToken(response.token)");
  });

  it("TC-48: login function sets user state from response", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("setUser(response.user)");
  });

  it("TC-49: register function calls registerApi first, then loginApi for auto-login", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("await registerApi(data)");
    expect(source).toContain("await loginApi(");

    // Find register function body and ensure both calls are inside it
    const registerFnStart = source.indexOf("const register = useCallback");
    expect(registerFnStart).toBeGreaterThan(-1);

    // registerApi should appear before loginApi within the register function
    const afterRegisterFn = source.slice(registerFnStart);
    const registerApiIdx = afterRegisterFn.indexOf("registerApi");
    const loginApiIdx = afterRegisterFn.indexOf("loginApi");
    expect(registerApiIdx).toBeLessThan(loginApiIdx);
  });

  it("TC-50: register auto-login uses same email/password from register data", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("data.email");
    expect(source).toContain("data.password");
  });

  it("TC-51: logout clears token from localStorage", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("localStorage.removeItem(TOKEN_KEY)");
  });

  it("TC-52: logout resets user state to null", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    const logoutStart = source.indexOf("const logout = useCallback");
    expect(logoutStart).toBeGreaterThan(-1);

    // Find the area after logout declaration
    const afterLogout = source.slice(logoutStart, logoutStart + 300);
    expect(afterLogout).toContain("clearToken()");
    expect(afterLogout).toContain("setUser(null)");
  });

  it("TC-53: logout resets token state to null", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    // clearToken should set token to null
    expect(source).toContain("setToken(null)");
  });
});

describe("US-03 AC4: LoginPage kết nối AuthContext", () => {
  it("TC-54: LoginPage imports useAuth from AuthContext", () => {
    const source = readFrontendFile("src/pages/LoginPage.tsx");

    expect(source).toContain("useAuth");
    expect(source).toContain('from "../contexts/AuthContext');
  });

  it("TC-55: LoginPage imports ApiError from client.ts", () => {
    const source = readFrontendFile("src/pages/LoginPage.tsx");

    expect(source).toContain("ApiError");
    expect(source).toContain('from "../api/client');
  });

  it("TC-56: LoginPage uses useNavigate for redirect after login", () => {
    const source = readFrontendFile("src/pages/LoginPage.tsx");

    expect(source).toContain("useNavigate");
    expect(source).toContain('navigate("/chat")');
  });

  it("TC-57: LoginPage calls login() from AuthContext on form submit", () => {
    const source = readFrontendFile("src/pages/LoginPage.tsx");

    expect(source).toContain("const { login } = useAuth()");
    expect(source).toContain("await login(");
  });

  it("TC-58: LoginPage has error state for displaying error messages", () => {
    const source = readFrontendFile("src/pages/LoginPage.tsx");

    expect(source).toContain("const [error, setError]");
    expect(source).toContain("setError(");
  });

  it("TC-59: LoginPage has isSubmitting state for loading indicator", () => {
    const source = readFrontendFile("src/pages/LoginPage.tsx");

    expect(source).toContain("const [isSubmitting, setIsSubmitting]");
    expect(source).toContain("setIsSubmitting(true)");
    expect(source).toContain("setIsSubmitting(false)");
  });

  it("TC-60: LoginPage handles ApiError specifically", () => {
    const source = readFrontendFile("src/pages/LoginPage.tsx");

    expect(source).toContain("instanceof ApiError");
    expect(source).toContain("err.message");
  });

  it("TC-61: LoginPage handles non-API errors (network errors)", () => {
    const source = readFrontendFile("src/pages/LoginPage.tsx");

    expect(source).toContain("Không thể kết nối server");
  });

  it("TC-62: LoginPage validates required fields before submit", () => {
    const source = readFrontendFile("src/pages/LoginPage.tsx");

    expect(source).toContain("!email.trim()");
    expect(source).toContain("!password.trim()");
  });

  it("TC-63: LoginPage disables inputs during submission", () => {
    const source = readFrontendFile("src/pages/LoginPage.tsx");

    expect(source).toContain("disabled={isSubmitting}");
  });

  it("TC-64: LoginPage shows loading text on button during submission", () => {
    const source = readFrontendFile("src/pages/LoginPage.tsx");

    expect(source).toContain("Đang đăng nhập");
  });
});

describe("US-03 AC4: RegisterPage kết nối AuthContext", () => {
  it("TC-65: RegisterPage imports useAuth from AuthContext", () => {
    const source = readFrontendFile("src/pages/RegisterPage.tsx");

    expect(source).toContain("useAuth");
    expect(source).toContain('from "../contexts/AuthContext');
  });

  it("TC-66: RegisterPage imports ApiError from client.ts", () => {
    const source = readFrontendFile("src/pages/RegisterPage.tsx");

    expect(source).toContain("ApiError");
    expect(source).toContain('from "../api/client');
  });

  it("TC-67: RegisterPage calls register() from AuthContext on form submit", () => {
    const source = readFrontendFile("src/pages/RegisterPage.tsx");

    expect(source).toContain("const { register } = useAuth()");
    expect(source).toContain("await register(");
  });

  it("TC-68: RegisterPage navigates to /chat after successful register", () => {
    const source = readFrontendFile("src/pages/RegisterPage.tsx");

    expect(source).toContain("useNavigate");
    expect(source).toContain('navigate("/chat")');
  });

  it("TC-69: RegisterPage validates required fields (name, email, password)", () => {
    const source = readFrontendFile("src/pages/RegisterPage.tsx");

    expect(source).toContain("!name.trim()");
    expect(source).toContain("!email.trim()");
    expect(source).toContain("!password.trim()");
  });

  it("TC-70: RegisterPage validates password minimum 8 characters", () => {
    const source = readFrontendFile("src/pages/RegisterPage.tsx");

    expect(source).toContain("password.length < 8");
    expect(source).toContain("8 ký tự");
  });

  it("TC-71: RegisterPage passes name, email, password to register function", () => {
    const source = readFrontendFile("src/pages/RegisterPage.tsx");

    // In the register call, should pass object with these fields
    expect(source).toContain("name:");
    expect(source).toContain("email:");
  });

  it("TC-72: RegisterPage handles ApiError and non-API errors", () => {
    const source = readFrontendFile("src/pages/RegisterPage.tsx");

    expect(source).toContain("instanceof ApiError");
    expect(source).toContain("Không thể kết nối server");
  });

  it("TC-73: RegisterPage has isSubmitting state and disabled inputs", () => {
    const source = readFrontendFile("src/pages/RegisterPage.tsx");

    expect(source).toContain("isSubmitting");
    expect(source).toContain("disabled={isSubmitting}");
  });
});

// ============================================================================
// AC5: Token verification on mount
// ============================================================================

describe("US-03 AC5: Token verification on mount", () => {
  it("TC-74: AuthContext has useEffect for mount-time token verification", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("useEffect(");
    expect(source).toContain("verifyExistingToken");
  });

  it("TC-75: mount effect checks localStorage for saved token", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain('localStorage.getItem(TOKEN_KEY)');
  });

  it("TC-76: if no saved token, sets isLoading to false immediately", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("if (!savedToken)");
    expect(source).toContain("setIsLoading(false)");
  });

  it("TC-77: if saved token exists, calls getMeApi to verify", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("getMeApi()");
  });

  it("TC-78: on getMeApi success, sets user from response", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("setUser(response.user)");
  });

  it("TC-79: on getMeApi failure, clears token and sets user to null (graceful degradation)", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    const catchIndex = source.indexOf("catch");
    expect(catchIndex).toBeGreaterThan(-1);

    const afterCatch = source.slice(catchIndex, catchIndex + 300);
    expect(afterCatch).toContain("localStorage.removeItem");
    expect(afterCatch).toContain("setToken(null)");
    expect(afterCatch).toContain("setUser(null)");
  });

  it("TC-80: always sets isLoading=false in finally block (success or failure)", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("finally");
    const finallyIndex = source.indexOf("finally");
    const afterFinally = source.slice(finallyIndex, finallyIndex + 100);
    expect(afterFinally).toContain("setIsLoading(false)");
  });

  it("TC-81: useEffect has empty dependency array (runs only on mount)", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("verifyExistingToken()");
    const effectBlock = source.slice(
      source.indexOf("useEffect("),
      source.indexOf("verifyExistingToken();") + 100
    );
    expect(effectBlock).toContain("}, [])");
  });

  it("TC-82: optimistically sets token in state before verifying", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source).toContain("setToken(savedToken)");
  });
});

// ============================================================================
// AC6: AuthProvider wrap trong App.tsx
// ============================================================================

describe("US-03 AC6: AuthProvider wrapped in App.tsx", () => {
  it("TC-83: App.tsx imports AuthProvider from contexts/AuthContext", () => {
    const source = readFrontendFile("src/App.tsx");

    expect(source).toContain("AuthProvider");
    expect(source).toContain('from "./contexts/AuthContext');
  });

  it("TC-84: App.tsx wraps AppRoutes inside AuthProvider", () => {
    const source = readFrontendFile("src/App.tsx");

    expect(source).toContain("<AuthProvider>");
    expect(source).toContain("</AuthProvider>");
    expect(source).toContain("<AppRoutes");

    const providerStart = source.indexOf("<AuthProvider>");
    const routesStart = source.indexOf("<AppRoutes");
    const providerEnd = source.indexOf("</AuthProvider>");

    expect(providerStart).toBeLessThan(routesStart);
    expect(routesStart).toBeLessThan(providerEnd);
  });

  it("TC-85: AuthProvider is NOT in main.tsx (should be in App.tsx)", () => {
    const mainSource = readFrontendFile("src/main.tsx");

    expect(mainSource).not.toContain("AuthProvider");
  });

  it("TC-86: BrowserRouter wraps AuthProvider (main.tsx → App.tsx hierarchy)", () => {
    const mainSource = readFrontendFile("src/main.tsx");
    expect(mainSource).toContain("BrowserRouter");
    expect(mainSource).toContain("<App");

    const appSource = readFrontendFile("src/App.tsx");
    expect(appSource).toContain("<AuthProvider>");
  });

  it("TC-87: App.tsx still imports AppRoutes from router.tsx", () => {
    const source = readFrontendFile("src/App.tsx");

    expect(source).toContain("AppRoutes");
    expect(source).toContain('from "./router');
  });

  it("TC-88: App.tsx has default export (compatible with main.tsx import)", () => {
    const source = readFrontendFile("src/App.tsx");

    expect(source).toContain("export default App");
  });
});

// ============================================================================
// Adversarial & Edge Case Tests
// ============================================================================

describe("US-03 Adversarial: Security & Robustness", () => {
  it("TC-89: client.ts does NOT hardcode any tokens or credentials", () => {
    const source = readFrontendFile("src/api/client.ts");

    expect(source).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(source).not.toContain("password123");
  });

  it("TC-90: auth.api.ts endpoints match backend routes exactly", () => {
    const source = readFrontendFile("src/api/auth.api.ts");

    expect(source).toContain("/api/auth/register");
    expect(source).toContain("/api/auth/login");
    expect(source).toContain("/api/auth/me");

    expect(source).not.toContain("/api/auth/signup");
    expect(source).not.toContain("/api/auth/signin");
    expect(source).not.toContain("/api/auth/profile");
  });

  it("TC-91: AuthContext does NOT catch errors in login/register (lets pages handle UI)", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    // Find login function body — it should NOT have try-catch
    const loginStart = source.indexOf("const login = useCallback");
    expect(loginStart).toBeGreaterThan(-1);
    
    // Get the login function body (up to the next useCallback or reasonable boundary)
    const afterLogin = source.slice(loginStart, loginStart + 300);
    // Login body is short and should not contain try/catch
    const loginBodyEnd = afterLogin.indexOf("}, [");
    const loginBody = afterLogin.slice(0, loginBodyEnd);
    expect(loginBody).not.toContain("try {");
    expect(loginBody).not.toContain("catch");
  });

  it("TC-92: Token key constant is shared between client.ts and AuthContext", () => {
    const clientSource = readFrontendFile("src/api/client.ts");
    const contextSource = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(clientSource).toContain('TOKEN_KEY = "auth_token"');
    expect(contextSource).toContain("TOKEN_KEY");
    expect(contextSource).toContain('from "../api/client');
  });

  it("TC-93: No circular dependencies between api/ and contexts/", () => {
    const clientSource = readFrontendFile("src/api/client.ts");
    const authApiSource = readFrontendFile("src/api/auth.api.ts");

    expect(clientSource).not.toContain("from '../contexts");
    expect(clientSource).not.toContain('from "../contexts');
    expect(authApiSource).not.toContain("from '../contexts");
    expect(authApiSource).not.toContain('from "../contexts');
  });

  it("TC-94: Login/Register pages use preventDefault on form submit", () => {
    const loginSource = readFrontendFile("src/pages/LoginPage.tsx");
    const registerSource = readFrontendFile("src/pages/RegisterPage.tsx");

    expect(loginSource).toContain("e.preventDefault()");
    expect(registerSource).toContain("e.preventDefault()");
  });

  it("TC-95: LoginPage trims email before sending to API", () => {
    const source = readFrontendFile("src/pages/LoginPage.tsx");

    expect(source).toContain("email.trim()");
  });

  it("TC-96: RegisterPage trims name and email before sending to API", () => {
    const source = readFrontendFile("src/pages/RegisterPage.tsx");

    expect(source).toContain("name.trim()");
    expect(source).toContain("email.trim()");
  });

  it("TC-97: apiClient methods specify correct HTTP methods", () => {
    const source = readFrontendFile("src/api/client.ts");

    expect(source).toContain('method: "GET"');
    expect(source).toContain('method: "POST"');
    expect(source).toContain('method: "PUT"');
    expect(source).toContain('method: "DELETE"');
  });

  it("TC-98: Auth API functions are properly typed with generics", () => {
    const source = readFrontendFile("src/api/auth.api.ts");

    expect(source).toContain("apiClient.post<RegisterResponse>");
    expect(source).toContain("apiClient.post<LoginResponse>");
    expect(source).toContain("apiClient.get<GetMeResponse>");
  });

  it("TC-99: client.ts handles case where localStorage token is null (no token)", () => {
    const source = readFrontendFile("src/api/client.ts");

    expect(source).toContain("if (token)");
  });
});

// ============================================================================
// Consistency with backend API response types
// ============================================================================

describe("US-03: Frontend-Backend Response Type Consistency", () => {
  it("TC-100: RegisterResponse matches backend POST /register → { user }", () => {
    const feSource = readFrontendFile("src/api/auth.api.ts");

    const registerRespBody = extractInterfaceBody(feSource, "RegisterResponse");
    expect(registerRespBody.length).toBeGreaterThan(0);
    expect(registerRespBody).toContain("user: UserProfile");
    // Should NOT contain token (register does not return token)
    expect(registerRespBody).not.toContain("token");
  });

  it("TC-101: LoginResponse matches backend POST /login → { token, user }", () => {
    const feSource = readFrontendFile("src/api/auth.api.ts");

    const loginRespBody = extractInterfaceBody(feSource, "LoginResponse");
    expect(loginRespBody.length).toBeGreaterThan(0);
    expect(loginRespBody).toContain("token: string");
    expect(loginRespBody).toContain("user: UserProfile");
  });

  it("TC-102: GetMeResponse matches backend GET /me → { user }", () => {
    const feSource = readFrontendFile("src/api/auth.api.ts");

    const getMeRespBody = extractInterfaceBody(feSource, "GetMeResponse");
    expect(getMeRespBody.length).toBeGreaterThan(0);
    expect(getMeRespBody).toContain("user: UserProfile");
  });

  it("TC-103: apiClient.post sends body as JSON string", () => {
    const source = readFrontendFile("src/api/client.ts");

    expect(source).toContain("body: JSON.stringify(data)");
  });

  it("TC-104: apiClient.get does NOT send body", () => {
    const source = readFrontendFile("src/api/client.ts");

    const getMethod = source.match(/get:\s*<T>\([\s\S]*?\)/);
    expect(getMethod).not.toBeNull();
    const getStr = getMethod![0];
    expect(getStr).not.toContain("body:");
  });
});

// ============================================================================
// Dependency flow & Architecture
// ============================================================================

describe("US-03: Architecture — Dependency flow", () => {
  it("TC-105: Dependency chain: Pages → AuthContext → auth.api → client → fetch", () => {
    const loginSource = readFrontendFile("src/pages/LoginPage.tsx");
    const contextSource = readFrontendFile("src/contexts/AuthContext.tsx");
    const authApiSource = readFrontendFile("src/api/auth.api.ts");
    const clientSource = readFrontendFile("src/api/client.ts");

    expect(loginSource).toContain("useAuth");
    expect(contextSource).toContain('from "../api/auth.api');
    expect(authApiSource).toContain('from "./client');
    expect(clientSource).toContain("fetch(url");
  });

  it("TC-106: Pages do NOT import directly from auth.api.ts (only through AuthContext)", () => {
    const loginSource = readFrontendFile("src/pages/LoginPage.tsx");
    const registerSource = readFrontendFile("src/pages/RegisterPage.tsx");

    expect(loginSource).not.toContain("from '../api/auth.api");
    expect(loginSource).not.toContain('from "../api/auth.api');
    expect(registerSource).not.toContain("from '../api/auth.api");
    expect(registerSource).not.toContain('from "../api/auth.api');
  });

  it("TC-107: All new files use named exports (no default exports except App.tsx)", () => {
    const clientSource = readFrontendFile("src/api/client.ts");
    const authApiSource = readFrontendFile("src/api/auth.api.ts");
    const contextSource = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(clientSource).not.toContain("export default");
    expect(authApiSource).not.toContain("export default");
    expect(contextSource).not.toContain("export default");
  });
});

// ============================================================================
// Additional Adversarial Tests (Tester Agent)
// ============================================================================

describe("US-03 Adversarial: Additional security & edge cases", () => {
  it("TC-108: LoginPage clears error before re-submitting", () => {
    const source = readFrontendFile("src/pages/LoginPage.tsx");

    // Should setError("") at the beginning of handleSubmit
    const handleSubmitIdx = source.indexOf("handleSubmit");
    const afterSubmit = source.slice(handleSubmitIdx, handleSubmitIdx + 200);
    expect(afterSubmit).toContain('setError("")');
  });

  it("TC-109: RegisterPage clears error before re-submitting", () => {
    const source = readFrontendFile("src/pages/RegisterPage.tsx");

    const handleSubmitIdx = source.indexOf("handleSubmit");
    const afterSubmit = source.slice(handleSubmitIdx, handleSubmitIdx + 200);
    expect(afterSubmit).toContain('setError("")');
  });

  it("TC-110: LoginPage uses finally block to always reset isSubmitting", () => {
    const source = readFrontendFile("src/pages/LoginPage.tsx");

    expect(source).toContain("finally");
    const finallyIdx = source.indexOf("finally", source.indexOf("handleSubmit"));
    const afterFinally = source.slice(finallyIdx, finallyIdx + 100);
    expect(afterFinally).toContain("setIsSubmitting(false)");
  });

  it("TC-111: RegisterPage uses finally block to always reset isSubmitting", () => {
    const source = readFrontendFile("src/pages/RegisterPage.tsx");

    expect(source).toContain("finally");
    const finallyIdx = source.indexOf("finally", source.indexOf("handleSubmit"));
    const afterFinally = source.slice(finallyIdx, finallyIdx + 100);
    expect(afterFinally).toContain("setIsSubmitting(false)");
  });

  it("TC-112: client.ts response.json() is parsed before checking success", () => {
    const source = readFrontendFile("src/api/client.ts");

    // response.json() should come before !body.success check
    const jsonIdx = source.indexOf("response.json()");
    const successCheckIdx = source.indexOf("!body.success");
    expect(jsonIdx).toBeGreaterThan(-1);
    expect(successCheckIdx).toBeGreaterThan(jsonIdx);
  });

  it("TC-113: client.ts passes response.status to ApiError constructor", () => {
    const source = readFrontendFile("src/api/client.ts");

    expect(source).toContain("response.status");
    // ApiError should be constructed with (message, status)
    expect(source).toMatch(/new ApiError\([^)]*response\.status/);
  });

  it("TC-114: AuthContext saveToken and clearToken are consistent", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    // saveToken sets both localStorage and state
    expect(source).toContain("localStorage.setItem(TOKEN_KEY");
    expect(source).toContain("setToken(newToken)");

    // clearToken removes from localStorage and resets state
    expect(source).toContain("localStorage.removeItem(TOKEN_KEY)");
    expect(source).toContain("setToken(null)");
  });

  it("TC-115: ApiError sets name property to 'ApiError'", () => {
    const source = readFrontendFile("src/api/client.ts");

    expect(source).toContain('this.name = "ApiError"');
  });

  it("TC-116: client.ts handles errorResponse with fallback message", () => {
    const source = readFrontendFile("src/api/client.ts");

    // Should have fallback for when error field is missing
    expect(source).toContain('"Unknown error"');
  });

  it("TC-117: AuthContext value object provides all 7 required fields", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    // Find the value object construction
    const valueIdx = source.indexOf("const value: AuthContextType");
    expect(valueIdx).toBeGreaterThan(-1);
    const valueBlock = source.slice(valueIdx, valueIdx + 300);

    // All 7 fields must be present
    expect(valueBlock).toContain("user,");
    expect(valueBlock).toContain("token,");
    expect(valueBlock).toContain("isAuthenticated,");
    expect(valueBlock).toContain("isLoading,");
    expect(valueBlock).toContain("login,");
    expect(valueBlock).toContain("register,");
    expect(valueBlock).toContain("logout,");
  });

  it("TC-118: LoginPage form has onSubmit handler attached", () => {
    const source = readFrontendFile("src/pages/LoginPage.tsx");

    expect(source).toContain("onSubmit={handleSubmit}");
  });

  it("TC-119: RegisterPage form has onSubmit handler attached", () => {
    const source = readFrontendFile("src/pages/RegisterPage.tsx");

    expect(source).toContain("onSubmit={handleSubmit}");
  });

  it("TC-120: LoginPage and RegisterPage both have Link to each other", () => {
    const loginSource = readFrontendFile("src/pages/LoginPage.tsx");
    const registerSource = readFrontendFile("src/pages/RegisterPage.tsx");

    expect(loginSource).toContain('to="/register"');
    expect(registerSource).toContain('to="/login"');
  });
});
