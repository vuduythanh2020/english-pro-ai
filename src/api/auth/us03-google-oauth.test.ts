/**
 * Unit Tests — US-03: POST /api/auth/google (Google OAuth Callback)
 * ============================================================================
 * Kiểm tra toàn bộ flow Google OAuth callback endpoint:
 *
 * AC1: Route POST /api/auth/google tồn tại
 * AC2: Validate input bằng Zod (googleAuthSchema: { code: string, min(1) })
 * AC3: Gọi Google Token endpoint đổi code → access_token
 * AC4: Gọi Google UserInfo endpoint → email, name, sub
 * AC5: User với google_id đã tồn tại → đăng nhập (returning user)
 * AC6: User chưa tồn tại → tạo user mới (auto-register)
 * AC7: Email Google trùng local user → 409 conflict
 * AC8: Response format { success: true, data: { token, user, isNewUser } }
 * AC9: Google API lỗi → 401 "Google authentication failed"
 * AC10: Logging đầy đủ (info/warn/error)
 *
 * Thêm:
 * - Login guard: Google user không thể dùng POST /login (password_hash null)
 * - toUserResponse() trả authProvider
 *
 * Strategy: Mock user.repository, google.service, jwt.utils, middleware, logger.
 * Tạo Express app minimal + dùng node:http để gửi request.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";

// =============================================
// Mock dependencies TRƯỚC KHI import auth.routes
// =============================================

const mockFindUserByEmail = vi.fn();
const mockFindUserById = vi.fn();
const mockCreateUser = vi.fn();
const mockFindUserByGoogleId = vi.fn();
const mockCreateGoogleUser = vi.fn();
const mockHashPassword = vi.fn();
const mockVerifyPassword = vi.fn();
const mockGenerateToken = vi.fn();
const mockVerifyToken = vi.fn();
const mockExchangeCodeForTokens = vi.fn();
const mockFetchGoogleUserInfo = vi.fn();

vi.mock("./user.repository.js", () => ({
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
  createUser: (...args: unknown[]) => mockCreateUser(...args),
  findUserByGoogleId: (...args: unknown[]) => mockFindUserByGoogleId(...args),
  createGoogleUser: (...args: unknown[]) => mockCreateGoogleUser(...args),
}));

vi.mock("./google.service.js", () => ({
  exchangeCodeForTokens: (...args: unknown[]) => mockExchangeCodeForTokens(...args),
  fetchGoogleUserInfo: (...args: unknown[]) => mockFetchGoogleUserInfo(...args),
}));

vi.mock("./password.utils.js", () => ({
  hashPassword: (...args: unknown[]) => mockHashPassword(...args),
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
}));

vi.mock("./jwt.utils.js", () => ({
  generateToken: (...args: unknown[]) => mockGenerateToken(...args),
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));

vi.mock("../middleware.js", () => ({
  authMiddleware: (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }
    const token = authHeader.slice(7);
    if (!token) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }
    const payload = mockVerifyToken(token);
    if (!payload) {
      res.status(401).json({ success: false, error: "Invalid or expired token" });
      return;
    }
    req.user = { userId: payload.userId, email: payload.email, role: payload.role };
    next();
  },
  errorHandler: vi.fn(),
  requestLogger: vi.fn(),
  requireFields: vi.fn(),
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { authRoutes } from "./auth.routes.js";
import { logger } from "../../utils/logger.js";

// =============================================
// Helpers
// =============================================

function createTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  return app;
}

async function sendRequest(
  app: Express,
  options: {
    method: string;
    path: string;
    body?: unknown;
    headers?: Record<string, string>;
  }
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const address = server.address() as AddressInfo | null;
      if (!address) {
        server.close(() => reject(new Error("Failed to get server address")));
        return;
      }
      const port = address.port;
      const payload = options.body !== undefined ? JSON.stringify(options.body) : undefined;

      const reqHeaders: Record<string, string> = { ...options.headers };
      if (payload) {
        reqHeaders["Content-Type"] = "application/json";
        reqHeaders["Content-Length"] = String(Buffer.byteLength(payload));
      }

      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: options.path,
          method: options.method,
          headers: reqHeaders,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk: string) => (data += chunk));
          res.on("end", () => {
            server.close(() => {
              try {
                resolve({ status: res.statusCode || 0, body: data ? JSON.parse(data) : null });
              } catch {
                resolve({ status: res.statusCode || 0, body: data });
              }
            });
          });
        }
      );
      req.on("error", (err: Error) => { server.close(() => reject(err)); });
      if (payload) req.write(payload);
      req.end();
    });
    server.on("error", (err: Error) => reject(err));
  });
}

async function postGoogle(
  app: Express,
  body: unknown
): Promise<{ status: number; body: unknown }> {
  return sendRequest(app, {
    method: "POST",
    path: "/api/auth/google",
    body,
  });
}

async function postLogin(
  app: Express,
  body: unknown
): Promise<{ status: number; body: unknown }> {
  return sendRequest(app, {
    method: "POST",
    path: "/api/auth/login",
    body,
  });
}

// =============================================
// Fixtures
// =============================================

const mockGoogleUserInfo = {
  id: "google-sub-123456",
  email: "googleuser@gmail.com",
  name: "Google User",
  picture: "https://lh3.googleusercontent.com/photo.jpg",
  verified_email: true,
};

/** Existing Google user — returning user (AC5) */
const mockExistingGoogleUserRow = {
  id: "existing-google-user-id",
  email: "googleuser@gmail.com",
  role: "user" as const,
  auth_provider: "google" as const,
  name: "Google User",
  profession: null,
  english_level: "intermediate",
  goals: null,
  created_at: new Date("2024-01-01T00:00:00Z"),
  updated_at: new Date("2024-01-01T00:00:00Z"),
  password_hash: null,
  google_id: "google-sub-123456",
};

/** New Google user — created via createGoogleUser (AC6) */
const mockNewGoogleUserRecord = {
  id: "new-google-user-id",
  email: "googleuser@gmail.com",
  role: "user" as const,
  auth_provider: "google" as const,
  name: "Google User",
  profession: null,
  english_level: "intermediate",
  goals: null,
  created_at: new Date("2024-02-01T00:00:00Z"),
  updated_at: new Date("2024-02-01T00:00:00Z"),
};

/** Local user — email conflict scenario (AC7) */
const mockLocalUserRow = {
  id: "local-user-id",
  email: "googleuser@gmail.com",
  role: "user" as const,
  auth_provider: "local" as const,
  name: "Local User",
  profession: "Developer",
  english_level: "advanced",
  goals: ["career"],
  created_at: new Date("2024-01-01T00:00:00Z"),
  updated_at: new Date("2024-01-01T00:00:00Z"),
  password_hash: "salt:hash",
  google_id: null,
};

/** Admin Google user — tests role from DB */
const mockAdminGoogleUserRow = {
  ...mockExistingGoogleUserRow,
  id: "admin-google-user-id",
  role: "admin" as const,
};

// =============================================
// TEST SUITE: POST /api/auth/google
// =============================================

describe("POST /api/auth/google — US-03 Google OAuth Callback", () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  // =============================================
  // AC1: Route exists
  // =============================================
  describe("AC1: Route POST /api/auth/google tồn tại", () => {
    it("TC-G01: POST /api/auth/google trả response (không phải 404)", async () => {
      // Gửi valid body nhưng Google service sẽ fail (default mock trả undefined)
      mockExchangeCodeForTokens.mockResolvedValue(null);

      const res = await postGoogle(app, { code: "test-code" });

      // Bất kỳ status nào khác 404 đều chứng tỏ route tồn tại
      expect(res.status).not.toBe(404);
    });
  });

  // =============================================
  // AC2: Zod validation
  // =============================================
  describe("AC2: Validate input bằng Zod — googleAuthSchema", () => {
    it("TC-G02: Thiếu code → 400", async () => {
      const res = await postGoogle(app, {});

      expect(res.status).toBe(400);
      const body = res.body as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toContain("Validation failed");
    });

    it("TC-G03: code rỗng → 400", async () => {
      const res = await postGoogle(app, { code: "" });

      expect(res.status).toBe(400);
      const body = res.body as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toContain("Validation failed");
    });

    it("TC-G04: code không phải string → 400", async () => {
      const res = await postGoogle(app, { code: 12345 });

      expect(res.status).toBe(400);
      const body = res.body as { success: boolean; error: string };
      expect(body.success).toBe(false);
    });

    it("TC-G05: body null → 400", async () => {
      const res = await sendRequest(app, {
        method: "POST",
        path: "/api/auth/google",
        body: null,
      });

      // Express JSON parser treats null as null body → Zod fails
      expect(res.status).toBe(400);
    });

    it("TC-G06: code là string hợp lệ → không bị 400 (qua validation)", async () => {
      mockExchangeCodeForTokens.mockResolvedValue("mock-access-token");
      mockFetchGoogleUserInfo.mockResolvedValue(mockGoogleUserInfo);
      mockFindUserByGoogleId.mockResolvedValue(null);
      mockFindUserByEmail.mockResolvedValue(null);
      mockCreateGoogleUser.mockResolvedValue(mockNewGoogleUserRecord);
      mockGenerateToken.mockReturnValue("mock.jwt.token");

      const res = await postGoogle(app, { code: "4/0AX4XfW..." });

      expect(res.status).not.toBe(400);
    });
  });

  // =============================================
  // AC3 + AC4: Google API calls
  // =============================================
  describe("AC3 + AC4: Google API calls", () => {
    it("TC-G07: exchangeCodeForTokens được gọi với code từ request body (AC3)", async () => {
      mockExchangeCodeForTokens.mockResolvedValue("mock-access-token");
      mockFetchGoogleUserInfo.mockResolvedValue(mockGoogleUserInfo);
      mockFindUserByGoogleId.mockResolvedValue(mockExistingGoogleUserRow);
      mockGenerateToken.mockReturnValue("mock.jwt.token");

      await postGoogle(app, { code: "my-auth-code-123" });

      expect(mockExchangeCodeForTokens).toHaveBeenCalledTimes(1);
      expect(mockExchangeCodeForTokens).toHaveBeenCalledWith("my-auth-code-123");
    });

    it("TC-G08: fetchGoogleUserInfo được gọi với access_token từ exchangeCodeForTokens (AC4)", async () => {
      mockExchangeCodeForTokens.mockResolvedValue("access-token-xyz");
      mockFetchGoogleUserInfo.mockResolvedValue(mockGoogleUserInfo);
      mockFindUserByGoogleId.mockResolvedValue(mockExistingGoogleUserRow);
      mockGenerateToken.mockReturnValue("mock.jwt.token");

      await postGoogle(app, { code: "auth-code" });

      expect(mockFetchGoogleUserInfo).toHaveBeenCalledTimes(1);
      expect(mockFetchGoogleUserInfo).toHaveBeenCalledWith("access-token-xyz");
    });
  });

  // =============================================
  // AC5: Returning user (google_id exists)
  // =============================================
  describe("AC5: User với google_id đã tồn tại → đăng nhập", () => {
    beforeEach(() => {
      mockExchangeCodeForTokens.mockResolvedValue("mock-access-token");
      mockFetchGoogleUserInfo.mockResolvedValue(mockGoogleUserInfo);
      mockFindUserByGoogleId.mockResolvedValue(mockExistingGoogleUserRow);
      mockGenerateToken.mockReturnValue("returning-user-jwt-token");
    });

    it("TC-G09: Returning user → 200, isNewUser = false", async () => {
      const res = await postGoogle(app, { code: "valid-code" });

      expect(res.status).toBe(200);
      const body = res.body as { success: boolean; data: { token: string; user: Record<string, unknown>; isNewUser: boolean } };
      expect(body.success).toBe(true);
      expect(body.data.isNewUser).toBe(false);
      expect(body.data.token).toBe("returning-user-jwt-token");
    });

    it("TC-G10: findUserByGoogleId được gọi với Google sub (id)", async () => {
      await postGoogle(app, { code: "valid-code" });

      expect(mockFindUserByGoogleId).toHaveBeenCalledTimes(1);
      expect(mockFindUserByGoogleId).toHaveBeenCalledWith("google-sub-123456");
    });

    it("TC-G11: generateToken được gọi với userId, email, role từ DB", async () => {
      await postGoogle(app, { code: "valid-code" });

      expect(mockGenerateToken).toHaveBeenCalledTimes(1);
      expect(mockGenerateToken).toHaveBeenCalledWith({
        userId: mockExistingGoogleUserRow.id,
        email: mockExistingGoogleUserRow.email,
        role: mockExistingGoogleUserRow.role,
      });
    });

    it("TC-G12: Admin Google user → JWT token chứa role 'admin' (BR-07)", async () => {
      mockFindUserByGoogleId.mockResolvedValue(mockAdminGoogleUserRow);

      await postGoogle(app, { code: "valid-code" });

      expect(mockGenerateToken).toHaveBeenCalledWith({
        userId: mockAdminGoogleUserRow.id,
        email: mockAdminGoogleUserRow.email,
        role: "admin",
      });
    });

    it("TC-G13: Returning user — findUserByEmail KHÔNG được gọi (skip bước 5,6)", async () => {
      await postGoogle(app, { code: "valid-code" });

      expect(mockFindUserByEmail).not.toHaveBeenCalled();
      expect(mockCreateGoogleUser).not.toHaveBeenCalled();
    });

    it("TC-G14: Response user object chứa authProvider", async () => {
      const res = await postGoogle(app, { code: "valid-code" });

      expect(res.status).toBe(200);
      const body = res.body as { data: { user: Record<string, unknown> } };
      expect(body.data.user).toHaveProperty("authProvider", "google");
    });
  });

  // =============================================
  // AC6: New user (auto-register via Google)
  // =============================================
  describe("AC6: User chưa tồn tại → tạo user mới", () => {
    beforeEach(() => {
      mockExchangeCodeForTokens.mockResolvedValue("mock-access-token");
      mockFetchGoogleUserInfo.mockResolvedValue(mockGoogleUserInfo);
      mockFindUserByGoogleId.mockResolvedValue(null); // Không tìm thấy theo google_id
      mockFindUserByEmail.mockResolvedValue(null); // Không tìm thấy theo email
      mockCreateGoogleUser.mockResolvedValue(mockNewGoogleUserRecord);
      mockGenerateToken.mockReturnValue("new-user-jwt-token");
    });

    it("TC-G15: New user → 200, isNewUser = true", async () => {
      const res = await postGoogle(app, { code: "valid-code" });

      expect(res.status).toBe(200);
      const body = res.body as { success: boolean; data: { token: string; user: Record<string, unknown>; isNewUser: boolean } };
      expect(body.success).toBe(true);
      expect(body.data.isNewUser).toBe(true);
      expect(body.data.token).toBe("new-user-jwt-token");
    });

    it("TC-G16: createGoogleUser được gọi với đúng params", async () => {
      await postGoogle(app, { code: "valid-code" });

      expect(mockCreateGoogleUser).toHaveBeenCalledTimes(1);
      expect(mockCreateGoogleUser).toHaveBeenCalledWith({
        email: mockGoogleUserInfo.email,
        name: mockGoogleUserInfo.name,
        googleId: mockGoogleUserInfo.id,
      });
    });

    it("TC-G17: generateToken được gọi với new user's userId, email, role", async () => {
      await postGoogle(app, { code: "valid-code" });

      expect(mockGenerateToken).toHaveBeenCalledWith({
        userId: mockNewGoogleUserRecord.id,
        email: mockNewGoogleUserRecord.email,
        role: mockNewGoogleUserRecord.role,
      });
    });

    it("TC-G18: createGoogleUser trả null (DB error) → 500", async () => {
      mockCreateGoogleUser.mockResolvedValue(null);

      const res = await postGoogle(app, { code: "valid-code" });

      expect(res.status).toBe(500);
      const body = res.body as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toContain("Failed to create user account");
    });
  });

  // =============================================
  // AC7: Email conflict with local user
  // =============================================
  describe("AC7: Email Google trùng với user local → 409 conflict", () => {
    beforeEach(() => {
      mockExchangeCodeForTokens.mockResolvedValue("mock-access-token");
      mockFetchGoogleUserInfo.mockResolvedValue(mockGoogleUserInfo);
      mockFindUserByGoogleId.mockResolvedValue(null); // Không tìm thấy theo google_id
      mockFindUserByEmail.mockResolvedValue(mockLocalUserRow); // Tìm thấy local user
    });

    it("TC-G19: Email conflict → 409, đúng error message", async () => {
      const res = await postGoogle(app, { code: "valid-code" });

      expect(res.status).toBe(409);
      const body = res.body as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toBe(
        "Email already registered with email/password. Please login with your password."
      );
    });

    it("TC-G20: Email conflict → createGoogleUser KHÔNG được gọi", async () => {
      await postGoogle(app, { code: "valid-code" });

      expect(mockCreateGoogleUser).not.toHaveBeenCalled();
    });

    it("TC-G21: Email conflict → generateToken KHÔNG được gọi", async () => {
      await postGoogle(app, { code: "valid-code" });

      expect(mockGenerateToken).not.toHaveBeenCalled();
    });
  });

  // =============================================
  // AC8: Response format
  // =============================================
  describe("AC8: Response format nhất quán", () => {
    beforeEach(() => {
      mockExchangeCodeForTokens.mockResolvedValue("mock-access-token");
      mockFetchGoogleUserInfo.mockResolvedValue(mockGoogleUserInfo);
      mockFindUserByGoogleId.mockResolvedValue(mockExistingGoogleUserRow);
      mockGenerateToken.mockReturnValue("mock.jwt.token");
    });

    it("TC-G22: Response format { success: true, data: { token, user, isNewUser } }", async () => {
      const res = await postGoogle(app, { code: "valid-code" });

      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("data");

      const data = body.data as { token: unknown; user: unknown; isNewUser: unknown };
      expect(data).toHaveProperty("token");
      expect(data).toHaveProperty("user");
      expect(data).toHaveProperty("isNewUser");
      expect(typeof data.token).toBe("string");
      expect(typeof data.user).toBe("object");
      expect(typeof data.isNewUser).toBe("boolean");
    });

    it("TC-G23: User object chứa đúng fields (camelCase)", async () => {
      const res = await postGoogle(app, { code: "valid-code" });

      expect(res.status).toBe(200);
      const body = res.body as { data: { user: Record<string, unknown> } };
      const user = body.data.user;

      expect(user).toHaveProperty("id");
      expect(user).toHaveProperty("email");
      expect(user).toHaveProperty("role");
      expect(user).toHaveProperty("authProvider");
      expect(user).toHaveProperty("name");
      expect(user).toHaveProperty("englishLevel");
      expect(user).toHaveProperty("createdAt");
      // Không chứa snake_case hoặc sensitive fields
      expect(user).not.toHaveProperty("password_hash");
      expect(user).not.toHaveProperty("passwordHash");
      expect(user).not.toHaveProperty("updated_at");
      expect(user).not.toHaveProperty("updatedAt");
      expect(user).not.toHaveProperty("google_id");
      expect(user).not.toHaveProperty("english_level");
      expect(user).not.toHaveProperty("auth_provider");
      expect(user).not.toHaveProperty("created_at");
    });

    it("TC-G24: Error response format { success: false, error: string }", async () => {
      mockExchangeCodeForTokens.mockResolvedValue(null);

      const res = await postGoogle(app, { code: "bad-code" });

      expect(res.status).toBe(401);
      const body = res.body as Record<string, unknown>;
      expect(body).toHaveProperty("success", false);
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });
  });

  // =============================================
  // AC9: Google API errors → 401
  // =============================================
  describe("AC9: Google API lỗi → 401", () => {
    it("TC-G25: exchangeCodeForTokens trả null (code invalid) → 401", async () => {
      mockExchangeCodeForTokens.mockResolvedValue(null);

      const res = await postGoogle(app, { code: "expired-code" });

      expect(res.status).toBe(401);
      const body = res.body as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toBe("Google authentication failed");
    });

    it("TC-G26: fetchGoogleUserInfo trả null (token invalid) → 401", async () => {
      mockExchangeCodeForTokens.mockResolvedValue("mock-access-token");
      mockFetchGoogleUserInfo.mockResolvedValue(null);

      const res = await postGoogle(app, { code: "valid-code" });

      expect(res.status).toBe(401);
      const body = res.body as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toBe("Google authentication failed");
    });

    it("TC-G27: fetchGoogleUserInfo KHÔNG được gọi khi exchangeCodeForTokens fail", async () => {
      mockExchangeCodeForTokens.mockResolvedValue(null);

      await postGoogle(app, { code: "bad-code" });

      expect(mockFetchGoogleUserInfo).not.toHaveBeenCalled();
    });

    it("TC-G28: findUserByGoogleId KHÔNG được gọi khi Google API fail", async () => {
      mockExchangeCodeForTokens.mockResolvedValue(null);

      await postGoogle(app, { code: "bad-code" });

      expect(mockFindUserByGoogleId).not.toHaveBeenCalled();
    });
  });

  // =============================================
  // AC10: Logging
  // =============================================
  describe("AC10: Logging đầy đủ", () => {
    it("TC-G29: logger.info khi Google login thành công (returning user)", async () => {
      mockExchangeCodeForTokens.mockResolvedValue("mock-access-token");
      mockFetchGoogleUserInfo.mockResolvedValue(mockGoogleUserInfo);
      mockFindUserByGoogleId.mockResolvedValue(mockExistingGoogleUserRow);
      mockGenerateToken.mockReturnValue("mock.jwt.token");

      await postGoogle(app, { code: "valid-code" });

      expect(logger.info).toHaveBeenCalled();
      const infoCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
      const infoMessages = infoCalls.map((c) => c[0]) as string[];

      // Có log attempt
      expect(infoMessages.some((m) => m.includes("Google OAuth attempt"))).toBe(true);
      // Có log success
      expect(infoMessages.some((m) => m.includes("Google login successful"))).toBe(true);
    });

    it("TC-G30: logger.info khi Google login thành công (new user)", async () => {
      mockExchangeCodeForTokens.mockResolvedValue("mock-access-token");
      mockFetchGoogleUserInfo.mockResolvedValue(mockGoogleUserInfo);
      mockFindUserByGoogleId.mockResolvedValue(null);
      mockFindUserByEmail.mockResolvedValue(null);
      mockCreateGoogleUser.mockResolvedValue(mockNewGoogleUserRecord);
      mockGenerateToken.mockReturnValue("mock.jwt.token");

      await postGoogle(app, { code: "valid-code" });

      expect(logger.info).toHaveBeenCalled();
      const infoCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
      const infoMessages = infoCalls.map((c) => c[0]) as string[];
      expect(infoMessages.some((m) => m.includes("new user"))).toBe(true);
    });

    it("TC-G31: logger.warn khi validation fail", async () => {
      await postGoogle(app, { code: "" });

      expect(logger.warn).toHaveBeenCalled();
      const warnCalls = (logger.warn as ReturnType<typeof vi.fn>).mock.calls;
      const warnMessages = warnCalls.map((c) => c[0]) as string[];
      expect(warnMessages.some((m) => m.includes("validation failed"))).toBe(true);
    });

    it("TC-G32: logger.warn khi email conflict (409)", async () => {
      mockExchangeCodeForTokens.mockResolvedValue("mock-access-token");
      mockFetchGoogleUserInfo.mockResolvedValue(mockGoogleUserInfo);
      mockFindUserByGoogleId.mockResolvedValue(null);
      mockFindUserByEmail.mockResolvedValue(mockLocalUserRow);

      await postGoogle(app, { code: "valid-code" });

      expect(logger.warn).toHaveBeenCalled();
      const warnCalls = (logger.warn as ReturnType<typeof vi.fn>).mock.calls;
      const warnMessages = warnCalls.map((c) => c[0]) as string[];
      expect(warnMessages.some((m) => m.includes("email conflict") || m.includes("conflict"))).toBe(true);
    });

    it("TC-G33: logger.warn khi Google code exchange fail", async () => {
      mockExchangeCodeForTokens.mockResolvedValue(null);

      await postGoogle(app, { code: "bad-code" });

      expect(logger.warn).toHaveBeenCalled();
      const warnCalls = (logger.warn as ReturnType<typeof vi.fn>).mock.calls;
      const warnMessages = warnCalls.map((c) => c[0]) as string[];
      expect(warnMessages.some((m) => m.includes("code exchange failed") || m.includes("Google"))).toBe(true);
    });

    it("TC-G34: logger.error khi unexpected exception", async () => {
      mockExchangeCodeForTokens.mockRejectedValue(new Error("network crash"));

      const res = await postGoogle(app, { code: "valid-code" });

      expect(res.status).toBe(500);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // =============================================
  // Login guard: Google user cannot use POST /login
  // =============================================
  describe("Login guard: Google user không thể dùng POST /login", () => {
    it("TC-G35: Google user (password_hash = null) login bằng email/password → 401", async () => {
      // findUserByEmail trả Google user (password_hash null)
      mockFindUserByEmail.mockResolvedValue({
        ...mockExistingGoogleUserRow,
      });

      const res = await postLogin(app, {
        email: "googleuser@gmail.com",
        password: "some-password",
      });

      expect(res.status).toBe(401);
      const body = res.body as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toBe("Invalid email or password");
      // verifyPassword KHÔNG được gọi khi password_hash null
      expect(mockVerifyPassword).not.toHaveBeenCalled();
    });
  });

  // =============================================
  // Edge Cases & Adversarial
  // =============================================
  describe("Edge cases & Adversarial", () => {
    it("TC-G36: Unexpected error in route handler → 500 'Google authentication failed'", async () => {
      mockExchangeCodeForTokens.mockResolvedValue("mock-access-token");
      mockFetchGoogleUserInfo.mockResolvedValue(mockGoogleUserInfo);
      mockFindUserByGoogleId.mockRejectedValue(new Error("DB connection lost"));

      const res = await postGoogle(app, { code: "valid-code" });

      expect(res.status).toBe(500);
      const body = res.body as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toBe("Google authentication failed");
    });

    it("TC-G37: Extra fields in body are ignored by Zod (strip mode)", async () => {
      mockExchangeCodeForTokens.mockResolvedValue("mock-access-token");
      mockFetchGoogleUserInfo.mockResolvedValue(mockGoogleUserInfo);
      mockFindUserByGoogleId.mockResolvedValue(mockExistingGoogleUserRow);
      mockGenerateToken.mockReturnValue("mock.jwt.token");

      const res = await postGoogle(app, {
        code: "valid-code",
        extraField: "should-be-ignored",
        role: "admin",
      });

      // Should not error on extra fields
      expect(res.status).toBe(200);
    });

    it("TC-G38: Very long code string → still passed to exchangeCodeForTokens", async () => {
      const longCode = "x".repeat(5000);
      mockExchangeCodeForTokens.mockResolvedValue(null);

      const res = await postGoogle(app, { code: longCode });

      expect(res.status).toBe(401);
      expect(mockExchangeCodeForTokens).toHaveBeenCalledWith(longCode);
    });

    it("TC-G39: generateToken throws → 500", async () => {
      mockExchangeCodeForTokens.mockResolvedValue("mock-access-token");
      mockFetchGoogleUserInfo.mockResolvedValue(mockGoogleUserInfo);
      mockFindUserByGoogleId.mockResolvedValue(mockExistingGoogleUserRow);
      mockGenerateToken.mockImplementation(() => {
        throw new Error("crypto failure");
      });

      const res = await postGoogle(app, { code: "valid-code" });

      expect(res.status).toBe(500);
    });

    it("TC-G40: isNewUser is boolean true (not truthy), isNewUser is boolean false (not falsy)", async () => {
      // Test returning user → isNewUser === false (strict)
      mockExchangeCodeForTokens.mockResolvedValue("mock-access-token");
      mockFetchGoogleUserInfo.mockResolvedValue(mockGoogleUserInfo);
      mockFindUserByGoogleId.mockResolvedValue(mockExistingGoogleUserRow);
      mockGenerateToken.mockReturnValue("token");

      const res1 = await postGoogle(app, { code: "code-1" });
      const body1 = res1.body as { data: { isNewUser: boolean } };
      expect(body1.data.isNewUser).toBe(false);
      expect(body1.data.isNewUser).toStrictEqual(false);

      // Reset for new user test
      vi.clearAllMocks();
      app = createTestApp();
      mockExchangeCodeForTokens.mockResolvedValue("mock-access-token");
      mockFetchGoogleUserInfo.mockResolvedValue(mockGoogleUserInfo);
      mockFindUserByGoogleId.mockResolvedValue(null);
      mockFindUserByEmail.mockResolvedValue(null);
      mockCreateGoogleUser.mockResolvedValue(mockNewGoogleUserRecord);
      mockGenerateToken.mockReturnValue("token");

      const res2 = await postGoogle(app, { code: "code-2" });
      const body2 = res2.body as { data: { isNewUser: boolean } };
      expect(body2.data.isNewUser).toBe(true);
      expect(body2.data.isNewUser).toStrictEqual(true);
    });

    it("TC-G41: Response should NOT contain google_id or password_hash (security)", async () => {
      mockExchangeCodeForTokens.mockResolvedValue("mock-access-token");
      mockFetchGoogleUserInfo.mockResolvedValue(mockGoogleUserInfo);
      mockFindUserByGoogleId.mockResolvedValue(mockExistingGoogleUserRow);
      mockGenerateToken.mockReturnValue("token");

      const res = await postGoogle(app, { code: "valid-code" });

      expect(res.status).toBe(200);
      const body = res.body as { data: { user: Record<string, unknown> } };
      const user = body.data.user;
      expect(user).not.toHaveProperty("google_id");
      expect(user).not.toHaveProperty("googleId");
      expect(user).not.toHaveProperty("password_hash");
      expect(user).not.toHaveProperty("passwordHash");
    });
  });
});
