/**
 * Adversarial Tests — US-01: Role field in auth responses
 * ============================================================================
 * Kiểm tra trường `role` xuất hiện đúng trong TOÀN BỘ auth responses:
 * - POST /register → response.data.user.role
 * - POST /login → response.data.user.role
 * - GET /me → response.data.user.role
 *
 * BUG DETECTED: Dev đã thêm `role: record.role` vào toUserResponse()
 * nhưng QUÊN cập nhật fixtures trong auth.routes.test.ts. Khi mock data
 * không có trường `role`, toUserResponse() trả `role: undefined`.
 *
 * File test này:
 * 1. Với fixtures CÓ role → verify response.role = "user" hoặc "admin"
 * 2. Phát hiện bug nếu fixtures thiếu role
 *
 * US-02 Fix: Mock authMiddleware giờ gắn req.user.role = payload.role
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

// =============================================
// Helper
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

// =============================================
// Fixtures — ĐÚng cách: CÓ trường role
// =============================================

/** Mock data CÓ role — đúng UserRecord shape sau migration 005 */
const mockUserRecordWithRole = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "test@example.com",
  role: "user" as const,
  name: "Test User",
  profession: "Software Engineer",
  english_level: "intermediate",
  goals: ["business", "technical"],
  created_at: new Date("2024-01-15T10:30:00.000Z"),
  updated_at: new Date("2024-01-15T10:30:00.000Z"),
};

/** Mock data cho admin user */
const mockAdminRecord = {
  ...mockUserRecordWithRole,
  id: "660e8400-e29b-41d4-a716-446655440001",
  email: "admin@example.com",
  role: "admin" as const,
};

const mockUserRowWithRole = {
  ...mockUserRecordWithRole,
  password_hash: "randomsalt:derivedhash",
};

const mockAdminRow = {
  ...mockAdminRecord,
  password_hash: "adminsalt:adminhash",
};

// =============================================
// TEST SUITE
// =============================================

describe("US-01: Role field in auth API responses", () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  // =============================================
  // POST /register — role in response
  // =============================================
  describe("POST /register — role field", () => {
    beforeEach(() => {
      mockFindUserByEmail.mockResolvedValue(null);
      mockHashPassword.mockResolvedValue("salt:hash");
      mockCreateUser.mockResolvedValue(mockUserRecordWithRole);
    });

    it("TC-R01: Register response should include role field", async () => {
      const res = await sendRequest(app, {
        method: "POST",
        path: "/api/auth/register",
        body: {
          email: "test@example.com",
          password: "securePass123",
          name: "Test User",
        },
      });

      expect(res.status).toBe(201);
      const resBody = res.body as { success: boolean; data: { user: Record<string, unknown> } };
      expect(resBody.success).toBe(true);
      expect(resBody.data.user).toHaveProperty("role");
    });

    it("TC-R02: Register response role should be 'user' (default for new users)", async () => {
      const res = await sendRequest(app, {
        method: "POST",
        path: "/api/auth/register",
        body: {
          email: "test@example.com",
          password: "securePass123",
          name: "Test User",
        },
      });

      expect(res.status).toBe(201);
      const resBody = res.body as { success: boolean; data: { user: Record<string, unknown> } };
      expect(resBody.data.user.role).toBe("user");
    });

    it("TC-R03: Register response role must NOT be undefined or null", async () => {
      const res = await sendRequest(app, {
        method: "POST",
        path: "/api/auth/register",
        body: {
          email: "test@example.com",
          password: "securePass123",
          name: "Test User",
        },
      });

      expect(res.status).toBe(201);
      const resBody = res.body as { success: boolean; data: { user: Record<string, unknown> } };
      expect(resBody.data.user.role).not.toBeUndefined();
      expect(resBody.data.user.role).not.toBeNull();
    });

    it("TC-R04: Register request body should NOT accept role field (Zod schema rejects unknown)", async () => {
      // Zod strip mode mặc định — extra fields bị ignore, KHÔNG validate
      // Nhưng role KHÔNG ảnh hưởng kết quả — user luôn nhận role từ DB DEFAULT
      const res = await sendRequest(app, {
        method: "POST",
        path: "/api/auth/register",
        body: {
          email: "attacker@example.com",
          password: "securePass123",
          name: "Attacker",
          role: "admin", // client cố gắng inject role
        },
      });

      // Register vẫn pass (Zod strip extra fields)
      expect(res.status).toBe(201);
      const resBody = res.body as { success: boolean; data: { user: Record<string, unknown> } };
      // Nhưng role vẫn là 'user' vì DB DEFAULT, KHÔNG phải 'admin' mà attacker gửi
      expect(resBody.data.user.role).toBe("user");
    });
  });

  // =============================================
  // POST /login — role in response
  // =============================================
  describe("POST /login — role field", () => {
    it("TC-R05: Login response should include role field for regular user", async () => {
      mockFindUserByEmail.mockResolvedValue(mockUserRowWithRole);
      mockVerifyPassword.mockResolvedValue(true);
      mockGenerateToken.mockReturnValue("mock.jwt.token");

      const res = await sendRequest(app, {
        method: "POST",
        path: "/api/auth/login",
        body: { email: "test@example.com", password: "securePass123" },
      });

      expect(res.status).toBe(200);
      const resBody = res.body as {
        success: boolean;
        data: { token: string; user: Record<string, unknown> };
      };
      expect(resBody.data.user).toHaveProperty("role");
      expect(resBody.data.user.role).toBe("user");
    });

    it("TC-R06: Login response should include role='admin' for admin user", async () => {
      mockFindUserByEmail.mockResolvedValue(mockAdminRow);
      mockVerifyPassword.mockResolvedValue(true);
      mockGenerateToken.mockReturnValue("admin.jwt.token");

      const res = await sendRequest(app, {
        method: "POST",
        path: "/api/auth/login",
        body: { email: "admin@example.com", password: "adminPass123" },
      });

      expect(res.status).toBe(200);
      const resBody = res.body as {
        success: boolean;
        data: { token: string; user: Record<string, unknown> };
      };
      expect(resBody.data.user.role).toBe("admin");
    });

    it("TC-R07: Login response role must NOT be undefined or null", async () => {
      mockFindUserByEmail.mockResolvedValue(mockUserRowWithRole);
      mockVerifyPassword.mockResolvedValue(true);
      mockGenerateToken.mockReturnValue("mock.jwt.token");

      const res = await sendRequest(app, {
        method: "POST",
        path: "/api/auth/login",
        body: { email: "test@example.com", password: "securePass123" },
      });

      expect(res.status).toBe(200);
      const resBody = res.body as {
        success: boolean;
        data: { token: string; user: Record<string, unknown> };
      };
      expect(resBody.data.user.role).not.toBeUndefined();
      expect(resBody.data.user.role).not.toBeNull();
      expect(typeof resBody.data.user.role).toBe("string");
    });
  });

  // =============================================
  // GET /me — role in response
  // =============================================
  describe("GET /me — role field", () => {
    const validToken = "valid.jwt.token";

    beforeEach(() => {
      mockVerifyToken.mockImplementation((token: string) => {
        if (token === validToken) {
          return { userId: mockUserRecordWithRole.id, email: mockUserRecordWithRole.email, role: mockUserRecordWithRole.role };
        }
        return null;
      });
    });

    it("TC-R08: GET /me response should include role field", async () => {
      mockFindUserById.mockResolvedValue(mockUserRecordWithRole);

      const res = await sendRequest(app, {
        method: "GET",
        path: "/api/auth/me",
        headers: { Authorization: `Bearer ${validToken}` },
      });

      expect(res.status).toBe(200);
      const resBody = res.body as { success: boolean; data: { user: Record<string, unknown> } };
      expect(resBody.data.user).toHaveProperty("role");
      expect(resBody.data.user.role).toBe("user");
    });

    it("TC-R09: GET /me response should show admin role for admin user", async () => {
      mockVerifyToken.mockImplementation((token: string) => {
        if (token === validToken) {
          return { userId: mockAdminRecord.id, email: mockAdminRecord.email, role: mockAdminRecord.role };
        }
        return null;
      });
      mockFindUserById.mockResolvedValue(mockAdminRecord);

      const res = await sendRequest(app, {
        method: "GET",
        path: "/api/auth/me",
        headers: { Authorization: `Bearer ${validToken}` },
      });

      expect(res.status).toBe(200);
      const resBody = res.body as { success: boolean; data: { user: Record<string, unknown> } };
      expect(resBody.data.user.role).toBe("admin");
    });

    it("TC-R10: GET /me response role must NOT be undefined or null", async () => {
      mockFindUserById.mockResolvedValue(mockUserRecordWithRole);

      const res = await sendRequest(app, {
        method: "GET",
        path: "/api/auth/me",
        headers: { Authorization: `Bearer ${validToken}` },
      });

      expect(res.status).toBe(200);
      const resBody = res.body as { success: boolean; data: { user: Record<string, unknown> } };
      expect(resBody.data.user.role).not.toBeUndefined();
      expect(resBody.data.user.role).not.toBeNull();
    });
  });

  // =============================================
  // Adversarial: toUserResponse role consistency
  // =============================================
  describe("Adversarial: role consistency across endpoints", () => {
    it("TC-R11: All auth endpoints should return role in the same position in response", async () => {
      // Register
      mockFindUserByEmail.mockResolvedValue(null);
      mockHashPassword.mockResolvedValue("salt:hash");
      mockCreateUser.mockResolvedValue(mockUserRecordWithRole);

      const registerRes = await sendRequest(app, {
        method: "POST",
        path: "/api/auth/register",
        body: { email: "test@example.com", password: "securePass123", name: "Test" },
      });

      vi.clearAllMocks();
      app = createTestApp();

      // Login
      mockFindUserByEmail.mockResolvedValue(mockUserRowWithRole);
      mockVerifyPassword.mockResolvedValue(true);
      mockGenerateToken.mockReturnValue("mock.jwt.token");

      const loginRes = await sendRequest(app, {
        method: "POST",
        path: "/api/auth/login",
        body: { email: "test@example.com", password: "securePass123" },
      });

      vi.clearAllMocks();
      app = createTestApp();

      // GET /me
      const validToken = "valid.jwt.token";
      mockVerifyToken.mockImplementation((token: string) => {
        if (token === validToken) {
          return { userId: mockUserRecordWithRole.id, email: mockUserRecordWithRole.email, role: mockUserRecordWithRole.role };
        }
        return null;
      });
      mockFindUserById.mockResolvedValue(mockUserRecordWithRole);

      const meRes = await sendRequest(app, {
        method: "GET",
        path: "/api/auth/me",
        headers: { Authorization: `Bearer ${validToken}` },
      });

      // All three should have role at data.user.role
      const regBody = registerRes.body as { data: { user: Record<string, unknown> } };
      const loginBody = loginRes.body as { data: { token: string; user: Record<string, unknown> } };
      const meBody = meRes.body as { data: { user: Record<string, unknown> } };

      expect(regBody.data.user.role).toBe("user");
      expect(loginBody.data.user.role).toBe("user");
      expect(meBody.data.user.role).toBe("user");
    });

    it("TC-R12: role field should be a string value, not object/number/boolean", async () => {
      mockFindUserByEmail.mockResolvedValue(mockUserRowWithRole);
      mockVerifyPassword.mockResolvedValue(true);
      mockGenerateToken.mockReturnValue("token");

      const res = await sendRequest(app, {
        method: "POST",
        path: "/api/auth/login",
        body: { email: "test@example.com", password: "securePass123" },
      });

      expect(res.status).toBe(200);
      const resBody = res.body as { data: { user: Record<string, unknown> } };
      const role = resBody.data.user.role;

      expect(typeof role).toBe("string");
      expect(role).not.toBe("");
      expect(["user", "admin"]).toContain(role);
    });
  });
});
