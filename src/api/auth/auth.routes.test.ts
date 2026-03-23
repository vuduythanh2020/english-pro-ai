/**
 * Unit Tests cho auth.routes.ts — US-03, US-04 & US-01
 * =============================================
 * Test endpoints:
 * - POST /api/auth/register (US-03)
 * - POST /api/auth/login (US-04)
 * - GET  /api/auth/me (US-01)
 *
 * Strategy: Mock user.repository, password.utils, jwt.utils, middleware, logger.
 * Tạo Express app minimal + dùng node:http để gửi request.
 *
 * === Register Tests (US-03) ===
 * - TC-01 → TC-19 (giữ nguyên từ US-03)
 *
 * === Login Tests (US-04) ===
 * - TC-L01: Login thành công — trả 200, có token và user info (AC1, AC4)
 * - TC-L02: Email không tồn tại → 401 "Invalid email or password" (AC2)
 * - TC-L03: Password sai → 401 "Invalid email or password" (AC2)
 * - TC-L04: Email sai format → 400 (Validation)
 * - TC-L05: Thiếu email → 400
 * - TC-L06: Thiếu password → 400
 * - TC-L07: Password rỗng → 400
 * - TC-L08: Response user KHÔNG chứa password_hash (BR-01)
 * - TC-L09: Response format: { success, data: { token, user } } (AC4)
 * - TC-L10: User object có đúng fields: id, email, name, profession, englishLevel, goals (AC4)
 * - TC-L11: Email normalize: "TEST@EXAMPLE.COM" → query "test@example.com" (BR-07)
 * - TC-L12: Lỗi hệ thống (verifyPassword throws) → 500 (UC-05)
 * - TC-L13: Logger.info khi login thành công
 * - TC-L14: Logger.warn khi login thất bại
 * - TC-L15: Error message cho email not found và wrong password phải GIỐNG NHAU (BR-06)
 *
 * === GET /me Tests (US-01) ===
 * - TC-M01 → TC-M12
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";

// =============================================
// Mock dependencies TRƯỚC KHI import auth.routes
// =============================================

const mockFindUserByEmail = vi.fn();
const mockFindUserById = vi.fn();
const mockCreateUser = vi.fn();
const mockHashPassword = vi.fn();
const mockVerifyPassword = vi.fn();
const mockGenerateToken = vi.fn();
const mockVerifyToken = vi.fn();

vi.mock("./user.repository.js", () => ({
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
  createUser: (...args: unknown[]) => mockCreateUser(...args),
}));

vi.mock("./password.utils.js", () => ({
  hashPassword: (...args: unknown[]) => mockHashPassword(...args),
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
}));

vi.mock("./jwt.utils.js", () => ({
  generateToken: (...args: unknown[]) => mockGenerateToken(...args),
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));

/**
 * Mock authMiddleware — simulate behavior thực:
 * - Có Authorization header "Bearer <token>" và verifyToken trả payload → gắn req.user, gọi next()
 * - Không có header hoặc sai format → 401 "Authentication required"
 * - Token invalid (verifyToken trả null) → 401 "Invalid or expired token"
 */
vi.mock("../middleware.js", () => ({
  authMiddleware: (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
      });
      return;
    }

    const token = authHeader.slice(7);
    if (!token) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
      });
      return;
    }

    // Dùng mockVerifyToken để test có thể control behavior
    const payload = mockVerifyToken(token);

    if (!payload) {
      res.status(401).json({
        success: false,
        error: "Invalid or expired token",
      });
      return;
    }

    req.user = {
      userId: payload.userId,
      email: payload.email,
    };

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
// Helper: tạo Express app để test
// =============================================

function createTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  return app;
}

/**
 * Generic helper gửi HTTP request tới Express app.
 * Tạo server tạm trên port ngẫu nhiên, gửi request, rồi close.
 *
 * Cải tiến: đảm bảo server.close() luôn được gọi dù có lỗi,
 * và dùng server.close callback để resolve/reject đúng thời điểm.
 */
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

      const reqHeaders: Record<string, string> = {
        ...options.headers,
      };

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
                resolve({
                  status: res.statusCode || 0,
                  body: data ? JSON.parse(data) : null,
                });
              } catch {
                resolve({ status: res.statusCode || 0, body: data });
              }
            });
          });
        }
      );

      req.on("error", (err: Error) => {
        server.close(() => reject(err));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });

    server.on("error", (err: Error) => {
      reject(err);
    });
  });
}

/**
 * Helper gửi POST /api/auth/register request.
 */
async function postRegister(
  app: Express,
  body: unknown
): Promise<{ status: number; body: unknown }> {
  return sendRequest(app, {
    method: "POST",
    path: "/api/auth/register",
    body,
  });
}

/**
 * Helper gửi POST /api/auth/login request.
 */
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

/**
 * Helper gửi GET /api/auth/me request.
 * @param token - JWT token (optional). Nếu có, gửi Authorization: Bearer <token>
 */
async function getMe(
  app: Express,
  token?: string
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return sendRequest(app, {
    method: "GET",
    path: "/api/auth/me",
    headers,
  });
}

// =============================================
// Fixtures
// =============================================

const mockUserRecord = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "test@example.com",
  name: "Test User",
  profession: "Software Engineer",
  english_level: "intermediate",
  goals: ["business", "technical"],
  created_at: new Date("2024-01-15T10:30:00.000Z"),
  updated_at: new Date("2024-01-15T10:30:00.000Z"),
};

/** UserRow (có password_hash) — dùng cho findUserByEmail mock */
const mockUserRow = {
  ...mockUserRecord,
  password_hash: "randomsalt:derivedhash",
};

const validRegisterBody = {
  email: "test@example.com",
  password: "securePass123",
  name: "Test User",
  profession: "Software Engineer",
  englishLevel: "intermediate",
  goals: ["business", "technical"],
};

const validLoginBody = {
  email: "test@example.com",
  password: "securePass123",
};

// =============================================
// REGISTER Tests (US-03) — giữ nguyên
// =============================================

describe("POST /api/auth/register", () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
    // Default mocks
    mockFindUserByEmail.mockResolvedValue(null);
    mockHashPassword.mockResolvedValue("randomsalt:derivedhash");
    mockCreateUser.mockResolvedValue(mockUserRecord);
  });

  // =============================================
  // Happy Path Tests
  // =============================================

  describe("Happy path", () => {
    it("TC-01: Đăng ký thành công — full fields → 201, response camelCase", async () => {
      const res = await postRegister(app, validRegisterBody);

      expect(res.status).toBe(201);
      const resBody = res.body as { success: boolean; data: { user: Record<string, unknown> } };
      expect(resBody.success).toBe(true);
      expect(resBody.data.user).toBeDefined();

      const user = resBody.data.user;
      expect(user.id).toBe(mockUserRecord.id);
      expect(user.email).toBe(mockUserRecord.email);
      expect(user.name).toBe(mockUserRecord.name);
      expect(user.profession).toBe(mockUserRecord.profession);
      expect(user.englishLevel).toBe(mockUserRecord.english_level);
      expect(user.goals).toEqual(mockUserRecord.goals);
      expect(user.createdAt).toBeDefined();
    });

    it("TC-02: Đăng ký thành công — chỉ required fields → 201", async () => {
      const minimalUserRecord = {
        ...mockUserRecord,
        profession: null,
        english_level: "intermediate",
        goals: null,
      };
      mockCreateUser.mockResolvedValue(minimalUserRecord);

      const res = await postRegister(app, {
        email: "user@example.com",
        password: "password123",
        name: "User Name",
      });

      expect(res.status).toBe(201);
      const resBody = res.body as { success: boolean; data: { user: Record<string, unknown> } };
      expect(resBody.success).toBe(true);
      expect(resBody.data.user.profession).toBeNull();
      expect(resBody.data.user.goals).toBeNull();
    });
  });

  // =============================================
  // Validation Tests (AC2)
  // =============================================

  describe("Validation (AC2)", () => {
    it("TC-03: Email sai format → 400", async () => {
      const res = await postRegister(app, {
        ...validRegisterBody,
        email: "not-an-email",
      });

      expect(res.status).toBe(400);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
      expect(resBody.error).toContain("Validation failed");
    });

    it("TC-04: Password < 8 ký tự → 400", async () => {
      const res = await postRegister(app, {
        ...validRegisterBody,
        password: "short",
      });

      expect(res.status).toBe(400);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
      expect(resBody.error).toContain("Password must be at least 8 characters");
    });

    it("TC-05: Name rỗng → 400", async () => {
      const res = await postRegister(app, {
        ...validRegisterBody,
        name: "",
      });

      expect(res.status).toBe(400);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
      expect(resBody.error).toContain("Validation failed");
    });

    it("TC-06: Thiếu email → 400", async () => {
      const { email: _email, ...bodyWithoutEmail } = validRegisterBody;
      const res = await postRegister(app, bodyWithoutEmail);

      expect(res.status).toBe(400);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
    });

    it("TC-07: Thiếu password → 400", async () => {
      const { password: _password, ...bodyWithoutPassword } = validRegisterBody;
      const res = await postRegister(app, bodyWithoutPassword);

      expect(res.status).toBe(400);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
    });

    it("TC-08: Thiếu name → 400", async () => {
      const { name: _name, ...bodyWithoutName } = validRegisterBody;
      const res = await postRegister(app, bodyWithoutName);

      expect(res.status).toBe(400);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
    });

    it("TC-12: englishLevel invalid value → 400", async () => {
      const res = await postRegister(app, {
        ...validRegisterBody,
        englishLevel: "super-advanced",
      });

      expect(res.status).toBe(400);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
    });
  });

  // =============================================
  // Duplicate Email (AC3)
  // =============================================

  describe("Duplicate email (AC3)", () => {
    it("TC-09: Email đã tồn tại → 409", async () => {
      mockFindUserByEmail.mockResolvedValue({
        ...mockUserRecord,
        password_hash: "existing:hash",
      });

      const res = await postRegister(app, validRegisterBody);

      expect(res.status).toBe(409);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
      expect(resBody.error).toBe("Email already registered");

      // hashPassword KHÔNG được gọi khi email đã tồn tại
      expect(mockHashPassword).not.toHaveBeenCalled();
    });
  });

  // =============================================
  // Response Format (AC4)
  // =============================================

  describe("Response format (AC4)", () => {
    it("TC-10: Response KHÔNG chứa password_hash (BR-01)", async () => {
      const res = await postRegister(app, validRegisterBody);

      expect(res.status).toBe(201);
      const resBody = res.body as { success: boolean; data: { user: Record<string, unknown> } };
      const user = resBody.data.user;

      expect(user).not.toHaveProperty("password_hash");
      expect(user).not.toHaveProperty("passwordHash");
    });

    it("TC-11: Response format đúng { success, data: { user: {...} } }", async () => {
      const res = await postRegister(app, validRegisterBody);

      expect(res.status).toBe(201);
      const resBody = res.body as Record<string, unknown>;

      expect(resBody).toHaveProperty("success", true);
      expect(resBody).toHaveProperty("data");

      const data = resBody.data as { user: Record<string, unknown> };
      expect(data).toHaveProperty("user");

      const user = data.user;
      expect(user).toHaveProperty("id");
      expect(user).toHaveProperty("email");
      expect(user).toHaveProperty("name");
      expect(user).toHaveProperty("profession");
      expect(user).toHaveProperty("englishLevel");
      expect(user).toHaveProperty("goals");
      expect(user).toHaveProperty("createdAt");
    });

    it("TC-18: Response KHÔNG chứa updated_at / updatedAt", async () => {
      const res = await postRegister(app, validRegisterBody);

      expect(res.status).toBe(201);
      const resBody = res.body as { success: boolean; data: { user: Record<string, unknown> } };
      const user = resBody.data.user;

      expect(user).not.toHaveProperty("updated_at");
      expect(user).not.toHaveProperty("updatedAt");
    });
  });

  // =============================================
  // Email Normalization (BR-09)
  // =============================================

  describe("Email normalization (BR-09)", () => {
    it("TC-13: Email uppercase (no spaces) được lowercase thành công", async () => {
      const res = await postRegister(app, {
        ...validRegisterBody,
        email: "TEST@EXAMPLE.COM",
      });

      expect(res.status).toBe(201);
      expect(mockFindUserByEmail).toHaveBeenCalledWith("test@example.com");

      const createUserArgs = mockCreateUser.mock.calls[0][0];
      expect(createUserArgs.email).toBe("test@example.com");
    });

    it("TC-13b: [BUG] Email có leading/trailing spaces → 400 vì .email() validate TRƯỚC .transform()", async () => {
      const res = await postRegister(app, {
        ...validRegisterBody,
        email: "  TEST@EXAMPLE.COM  ",
      });

      expect(res.status).toBe(400);
    });
  });

  // =============================================
  // Error Handling
  // =============================================

  describe("Error handling", () => {
    it("TC-14: createUser trả null (race condition) → 409", async () => {
      mockCreateUser.mockResolvedValue(null);

      const res = await postRegister(app, validRegisterBody);

      expect(res.status).toBe(409);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
      expect(resBody.error).toBe("Email already registered");
    });

    it("TC-16: Unexpected error (hashPassword throws) → 500", async () => {
      mockHashPassword.mockRejectedValue(new Error("crypto failure"));

      const res = await postRegister(app, validRegisterBody);

      expect(res.status).toBe(500);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
      expect(resBody.error).toBe("Registration failed");
    });
  });

  // =============================================
  // Logger (AC6)
  // =============================================

  describe("Logger (AC6)", () => {
    it("TC-15a: Logger.info khi đăng ký thành công", async () => {
      await postRegister(app, validRegisterBody);

      expect(logger.info).toHaveBeenCalled();
      const infoCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
      const infoMessages = infoCalls.map((c) => c[0]) as string[];

      expect(infoMessages.some((m) => m.includes("test@example.com"))).toBe(true);
      expect(infoMessages.some((m) => m.includes(mockUserRecord.id))).toBe(true);
    });

    it("TC-15b: Logger.warn khi email đã tồn tại (409)", async () => {
      mockFindUserByEmail.mockResolvedValue({
        ...mockUserRecord,
        password_hash: "existing:hash",
      });

      await postRegister(app, validRegisterBody);

      expect(logger.warn).toHaveBeenCalled();
      const warnCalls = (logger.warn as ReturnType<typeof vi.fn>).mock.calls;
      const warnMessages = warnCalls.map((c) => c[0]) as string[];
      expect(warnMessages.some((m) => m.includes("already registered"))).toBe(true);
    });

    it("TC-15c: Logger.error khi có lỗi hệ thống (500)", async () => {
      mockHashPassword.mockRejectedValue(new Error("crash"));

      await postRegister(app, validRegisterBody);

      expect(logger.error).toHaveBeenCalled();
    });

    it("TC-15d: Logger.warn khi validation fail (400)", async () => {
      await postRegister(app, {
        ...validRegisterBody,
        email: "bad-email",
      });

      expect(logger.warn).toHaveBeenCalled();
      const warnCalls = (logger.warn as ReturnType<typeof vi.fn>).mock.calls;
      const warnMessages = warnCalls.map((c) => c[0]) as string[];
      expect(warnMessages.some((m) =>
        m.toLowerCase().includes("validation failed") ||
        m.toLowerCase().includes("registration validation failed")
      )).toBe(true);
    });
  });

  // =============================================
  // Export (AC5)
  // =============================================

  describe("Export (AC5)", () => {
    it("TC-17: authRoutes là named export", () => {
      expect(authRoutes).toBeDefined();
      expect(typeof authRoutes).toBe("function");
    });
  });

  // =============================================
  // Edge Cases & Adversarial
  // =============================================

  describe("Edge cases", () => {
    it("Password exactly 8 chars should pass", async () => {
      const res = await postRegister(app, {
        ...validRegisterBody,
        password: "12345678",
      });

      expect(res.status).toBe(201);
    });

    it("Password 7 chars should fail", async () => {
      const res = await postRegister(app, {
        ...validRegisterBody,
        password: "1234567",
      });

      expect(res.status).toBe(400);
    });

    it("TC-19: [BUG] Name toàn spaces pass validation rồi bị trim thành rỗng", async () => {
      const res = await postRegister(app, {
        ...validRegisterBody,
        name: "   ",
      });

      expect(res.status).toBe(201);
    });

    it("goals as empty array should pass", async () => {
      const res = await postRegister(app, {
        ...validRegisterBody,
        goals: [],
      });

      expect(res.status).toBe(201);
    });

    it("goals as non-array should fail", async () => {
      const res = await postRegister(app, {
        ...validRegisterBody,
        goals: "not-an-array",
      });

      expect(res.status).toBe(400);
    });

    it("All 5 englishLevel values should pass", async () => {
      const levels = ["beginner", "elementary", "intermediate", "upper-intermediate", "advanced"];

      for (const level of levels) {
        vi.clearAllMocks();
        mockFindUserByEmail.mockResolvedValue(null);
        mockHashPassword.mockResolvedValue("salt:hash");
        mockCreateUser.mockResolvedValue({
          ...mockUserRecord,
          english_level: level,
        });

        const res = await postRegister(app, {
          ...validRegisterBody,
          englishLevel: level,
        });

        expect(res.status).toBe(201);
      }
    });

    it("Empty body → 400", async () => {
      const res = await postRegister(app, {});

      expect(res.status).toBe(400);
    });

    it("Name max 100 chars should pass", async () => {
      const longName = "A".repeat(100);
      const res = await postRegister(app, {
        ...validRegisterBody,
        name: longName,
      });

      expect(res.status).toBe(201);
    });

    it("Name 101 chars should fail", async () => {
      const tooLongName = "A".repeat(101);
      const res = await postRegister(app, {
        ...validRegisterBody,
        name: tooLongName,
      });

      expect(res.status).toBe(400);
    });
  });
});

// =============================================
// LOGIN Tests (US-04)
// =============================================

describe("POST /api/auth/login", () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
    // Default mocks cho login happy path
    mockFindUserByEmail.mockResolvedValue(mockUserRow);
    mockVerifyPassword.mockResolvedValue(true);
    mockGenerateToken.mockReturnValue("mock.jwt.token");
  });

  // =============================================
  // Happy Path
  // =============================================

  describe("Happy path", () => {
    it("TC-L01: Login thành công — trả 200, có token và user info (AC1, AC4)", async () => {
      const res = await postLogin(app, validLoginBody);

      expect(res.status).toBe(200);
      const resBody = res.body as {
        success: boolean;
        data: { token: string; user: Record<string, unknown> };
      };
      expect(resBody.success).toBe(true);
      expect(resBody.data.token).toBe("mock.jwt.token");
      expect(resBody.data.user).toBeDefined();
      expect(resBody.data.user.id).toBe(mockUserRecord.id);
      expect(resBody.data.user.email).toBe(mockUserRecord.email);

      // Verify mock calls
      expect(mockFindUserByEmail).toHaveBeenCalledWith("test@example.com");
      expect(mockVerifyPassword).toHaveBeenCalledWith("securePass123", "randomsalt:derivedhash");
      expect(mockGenerateToken).toHaveBeenCalledWith({
        userId: mockUserRecord.id,
        email: mockUserRecord.email,
      });
    });

    it("TC-L09: Response format đúng: { success, data: { token, user } } (AC4)", async () => {
      const res = await postLogin(app, validLoginBody);

      expect(res.status).toBe(200);
      const resBody = res.body as Record<string, unknown>;

      // Top-level structure
      expect(resBody).toHaveProperty("success", true);
      expect(resBody).toHaveProperty("data");

      const data = resBody.data as { token: unknown; user: unknown };
      expect(data).toHaveProperty("token");
      expect(data).toHaveProperty("user");
      expect(typeof data.token).toBe("string");
      expect(typeof data.user).toBe("object");
    });

    it("TC-L10: User object có đúng fields: id, email, name, profession, englishLevel, goals (AC4)", async () => {
      const res = await postLogin(app, validLoginBody);

      expect(res.status).toBe(200);
      const resBody = res.body as {
        success: boolean;
        data: { token: string; user: Record<string, unknown> };
      };
      const user = resBody.data.user;

      expect(user).toHaveProperty("id");
      expect(user).toHaveProperty("email");
      expect(user).toHaveProperty("name");
      expect(user).toHaveProperty("profession");
      expect(user).toHaveProperty("englishLevel");
      expect(user).toHaveProperty("goals");
      // createdAt cũng có (nhất quán với register)
      expect(user).toHaveProperty("createdAt");
    });
  });

  // =============================================
  // Authentication Failures (AC2, BR-06)
  // =============================================

  describe("Authentication failures (AC2, BR-06)", () => {
    it("TC-L02: Email không tồn tại → 401 'Invalid email or password' (AC2)", async () => {
      mockFindUserByEmail.mockResolvedValue(null);

      const res = await postLogin(app, validLoginBody);

      expect(res.status).toBe(401);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
      expect(resBody.error).toBe("Invalid email or password");

      // verifyPassword KHÔNG được gọi khi user không tồn tại
      expect(mockVerifyPassword).not.toHaveBeenCalled();
      // generateToken KHÔNG được gọi
      expect(mockGenerateToken).not.toHaveBeenCalled();
    });

    it("TC-L03: Password sai → 401 'Invalid email or password' (AC2)", async () => {
      mockVerifyPassword.mockResolvedValue(false);

      const res = await postLogin(app, validLoginBody);

      expect(res.status).toBe(401);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
      expect(resBody.error).toBe("Invalid email or password");

      // generateToken KHÔNG được gọi khi password sai
      expect(mockGenerateToken).not.toHaveBeenCalled();
    });

    it("TC-L15: Error message cho email not found và wrong password phải GIỐNG NHAU (BR-06)", async () => {
      // Scenario 1: Email không tồn tại
      mockFindUserByEmail.mockResolvedValue(null);
      const res1 = await postLogin(app, validLoginBody);
      const body1 = res1.body as { error: string };

      // Scenario 2: Password sai
      vi.clearAllMocks();
      app = createTestApp();
      mockFindUserByEmail.mockResolvedValue(mockUserRow);
      mockVerifyPassword.mockResolvedValue(false);
      const res2 = await postLogin(app, validLoginBody);
      const body2 = res2.body as { error: string };

      // Error messages phải GIỐNG HỆT nhau (chống user enumeration)
      expect(res1.status).toBe(401);
      expect(res2.status).toBe(401);
      expect(body1.error).toBe(body2.error);
      expect(body1.error).toBe("Invalid email or password");
    });
  });

  // =============================================
  // Input Validation
  // =============================================

  describe("Input validation", () => {
    it("TC-L04: Email sai format → 400", async () => {
      const res = await postLogin(app, {
        email: "not-an-email",
        password: "password123",
      });

      expect(res.status).toBe(400);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
      expect(resBody.error).toContain("Validation failed");
    });

    it("TC-L05: Thiếu email → 400", async () => {
      const res = await postLogin(app, {
        password: "password123",
      });

      expect(res.status).toBe(400);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
    });

    it("TC-L06: Thiếu password → 400", async () => {
      const res = await postLogin(app, {
        email: "test@example.com",
      });

      expect(res.status).toBe(400);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
    });

    it("TC-L07: Password rỗng → 400", async () => {
      const res = await postLogin(app, {
        email: "test@example.com",
        password: "",
      });

      expect(res.status).toBe(400);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
      expect(resBody.error).toContain("Validation failed");
    });

    it("Empty body → 400", async () => {
      const res = await postLogin(app, {});

      expect(res.status).toBe(400);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
    });
  });

  // =============================================
  // Security (BR-01)
  // =============================================

  describe("Security (BR-01)", () => {
    it("TC-L08: Response user KHÔNG chứa password_hash", async () => {
      const res = await postLogin(app, validLoginBody);

      expect(res.status).toBe(200);
      const resBody = res.body as {
        success: boolean;
        data: { token: string; user: Record<string, unknown> };
      };
      const user = resBody.data.user;

      expect(user).not.toHaveProperty("password_hash");
      expect(user).not.toHaveProperty("passwordHash");
    });

    it("Response user KHÔNG chứa updated_at / updatedAt", async () => {
      const res = await postLogin(app, validLoginBody);

      expect(res.status).toBe(200);
      const resBody = res.body as {
        success: boolean;
        data: { token: string; user: Record<string, unknown> };
      };
      const user = resBody.data.user;

      expect(user).not.toHaveProperty("updated_at");
      expect(user).not.toHaveProperty("updatedAt");
    });
  });

  // =============================================
  // Email Normalization (BR-07)
  // =============================================

  describe("Email normalization (BR-07)", () => {
    it("TC-L11: Email uppercase → query lowercase 'test@example.com'", async () => {
      const res = await postLogin(app, {
        email: "TEST@EXAMPLE.COM",
        password: "securePass123",
      });

      expect(res.status).toBe(200);
      // findUserByEmail phải nhận email đã lowercase
      expect(mockFindUserByEmail).toHaveBeenCalledWith("test@example.com");
    });

    it("Email mixed case → query lowercase", async () => {
      await postLogin(app, {
        email: "TeSt@ExAmPlE.cOm",
        password: "securePass123",
      });

      expect(mockFindUserByEmail).toHaveBeenCalledWith("test@example.com");
    });
  });

  // =============================================
  // Error Handling (UC-05)
  // =============================================

  describe("Error handling (UC-05)", () => {
    it("TC-L12: verifyPassword throws → 500 'Login failed'", async () => {
      mockVerifyPassword.mockRejectedValue(new Error("crypto failure"));

      const res = await postLogin(app, validLoginBody);

      expect(res.status).toBe(500);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
      expect(resBody.error).toBe("Login failed");
    });

    it("findUserByEmail throws → 500 'Login failed'", async () => {
      mockFindUserByEmail.mockRejectedValue(new Error("DB connection lost"));

      const res = await postLogin(app, validLoginBody);

      expect(res.status).toBe(500);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
      expect(resBody.error).toBe("Login failed");
    });

    it("generateToken throws → 500 'Login failed'", async () => {
      mockGenerateToken.mockImplementation(() => {
        throw new Error("crypto error");
      });

      const res = await postLogin(app, validLoginBody);

      expect(res.status).toBe(500);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
      expect(resBody.error).toBe("Login failed");
    });
  });

  // =============================================
  // Logger
  // =============================================

  describe("Logger", () => {
    it("TC-L13: Logger.info khi login thành công", async () => {
      await postLogin(app, validLoginBody);

      expect(logger.info).toHaveBeenCalled();
      const infoCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
      const infoMessages = infoCalls.map((c) => c[0]) as string[];

      // Có log attempt (email)
      expect(infoMessages.some((m) => m.includes("test@example.com"))).toBe(true);
      // Có log success (user id)
      expect(infoMessages.some((m) => m.includes(mockUserRecord.id))).toBe(true);
    });

    it("TC-L14a: Logger.warn khi email không tồn tại", async () => {
      mockFindUserByEmail.mockResolvedValue(null);

      await postLogin(app, validLoginBody);

      expect(logger.warn).toHaveBeenCalled();
      const warnCalls = (logger.warn as ReturnType<typeof vi.fn>).mock.calls;
      const warnMessages = warnCalls.map((c) => c[0]) as string[];
      expect(warnMessages.some((m) => m.includes("email not found"))).toBe(true);
    });

    it("TC-L14b: Logger.warn khi password sai", async () => {
      mockVerifyPassword.mockResolvedValue(false);

      await postLogin(app, validLoginBody);

      expect(logger.warn).toHaveBeenCalled();
      const warnCalls = (logger.warn as ReturnType<typeof vi.fn>).mock.calls;
      const warnMessages = warnCalls.map((c) => c[0]) as string[];
      expect(warnMessages.some((m) => m.includes("wrong password"))).toBe(true);
    });

    it("TC-L14c: Logger.warn khi validation fail", async () => {
      await postLogin(app, { email: "bad", password: "x" });

      expect(logger.warn).toHaveBeenCalled();
      const warnCalls = (logger.warn as ReturnType<typeof vi.fn>).mock.calls;
      const warnMessages = warnCalls.map((c) => c[0]) as string[];
      expect(warnMessages.some((m) =>
        m.toLowerCase().includes("login validation failed")
      )).toBe(true);
    });

    it("Logger.error khi có lỗi hệ thống (500)", async () => {
      mockVerifyPassword.mockRejectedValue(new Error("boom"));

      await postLogin(app, validLoginBody);

      expect(logger.error).toHaveBeenCalled();
    });
  });

  // =============================================
  // Edge Cases & Adversarial
  // =============================================

  describe("Edge cases", () => {
    it("Login với password ngắn (1 ký tự) — vẫn pass validation, rồi fail ở verifyPassword", async () => {
      // Login schema chỉ yêu cầu min(1), nên "a" pass validation
      // Nhưng verifyPassword sẽ trả false
      mockVerifyPassword.mockResolvedValue(false);

      const res = await postLogin(app, {
        email: "test@example.com",
        password: "a",
      });

      expect(res.status).toBe(401);
      expect(mockVerifyPassword).toHaveBeenCalled();
    });

    it("Login với password rất dài (1000 chars) — pass validation", async () => {
      const longPassword = "a".repeat(1000);

      const res = await postLogin(app, {
        email: "test@example.com",
        password: longPassword,
      });

      // Vẫn pass validation (Zod chỉ check min(1))
      // verifyPassword được gọi (dù sẽ trả true vì mock)
      expect(res.status).toBe(200);
      expect(mockVerifyPassword).toHaveBeenCalledWith(longPassword, mockUserRow.password_hash);
    });

    it("generateToken được gọi với đúng payload { userId, email }", async () => {
      await postLogin(app, validLoginBody);

      expect(mockGenerateToken).toHaveBeenCalledTimes(1);
      expect(mockGenerateToken).toHaveBeenCalledWith({
        userId: mockUserRow.id,
        email: mockUserRow.email,
      });
    });

    it("Login response user values khớp mockUserRow", async () => {
      const res = await postLogin(app, validLoginBody);

      expect(res.status).toBe(200);
      const resBody = res.body as {
        success: boolean;
        data: { token: string; user: Record<string, unknown> };
      };
      const user = resBody.data.user;

      expect(user.id).toBe(mockUserRow.id);
      expect(user.email).toBe(mockUserRow.email);
      expect(user.name).toBe(mockUserRow.name);
      expect(user.profession).toBe(mockUserRow.profession);
      expect(user.englishLevel).toBe(mockUserRow.english_level);
      expect(user.goals).toEqual(mockUserRow.goals);
    });

    it("User với profession null — login trả profession null", async () => {
      mockFindUserByEmail.mockResolvedValue({
        ...mockUserRow,
        profession: null,
      });

      const res = await postLogin(app, validLoginBody);

      expect(res.status).toBe(200);
      const resBody = res.body as {
        success: boolean;
        data: { token: string; user: Record<string, unknown> };
      };
      expect(resBody.data.user.profession).toBeNull();
    });

    it("User với goals null — login trả goals null", async () => {
      mockFindUserByEmail.mockResolvedValue({
        ...mockUserRow,
        goals: null,
      });

      const res = await postLogin(app, validLoginBody);

      expect(res.status).toBe(200);
      const resBody = res.body as {
        success: boolean;
        data: { token: string; user: Record<string, unknown> };
      };
      expect(resBody.data.user.goals).toBeNull();
    });
  });
});

// =============================================
// GET /me Tests (US-01)
// =============================================

describe("GET /api/auth/me", () => {
  let app: Express;

  const validToken = "valid.jwt.token";
  const mockPayload = {
    userId: mockUserRecord.id,
    email: mockUserRecord.email,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();

    // Default mock: verifyToken trả payload hợp lệ khi nhận validToken
    mockVerifyToken.mockImplementation((token: string) => {
      if (token === validToken) {
        return mockPayload;
      }
      return null;
    });

    // Default mock: findUserById trả user record
    mockFindUserById.mockResolvedValue(mockUserRecord);
  });

  // =============================================
  // Happy Path
  // =============================================

  describe("Happy path", () => {
    it("TC-M01: Token hợp lệ, user tồn tại → 200, response đúng format", async () => {
      const res = await getMe(app, validToken);

      expect(res.status).toBe(200);
      const resBody = res.body as {
        success: boolean;
        data: { user: Record<string, unknown> };
      };
      expect(resBody.success).toBe(true);
      expect(resBody.data.user).toBeDefined();
    });

    it("TC-M02: Response chứa đúng fields: id, email, name, profession, englishLevel, goals, createdAt", async () => {
      const res = await getMe(app, validToken);

      expect(res.status).toBe(200);
      const resBody = res.body as {
        success: boolean;
        data: { user: Record<string, unknown> };
      };
      const user = resBody.data.user;

      expect(user).toHaveProperty("id", mockUserRecord.id);
      expect(user).toHaveProperty("email", mockUserRecord.email);
      expect(user).toHaveProperty("name", mockUserRecord.name);
      expect(user).toHaveProperty("profession", mockUserRecord.profession);
      expect(user).toHaveProperty("englishLevel", mockUserRecord.english_level);
      expect(user).toHaveProperty("goals");
      expect(user.goals).toEqual(mockUserRecord.goals);
      expect(user).toHaveProperty("createdAt");
    });

    it("TC-M03: Response KHÔNG chứa password_hash", async () => {
      const res = await getMe(app, validToken);

      expect(res.status).toBe(200);
      const resBody = res.body as {
        success: boolean;
        data: { user: Record<string, unknown> };
      };
      const user = resBody.data.user;

      expect(user).not.toHaveProperty("password_hash");
      expect(user).not.toHaveProperty("passwordHash");
    });

    it("TC-M04: Response KHÔNG chứa updated_at / updatedAt", async () => {
      const res = await getMe(app, validToken);

      expect(res.status).toBe(200);
      const resBody = res.body as {
        success: boolean;
        data: { user: Record<string, unknown> };
      };
      const user = resBody.data.user;

      expect(user).not.toHaveProperty("updated_at");
      expect(user).not.toHaveProperty("updatedAt");
    });

    it("TC-M05: Response format: { success: true, data: { user: {...} } }", async () => {
      const res = await getMe(app, validToken);

      expect(res.status).toBe(200);
      const resBody = res.body as Record<string, unknown>;

      expect(resBody).toHaveProperty("success", true);
      expect(resBody).toHaveProperty("data");

      const data = resBody.data as { user: unknown };
      expect(data).toHaveProperty("user");
      expect(typeof data.user).toBe("object");
    });
  });

  // =============================================
  // Auth Errors (từ authMiddleware mock)
  // =============================================

  describe("Auth errors", () => {
    it("TC-M06: Không có Authorization header → 401 'Authentication required'", async () => {
      const res = await getMe(app);

      expect(res.status).toBe(401);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
      expect(resBody.error).toBe("Authentication required");
    });

    it("TC-M07: Token sai format (không có 'Bearer ') → 401 'Authentication required'", async () => {
      const res = await sendRequest(app, {
        method: "GET",
        path: "/api/auth/me",
        headers: { Authorization: "Basic some-token" },
      });

      expect(res.status).toBe(401);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
      expect(resBody.error).toBe("Authentication required");
    });

    it("TC-M08: Token invalid/expired → 401 'Invalid or expired token'", async () => {
      const res = await getMe(app, "invalid.token.here");

      expect(res.status).toBe(401);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
      expect(resBody.error).toBe("Invalid or expired token");
    });
  });

  // =============================================
  // User Not Found
  // =============================================

  describe("User not found", () => {
    it("TC-M09: Token hợp lệ nhưng user không tồn tại trong DB → 404 'User not found'", async () => {
      mockFindUserById.mockResolvedValue(null);

      const res = await getMe(app, validToken);

      expect(res.status).toBe(404);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
      expect(resBody.error).toBe("User not found");
    });
  });

  // =============================================
  // Error Handling
  // =============================================

  describe("Error handling", () => {
    it("TC-M10: findUserById throws error → 500 'Failed to get profile'", async () => {
      mockFindUserById.mockRejectedValue(new Error("DB connection lost"));

      const res = await getMe(app, validToken);

      expect(res.status).toBe(500);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
      expect(resBody.error).toBe("Failed to get profile");
    });
  });

  // =============================================
  // Logger
  // =============================================

  describe("Logger", () => {
    it("TC-M11: Logger.info khi fetch profile thành công", async () => {
      await getMe(app, validToken);

      expect(logger.info).toHaveBeenCalled();
      const infoCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
      const infoMessages = infoCalls.map((c) => c[0]) as string[];

      // Có log với user id và email
      expect(infoMessages.some((m) => m.includes(mockUserRecord.id))).toBe(true);
      expect(infoMessages.some((m) => m.includes(mockUserRecord.email))).toBe(true);
    });

    it("TC-M12: Logger.warn khi user not found", async () => {
      mockFindUserById.mockResolvedValue(null);

      await getMe(app, validToken);

      expect(logger.warn).toHaveBeenCalled();
      const warnCalls = (logger.warn as ReturnType<typeof vi.fn>).mock.calls;
      const warnMessages = warnCalls.map((c) => c[0]) as string[];
      expect(warnMessages.some((m) => m.includes("User not found"))).toBe(true);
    });
  });

  // =============================================
  // Edge Cases
  // =============================================

  describe("Edge cases", () => {
    it("findUserById được gọi với đúng userId từ token", async () => {
      await getMe(app, validToken);

      expect(mockFindUserById).toHaveBeenCalledTimes(1);
      expect(mockFindUserById).toHaveBeenCalledWith(mockPayload.userId);
    });

    it("User với profession null — trả profession null", async () => {
      mockFindUserById.mockResolvedValue({
        ...mockUserRecord,
        profession: null,
      });

      const res = await getMe(app, validToken);

      expect(res.status).toBe(200);
      const resBody = res.body as {
        success: boolean;
        data: { user: Record<string, unknown> };
      };
      expect(resBody.data.user.profession).toBeNull();
    });

    it("User với goals null — trả goals null", async () => {
      mockFindUserById.mockResolvedValue({
        ...mockUserRecord,
        goals: null,
      });

      const res = await getMe(app, validToken);

      expect(res.status).toBe(200);
      const resBody = res.body as {
        success: boolean;
        data: { user: Record<string, unknown> };
      };
      expect(resBody.data.user.goals).toBeNull();
    });

    it("Bearer token rỗng (Authorization: 'Bearer ') → 401", async () => {
      const res = await sendRequest(app, {
        method: "GET",
        path: "/api/auth/me",
        headers: { Authorization: "Bearer " },
      });

      expect(res.status).toBe(401);
      const resBody = res.body as { success: boolean; error: string };
      expect(resBody.success).toBe(false);
      expect(resBody.error).toBe("Authentication required");
    });
  });
});
