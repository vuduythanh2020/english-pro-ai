/**
 * Unit Tests cho US-01: API Layer + AuthContext hỗ trợ Google OAuth
 * ==============================================================================
 * Verify rằng frontend đã thêm đúng:
 * - GoogleAuthRequest interface trong auth.api.ts
 * - googleAuthApi function trong auth.api.ts
 * - loginWithGoogle trong AuthContext.tsx
 *
 * Approach: Structural testing (đọc source files bằng fs, verify cấu trúc).
 * Lý do: Backend vitest không có jsdom, nên không thể render React components.
 *
 * Test Coverage:
 * - AC1: GoogleAuthRequest interface có trường `code: string`
 * - AC2: googleAuthApi function gọi apiClient.post("/api/auth/google", data)
 * - AC3: Export googleAuthApi và GoogleAuthRequest từ auth.api.ts
 * - AC4: loginWithGoogle trong AuthContextType interface
 * - AC5: loginWithGoogle implementation dùng useCallback, gọi googleAuthApi → saveToken → setUser
 * - AC6: loginWithGoogle exposed trong context value object
 * - AC7: Không ảnh hưởng flow hiện tại (login, register, logout) — regression check
 * - Adversarial: edge cases, security, consistency
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

/**
 * Trích xuất body của một interface từ source code.
 * Tìm "interface <name>" rồi lấy nội dung bên trong {}.
 */
function extractInterfaceBody(source: string, interfaceName: string): string {
  const pattern = new RegExp(`interface\\s+${interfaceName}[^{]*\\{`);
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

/**
 * Trích xuất body function bắt đầu từ useCallback cho đến khi gặp closing pattern.
 */
function extractUseCallbackBody(source: string, fnName: string): string {
  const pattern = new RegExp(`const\\s+${fnName}\\s*=\\s*useCallback`);
  const match = source.match(pattern);
  if (!match) return "";
  const startIdx = match.index!;
  // Tìm đến closing );  của useCallback
  // Tìm pattern }, [  sau startIdx
  const afterStart = source.slice(startIdx);
  const closingMatch = afterStart.match(/\},\s*\[/);
  if (!closingMatch) return afterStart.slice(0, 500);
  const endIdx = closingMatch.index! + closingMatch[0].length;
  // Tìm tiếp ]; hoặc ]);
  const remaining = afterStart.slice(endIdx);
  const bracketClose = remaining.indexOf("]");
  if (bracketClose === -1) return afterStart.slice(0, endIdx + 50);
  return afterStart.slice(0, endIdx + bracketClose + 2);
}

// ============================================================================
// AC1: GoogleAuthRequest interface — frontend/src/api/auth.api.ts
// ============================================================================

describe("US-01 AC1: GoogleAuthRequest interface", () => {
  it("TC-01: GoogleAuthRequest interface tồn tại trong auth.api.ts", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    expect(source).toContain("interface GoogleAuthRequest");
  });

  it("TC-02: GoogleAuthRequest có trường code: string", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    const body = extractInterfaceBody(source, "GoogleAuthRequest");
    expect(body.length).toBeGreaterThan(0);
    expect(body).toContain("code: string");
  });

  it("TC-03: GoogleAuthRequest CHỈ có trường code (không có redirectUri hoặc state)", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    const body = extractInterfaceBody(source, "GoogleAuthRequest");
    expect(body).not.toContain("redirectUri");
    expect(body).not.toContain("redirect_uri");
    expect(body).not.toContain("state");
    expect(body).not.toContain("scope");
  });

  it("TC-04: GoogleAuthRequest đặt riêng biệt (không inline) — nhất quán với RegisterRequest, LoginRequest", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    // Phải là interface declaration riêng, không phải inline type
    expect(source).toMatch(/interface\s+GoogleAuthRequest\s*\{/);
  });
});

// ============================================================================
// AC2: googleAuthApi function — frontend/src/api/auth.api.ts
// ============================================================================

describe("US-01 AC2: googleAuthApi function", () => {
  it("TC-05: googleAuthApi function tồn tại trong auth.api.ts", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    expect(source).toContain("function googleAuthApi");
  });

  it("TC-06: googleAuthApi nhận param type GoogleAuthRequest", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    expect(source).toMatch(/googleAuthApi\s*\(\s*data:\s*GoogleAuthRequest\s*\)/);
  });

  it("TC-07: googleAuthApi trả Promise<LoginResponse> (reuse LoginResponse)", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    expect(source).toMatch(/googleAuthApi\s*\([^)]*\)\s*:\s*Promise\s*<\s*LoginResponse\s*>/);
  });

  it("TC-08: googleAuthApi gọi apiClient.post với endpoint /api/auth/google", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    expect(source).toContain('apiClient.post<LoginResponse>("/api/auth/google"');
  });

  it("TC-09: googleAuthApi truyền data param vào apiClient.post", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    expect(source).toMatch(/apiClient\.post<LoginResponse>\s*\(\s*"\/api\/auth\/google"\s*,\s*data\s*\)/);
  });

  it("TC-10: googleAuthApi KHÔNG tạo LoginResponse mới (reuse type hiện có)", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    const loginResponseDeclarations = source.match(/interface\s+LoginResponse/g);
    expect(loginResponseDeclarations).toHaveLength(1);
  });

  it("TC-11: googleAuthApi pattern giống loginApi (cùng dùng apiClient.post<LoginResponse>)", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    expect(source).toMatch(/function\s+loginApi[\s\S]*?apiClient\.post<LoginResponse>/);
    expect(source).toMatch(/function\s+googleAuthApi[\s\S]*?apiClient\.post<LoginResponse>/);
  });
});

// ============================================================================
// AC3: Export googleAuthApi và GoogleAuthRequest từ auth.api.ts
// ============================================================================

describe("US-01 AC3: Exports từ auth.api.ts", () => {
  it("TC-12: googleAuthApi được export (named export)", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    expect(source).toMatch(/export\s*\{[^}]*googleAuthApi[^}]*\}/);
  });

  it("TC-13: GoogleAuthRequest type được export", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    expect(source).toMatch(/export\s+type\s*\{[^}]*GoogleAuthRequest[^}]*\}/);
  });

  it("TC-14: Existing exports vẫn còn — registerApi, loginApi, getMeApi", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    const exportBlock = source.match(/export\s*\{([^}]+)\}/);
    expect(exportBlock).not.toBeNull();
    const exportedNames = exportBlock![1];
    expect(exportedNames).toContain("registerApi");
    expect(exportedNames).toContain("loginApi");
    expect(exportedNames).toContain("getMeApi");
  });

  it("TC-15: Existing type exports vẫn còn — UserProfile, RegisterRequest, LoginRequest, LoginResponse, GetMeResponse", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    const typeExportBlock = source.match(/export\s+type\s*\{([^}]+)\}/);
    expect(typeExportBlock).not.toBeNull();
    const exportedTypes = typeExportBlock![1];
    expect(exportedTypes).toContain("UserProfile");
    expect(exportedTypes).toContain("RegisterRequest");
    expect(exportedTypes).toContain("LoginRequest");
    expect(exportedTypes).toContain("LoginResponse");
    expect(exportedTypes).toContain("GetMeResponse");
  });
});

// ============================================================================
// AC4: loginWithGoogle trong AuthContextType interface
// ============================================================================

describe("US-01 AC4: loginWithGoogle trong AuthContextType interface", () => {
  it("TC-16: AuthContextType interface chứa loginWithGoogle", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const body = extractInterfaceBody(source, "AuthContextType");
    expect(body).toContain("loginWithGoogle");
  });

  it("TC-17: loginWithGoogle signature nhận code: string, trả Promise<void>", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const body = extractInterfaceBody(source, "AuthContextType");
    expect(body).toMatch(/loginWithGoogle\s*:\s*\(\s*code\s*:\s*string\s*\)\s*=>\s*Promise\s*<\s*void\s*>/);
  });

  it("TC-18: loginWithGoogle KHÔNG nhận GoogleAuthRequest object (chỉ code string)", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const body = extractInterfaceBody(source, "AuthContextType");
    // Verify không import/dùng GoogleAuthRequest type trong loginWithGoogle signature
    expect(body).not.toContain("GoogleAuthRequest");
    // Kiểm tra cụ thể: dòng chứa loginWithGoogle phải nhận (code: string), KHÔNG nhận (data: ...)
    // Tách phần loginWithGoogle ra khỏi interface body để tránh match register: (data: {...})
    const loginWithGoogleLine = body.slice(body.indexOf("loginWithGoogle"));
    const loginWithGoogleSignature = loginWithGoogleLine.split("\n")[0];
    expect(loginWithGoogleSignature).toContain("code: string");
    expect(loginWithGoogleSignature).not.toContain("data:");
  });
});

// ============================================================================
// AC5: loginWithGoogle implementation dùng useCallback
// ============================================================================

describe("US-01 AC5: loginWithGoogle implementation", () => {
  it("TC-19: loginWithGoogle được implement bằng useCallback", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    expect(source).toMatch(/const\s+loginWithGoogle\s*=\s*useCallback/);
  });

  it("TC-20: loginWithGoogle gọi googleAuthApi({ code })", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const fnBody = extractUseCallbackBody(source, "loginWithGoogle");
    expect(fnBody.length).toBeGreaterThan(0);
    expect(fnBody).toContain("googleAuthApi({ code })");
  });

  it("TC-21: loginWithGoogle gọi saveToken(response.token)", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const fnBody = extractUseCallbackBody(source, "loginWithGoogle");
    expect(fnBody).toContain("saveToken(response.token)");
  });

  it("TC-22: loginWithGoogle gọi setUser(response.user)", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const fnBody = extractUseCallbackBody(source, "loginWithGoogle");
    expect(fnBody).toContain("setUser(response.user)");
  });

  it("TC-23: loginWithGoogle dùng async/await", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const fnBody = extractUseCallbackBody(source, "loginWithGoogle");
    expect(fnBody).toContain("async");
    expect(fnBody).toContain("await googleAuthApi");
  });

  it("TC-24: loginWithGoogle return type là Promise<void>", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const fnBody = extractUseCallbackBody(source, "loginWithGoogle");
    expect(fnBody).toMatch(/async\s*\(\s*code\s*:\s*string\s*\)\s*:\s*Promise\s*<\s*void\s*>/);
  });

  it("TC-25: loginWithGoogle useCallback deps là [saveToken] — giống login()", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const fnBody = extractUseCallbackBody(source, "loginWithGoogle");
    expect(fnBody).toMatch(/\[\s*saveToken\s*\]/);
  });

  it("TC-26: loginWithGoogle KHÔNG có try-catch (errors bubble up, giống login)", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const fnBody = extractUseCallbackBody(source, "loginWithGoogle");
    expect(fnBody).not.toContain("try {");
    expect(fnBody).not.toContain("catch");
  });

  it("TC-27: loginWithGoogle thứ tự gọi đúng: googleAuthApi → saveToken → setUser", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const fnBody = extractUseCallbackBody(source, "loginWithGoogle");

    const googleAuthIdx = fnBody.indexOf("googleAuthApi");
    const saveTokenIdx = fnBody.indexOf("saveToken(response.token)");
    const setUserIdx = fnBody.indexOf("setUser(response.user)");

    expect(googleAuthIdx).toBeGreaterThan(-1);
    expect(saveTokenIdx).toBeGreaterThan(-1);
    expect(setUserIdx).toBeGreaterThan(-1);

    expect(googleAuthIdx).toBeLessThan(saveTokenIdx);
    expect(saveTokenIdx).toBeLessThan(setUserIdx);
  });

  it("TC-28: Pattern match với login() — cùng cấu trúc API call → saveToken → setUser", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    const loginBody = extractUseCallbackBody(source, "login");
    const googleBody = extractUseCallbackBody(source, "loginWithGoogle");

    expect(loginBody).toContain("saveToken(response.token)");
    expect(googleBody).toContain("saveToken(response.token)");

    expect(loginBody).toContain("setUser(response.user)");
    expect(googleBody).toContain("setUser(response.user)");

    expect(loginBody).toMatch(/\[\s*saveToken\s*\]/);
    expect(googleBody).toMatch(/\[\s*saveToken\s*\]/);
  });
});

// ============================================================================
// AC6: loginWithGoogle exposed trong context value object
// ============================================================================

describe("US-01 AC6: loginWithGoogle trong context value", () => {
  it("TC-29: context value object chứa loginWithGoogle", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    const valueIdx = source.indexOf("const value: AuthContextType");
    expect(valueIdx).toBeGreaterThan(-1);
    const valueBlock = source.slice(valueIdx, valueIdx + 400);
    expect(valueBlock).toContain("loginWithGoogle");
  });

  it("TC-30: context value vẫn có đầy đủ 8 fields (7 cũ + 1 mới)", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");

    const valueIdx = source.indexOf("const value: AuthContextType");
    expect(valueIdx).toBeGreaterThan(-1);
    const valueBlock = source.slice(valueIdx, valueIdx + 400);

    expect(valueBlock).toContain("user,");
    expect(valueBlock).toContain("token,");
    expect(valueBlock).toContain("isAuthenticated,");
    expect(valueBlock).toContain("isLoading,");
    expect(valueBlock).toContain("login,");
    expect(valueBlock).toContain("register,");
    expect(valueBlock).toContain("logout,");
    expect(valueBlock).toContain("loginWithGoogle,");
  });
});

// ============================================================================
// AC7: Không ảnh hưởng flow hiện tại — REGRESSION TESTS
// ============================================================================

describe("US-01 AC7: Regression — login() flow không thay đổi", () => {
  it("TC-31: login() vẫn gọi loginApi({ email, password })", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const loginBody = extractUseCallbackBody(source, "login");
    expect(loginBody).toContain("loginApi({ email, password })");
  });

  it("TC-32: login() vẫn dùng saveToken(response.token)", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const loginBody = extractUseCallbackBody(source, "login");
    expect(loginBody).toContain("saveToken(response.token)");
  });

  it("TC-33: login() vẫn dùng setUser(response.user)", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const loginBody = extractUseCallbackBody(source, "login");
    expect(loginBody).toContain("setUser(response.user)");
  });

  it("TC-34: login() vẫn nhận (email: string, password: string)", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    expect(source).toMatch(/login:\s*\(\s*email:\s*string,\s*password:\s*string\s*\)\s*=>\s*Promise<void>/);
  });
});

describe("US-01 AC7: Regression — register() flow không thay đổi", () => {
  it("TC-35: register() vẫn gọi registerApi(data) rồi loginApi()", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const registerBody = extractUseCallbackBody(source, "register");
    expect(registerBody).toContain("registerApi(data)");
    expect(registerBody).toContain("loginApi(");
  });

  it("TC-36: register() vẫn auto-login với data.email, data.password", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const registerBody = extractUseCallbackBody(source, "register");
    expect(registerBody).toContain("data.email");
    expect(registerBody).toContain("data.password");
  });

  it("TC-37: register() type signature chứa email, password, name", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const body = extractInterfaceBody(source, "AuthContextType");
    expect(body).toContain("register:");
    expect(body).toContain("email: string");
    expect(body).toContain("password: string");
    expect(body).toContain("name: string");
  });
});

describe("US-01 AC7: Regression — logout() flow không thay đổi", () => {
  it("TC-38: logout() vẫn gọi clearToken()", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const logoutBody = extractUseCallbackBody(source, "logout");
    expect(logoutBody).toContain("clearToken()");
  });

  it("TC-39: logout() vẫn gọi setUser(null)", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const logoutBody = extractUseCallbackBody(source, "logout");
    expect(logoutBody).toContain("setUser(null)");
  });

  it("TC-40: logout() vẫn là synchronous (không async)", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const body = extractInterfaceBody(source, "AuthContextType");
    expect(body).toMatch(/logout:\s*\(\s*\)\s*=>\s*void/);
  });
});

describe("US-01 AC7: Regression — existing API functions không thay đổi", () => {
  it("TC-41: registerApi vẫn gọi POST /api/auth/register", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    expect(source).toMatch(/function\s+registerApi[\s\S]*?\/api\/auth\/register/);
  });

  it("TC-42: loginApi vẫn gọi POST /api/auth/login", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    expect(source).toMatch(/function\s+loginApi[\s\S]*?\/api\/auth\/login/);
  });

  it("TC-43: getMeApi vẫn gọi GET /api/auth/me", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    expect(source).toMatch(/function\s+getMeApi[\s\S]*?\/api\/auth\/me/);
  });

  it("TC-44: LoginResponse type không thay đổi — vẫn có token + user", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    const body = extractInterfaceBody(source, "LoginResponse");
    expect(body).toContain("token: string");
    expect(body).toContain("user: UserProfile");
  });

  it("TC-45: LoginResponse KHÔNG thêm isNewUser (reuse nguyên type)", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    const body = extractInterfaceBody(source, "LoginResponse");
    expect(body).not.toContain("isNewUser");
  });
});

describe("US-01 AC7: Regression — verifyExistingToken không thay đổi", () => {
  it("TC-46: useEffect verify token on mount vẫn tồn tại", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    expect(source).toContain("verifyExistingToken");
    expect(source).toContain("getMeApi()");
    expect(source).toContain("localStorage.getItem(TOKEN_KEY)");
  });

  it("TC-47: useEffect vẫn có empty dependency array", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const effectBlock = source.slice(
      source.indexOf("useEffect("),
      source.indexOf("verifyExistingToken();") + 100,
    );
    expect(effectBlock).toContain("}, [])");
  });
});

// ============================================================================
// Import correctness
// ============================================================================

describe("US-01: Import google OAuth trong AuthContext", () => {
  it("TC-48: AuthContext import googleAuthApi từ auth.api.ts", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    expect(source).toContain("googleAuthApi");
    expect(source).toContain('from "../api/auth.api');
  });

  it("TC-49: AuthContext import googleAuthApi cùng dòng với registerApi, loginApi, getMeApi", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const importMatch = source.match(/import\s*\{([^}]+)\}\s*from\s*["']\.\.\/api\/auth\.api/);
    expect(importMatch).not.toBeNull();
    const importedNames = importMatch![1];
    expect(importedNames).toContain("registerApi");
    expect(importedNames).toContain("loginApi");
    expect(importedNames).toContain("getMeApi");
    expect(importedNames).toContain("googleAuthApi");
  });

  it("TC-50: AuthContext KHÔNG import GoogleAuthRequest (không cần)", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    expect(source).not.toMatch(/import\s+type\s*\{[^}]*GoogleAuthRequest[^}]*\}/);
    const typeImports = source.match(/import\s+type\s*\{([^}]+)\}/g);
    if (typeImports) {
      for (const imp of typeImports) {
        expect(imp).not.toContain("GoogleAuthRequest");
      }
    }
  });
});

// ============================================================================
// Adversarial & Edge Case Tests
// ============================================================================

describe("US-01 Adversarial: Endpoint correctness", () => {
  it("TC-51: googleAuthApi gọi đúng /api/auth/google, KHÔNG gọi sai endpoint", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    expect(source).toContain('"/api/auth/google"');
    expect(source).not.toContain("/api/auth/oauth");
    expect(source).not.toContain("/api/auth/google/callback");
    expect(source).not.toContain("/api/google/auth");
  });

  it("TC-52: googleAuthApi dùng POST method (thông qua apiClient.post)", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    expect(source).toMatch(/googleAuthApi[\s\S]*?apiClient\.post/);
    expect(source).not.toMatch(/googleAuthApi[\s\S]*?apiClient\.get.*?google/);
  });
});

describe("US-01 Adversarial: Security", () => {
  it("TC-53: auth.api.ts không hardcode tokens hoặc secrets", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    expect(source).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(source).not.toContain("GOCSPX-");
    expect(source).not.toContain(".apps.googleusercontent.com");
  });

  it("TC-54: AuthContext không hardcode tokens hoặc secrets", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    expect(source).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    expect(source).not.toContain("GOCSPX-");
  });

  it("TC-55: loginWithGoogle gọi saveToken (dùng cùng TOKEN_KEY) — token lưu nhất quán", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const fnBody = extractUseCallbackBody(source, "loginWithGoogle");
    expect(fnBody).toContain("saveToken(response.token)");
    expect(fnBody).not.toContain("localStorage.setItem");
  });
});

describe("US-01 Adversarial: Architecture consistency", () => {
  it("TC-56: Không tạo file mới — chỉ sửa 2 file đã có", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    const contextSource = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(source.length).toBeGreaterThan(0);
    expect(contextSource.length).toBeGreaterThan(0);

    expect(existsSync(resolve("frontend", "src/api/google.api.ts"))).toBe(false);
    expect(existsSync(resolve("frontend", "src/api/google-auth.ts"))).toBe(false);
    expect(existsSync(resolve("frontend", "src/api/google-auth.api.ts"))).toBe(false);
  });

  it("TC-57: auth.api.ts không import từ contexts/ (no circular dependency)", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    expect(source).not.toContain('from "../contexts');
    expect(source).not.toContain("from '../contexts");
  });

  it("TC-58: Không dùng default export trong auth.api.ts hoặc AuthContext.tsx", () => {
    const apiSource = readFrontendFile("src/api/auth.api.ts");
    const ctxSource = readFrontendFile("src/contexts/AuthContext.tsx");
    expect(apiSource).not.toContain("export default");
    expect(ctxSource).not.toContain("export default");
  });

  it("TC-59: loginWithGoogle đặt TRƯỚC useEffect (đúng vị trí trong function body)", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const loginWithGoogleIdx = source.indexOf("const loginWithGoogle = useCallback");
    const useEffectIdx = source.indexOf("useEffect(");
    expect(loginWithGoogleIdx).toBeGreaterThan(-1);
    expect(useEffectIdx).toBeGreaterThan(-1);
    expect(loginWithGoogleIdx).toBeLessThan(useEffectIdx);
  });
});

describe("US-01 Adversarial: Type safety", () => {
  it("TC-60: googleAuthApi trả đúng type — dùng generic apiClient.post<LoginResponse>", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    expect(source).toContain("apiClient.post<LoginResponse>");
    const matches = source.match(/apiClient\.post<LoginResponse>/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it("TC-61: RegisterResponse KHÔNG bị thay đổi (vẫn chỉ có user, không có token)", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    const body = extractInterfaceBody(source, "RegisterResponse");
    expect(body).toContain("user: UserProfile");
    expect(body).not.toContain("token");
  });

  it("TC-62: UserProfile type KHÔNG bị thay đổi", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    const body = extractInterfaceBody(source, "UserProfile");
    expect(body).toContain("id: string");
    expect(body).toContain("email: string");
    expect(body).toContain("name: string");
    expect(body).toContain("role: string");
    expect(body).toContain("createdAt: string");
    expect(body).not.toContain("password");
  });
});

describe("US-01 Adversarial: Error handling flow", () => {
  it("TC-63: loginWithGoogle không swallow errors — errors bubble to caller", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const fnBody = extractUseCallbackBody(source, "loginWithGoogle");
    expect(fnBody).not.toContain("try");
    expect(fnBody).not.toContain("catch");
  });

  it("TC-64: apiClient.post đã handle error (throw ApiError) — loginWithGoogle không cần thêm logic", () => {
    const clientSource = readFrontendFile("src/api/client.ts");
    expect(clientSource).toContain("throw new ApiError");
    expect(clientSource).toContain("!body.success");
  });
});

// ============================================================================
// Integration: Toàn bộ data flow
// ============================================================================

describe("US-01: Data flow integration — UI → AuthContext → auth.api → client", () => {
  it("TC-65: Full chain: loginWithGoogle → googleAuthApi → apiClient.post → fetch", () => {
    const ctxSource = readFrontendFile("src/contexts/AuthContext.tsx");
    const apiSource = readFrontendFile("src/api/auth.api.ts");
    const clientSource = readFrontendFile("src/api/client.ts");

    expect(ctxSource).toContain("googleAuthApi");
    expect(ctxSource).toContain('from "../api/auth.api');

    expect(apiSource).toContain("apiClient.post");
    expect(apiSource).toContain('from "./client');

    expect(clientSource).toContain("fetch(url");
  });

  it("TC-66: Token persistence: Google OAuth token lưu cùng key auth_token (shared với login thường)", () => {
    const clientSource = readFrontendFile("src/api/client.ts");
    const ctxSource = readFrontendFile("src/contexts/AuthContext.tsx");

    expect(clientSource).toContain('TOKEN_KEY = "auth_token"');
    expect(ctxSource).toContain("TOKEN_KEY");
    expect(ctxSource).toContain("localStorage.setItem(TOKEN_KEY");

    const fnBody = extractUseCallbackBody(ctxSource, "loginWithGoogle");
    expect(fnBody).toContain("saveToken(response.token)");
  });

  it("TC-67: verifyExistingToken on mount sẽ verify Google OAuth token (vì cùng key)", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    expect(source).toContain("localStorage.getItem(TOKEN_KEY)");
    expect(source).toContain("getMeApi()");
  });
});

// ============================================================================
// Comment & Documentation
// ============================================================================

describe("US-01: Code documentation", () => {
  it("TC-68: googleAuthApi có JSDoc comment", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    const fnIdx = source.indexOf("function googleAuthApi");
    const beforeFn = source.slice(Math.max(0, fnIdx - 200), fnIdx);
    expect(beforeFn).toContain("Google OAuth");
  });

  it("TC-69: GoogleAuthRequest có comment", () => {
    const source = readFrontendFile("src/api/auth.api.ts");
    const interfaceIdx = source.indexOf("interface GoogleAuthRequest");
    const beforeInterface = source.slice(Math.max(0, interfaceIdx - 200), interfaceIdx);
    expect(beforeInterface).toContain("US-01");
  });

  it("TC-70: AuthContext file header comment mentions Google OAuth / US-01", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const header = source.slice(0, 500);
    expect(header).toContain("Google OAuth");
  });

  it("TC-71: loginWithGoogle trong AuthContextType interface có JSDoc", () => {
    const source = readFrontendFile("src/contexts/AuthContext.tsx");
    const body = extractInterfaceBody(source, "AuthContextType");
    const loginWithGoogleIdx = body.indexOf("loginWithGoogle");
    const beforeField = body.slice(Math.max(0, loginWithGoogleIdx - 150), loginWithGoogleIdx);
    expect(beforeField).toContain("Google");
  });
});
