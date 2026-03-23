/**
 * Adversarial / Edge-case Tests cho authMiddleware — US-01 (Tester Agent)
 * ============================================================================
 * Bổ sung các test cases ngoài 8 test cases cơ bản từ Dev.
 * Tập trung vào edge cases, adversarial inputs, và integration verification.
 *
 * Test Cases:
 * - TC-ADV-01: Authorization header = "bearer " (lowercase) → 401
 * - TC-ADV-02: Authorization header = "BEARER " (uppercase) → 401
 * - TC-ADV-03: Authorization header = "BearerToken" (không có space) → 401
 * - TC-ADV-04: Authorization header = "" (empty string) → 401
 * - TC-ADV-05: Token chứa nhiều dots (>3 phần) → verifyToken được gọi, trả null → 401
 * - TC-ADV-06: Token chỉ có 1 phần (không có dot) → verifyToken được gọi, trả null → 401
 * - TC-ADV-07: Authorization header = "Bearer  " (extra space) → verifyToken gọi với " "
 * - TC-ADV-08: authMiddleware KHÔNG gọi next() khi trả 401 (verify cho TẤT CẢ failure cases)
 * - TC-ADV-09: Multiple calls — middleware hoạt động đúng khi gọi nhiều lần liên tiếp
 * - TC-ADV-10: req.user KHÔNG tồn tại trước khi middleware chạy (undefined)
 * - TC-ADV-11: Verify middleware export từ đúng module path
 * - TC-ADV-12: Verify authMiddleware là synchronous (không return Promise)
 * - TC-ADV-13: Authorization header có spaces thừa giữa "Bearer" và token
 * - TC-ADV-14: Verify response Content-Type ngầm định (json)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// =============================================
// Mock verifyToken TRƯỚC KHI import middleware
// =============================================

const mockVerifyToken = vi.fn();

vi.mock("./auth/jwt.utils.js", () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));

vi.mock("../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { authMiddleware, errorHandler, requestLogger, requireFields } from "./middleware.js";

// =============================================
// Helpers
// =============================================

interface MockRequest {
  headers: Record<string, string | undefined>;
  user?: { userId: string; email: string };
  method?: string;
  path?: string;
  body?: unknown;
}

interface MockResponse {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}

function createMockReq(headers: Record<string, string | undefined> = {}): MockRequest {
  return {
    headers,
    method: "POST",
    path: "/api/chat",
    body: {},
  };
}

function createMockRes(): MockResponse {
  const res: MockResponse = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

// =============================================
// Adversarial Test Suite
// =============================================

describe("authMiddleware — Adversarial & Edge-case Tests (Tester Agent)", () => {
  let mockNext: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNext = vi.fn();
  });

  // =============================================
  // Case Sensitivity & Format Edge Cases
  // =============================================

  describe("Case sensitivity và format edge cases", () => {
    it("TC-ADV-01: Authorization header = 'bearer token' (lowercase) → 401 Authentication required", () => {
      const req = createMockReq({ authorization: "bearer some.valid.token" });
      const res = createMockRes();

      authMiddleware(req as unknown as Request, res as unknown as Response, mockNext as NextFunction);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Authentication required",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("TC-ADV-02: Authorization header = 'BEARER token' (uppercase) → 401 Authentication required", () => {
      const req = createMockReq({ authorization: "BEARER some.valid.token" });
      const res = createMockRes();

      authMiddleware(req as unknown as Request, res as unknown as Response, mockNext as NextFunction);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Authentication required",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("TC-ADV-03: Authorization header = 'BearerToken' (không có space) → 401 Authentication required", () => {
      const req = createMockReq({ authorization: "BearerSomeToken" });
      const res = createMockRes();

      authMiddleware(req as unknown as Request, res as unknown as Response, mockNext as NextFunction);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Authentication required",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("TC-ADV-04: Authorization header = '' (empty string) → 401 Authentication required", () => {
      const req = createMockReq({ authorization: "" });
      const res = createMockRes();

      authMiddleware(req as unknown as Request, res as unknown as Response, mockNext as NextFunction);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Authentication required",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("TC-ADV-13: Authorization header = 'Bearer  token' (double space) → verifyToken gọi với ' token'", () => {
      // "Bearer  token".slice(7) = " token" (bắt đầu bằng space)
      // verifyToken sẽ được gọi với " token" và trả null
      mockVerifyToken.mockReturnValue(null);
      const req = createMockReq({ authorization: "Bearer  some.token" });
      const res = createMockRes();

      authMiddleware(req as unknown as Request, res as unknown as Response, mockNext as NextFunction);

      // Middleware nên vẫn gọi verifyToken vì "Bearer " match, nhưng token = " some.token"
      expect(mockVerifyToken).toHaveBeenCalledWith(" some.token");
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Invalid or expired token",
      });
    });
  });

  // =============================================
  // Token Format Edge Cases
  // =============================================

  describe("Token format edge cases", () => {
    it("TC-ADV-05: Token chứa nhiều dots (>3 phần) → verifyToken gọi, trả null → 401", () => {
      mockVerifyToken.mockReturnValue(null);
      const req = createMockReq({ authorization: "Bearer a.b.c.d.e" });
      const res = createMockRes();

      authMiddleware(req as unknown as Request, res as unknown as Response, mockNext as NextFunction);

      expect(mockVerifyToken).toHaveBeenCalledWith("a.b.c.d.e");
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Invalid or expired token",
      });
    });

    it("TC-ADV-06: Token chỉ có 1 phần (không có dot) → verifyToken gọi, trả null → 401", () => {
      mockVerifyToken.mockReturnValue(null);
      const req = createMockReq({ authorization: "Bearer singletokenpart" });
      const res = createMockRes();

      authMiddleware(req as unknown as Request, res as unknown as Response, mockNext as NextFunction);

      expect(mockVerifyToken).toHaveBeenCalledWith("singletokenpart");
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("TC-ADV-07: Authorization = 'Bearer  ' (Bearer + extra space only) → verifyToken gọi với space", () => {
      mockVerifyToken.mockReturnValue(null);
      const req = createMockReq({ authorization: "Bearer  " });
      const res = createMockRes();

      authMiddleware(req as unknown as Request, res as unknown as Response, mockNext as NextFunction);

      // "Bearer  ".slice(7) = " " (one space)
      expect(mockVerifyToken).toHaveBeenCalledWith(" ");
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  // =============================================
  // Behavioral Verification
  // =============================================

  describe("Behavioral verification", () => {
    it("TC-ADV-08: next() KHÔNG BAO GIỜ được gọi khi trả 401 — tất cả failure paths", () => {
      const failureCases = [
        { headers: {}, desc: "no header" },
        { headers: { authorization: "Basic xyz" }, desc: "wrong prefix" },
        { headers: { authorization: "Bearer " }, desc: "empty token" },
        { headers: { authorization: "Bearer invalid.token" }, desc: "invalid token" },
      ];

      for (const tc of failureCases) {
        vi.clearAllMocks();
        mockVerifyToken.mockReturnValue(null);
        const req = createMockReq(tc.headers);
        const res = createMockRes();
        const next = vi.fn();

        authMiddleware(req as unknown as Request, res as unknown as Response, next as NextFunction);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
      }
    });

    it("TC-ADV-09: Multiple calls — middleware hoạt động đúng khi gọi nhiều lần liên tiếp", () => {
      const validPayload = {
        userId: "user-1",
        email: "test@test.com",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      // Call 1: valid token
      mockVerifyToken.mockReturnValue(validPayload);
      const req1 = createMockReq({ authorization: "Bearer valid.token.1" });
      const res1 = createMockRes();
      const next1 = vi.fn();
      authMiddleware(req1 as unknown as Request, res1 as unknown as Response, next1 as NextFunction);
      expect(next1).toHaveBeenCalledTimes(1);
      expect(req1.user).toEqual({ userId: "user-1", email: "test@test.com" });

      // Call 2: invalid token
      mockVerifyToken.mockReturnValue(null);
      const req2 = createMockReq({ authorization: "Bearer invalid.token" });
      const res2 = createMockRes();
      const next2 = vi.fn();
      authMiddleware(req2 as unknown as Request, res2 as unknown as Response, next2 as NextFunction);
      expect(next2).not.toHaveBeenCalled();
      expect(res2.status).toHaveBeenCalledWith(401);

      // Call 3: no header
      const req3 = createMockReq({});
      const res3 = createMockRes();
      const next3 = vi.fn();
      authMiddleware(req3 as unknown as Request, res3 as unknown as Response, next3 as NextFunction);
      expect(next3).not.toHaveBeenCalled();
      expect(res3.status).toHaveBeenCalledWith(401);
    });

    it("TC-ADV-10: req.user KHÔNG tồn tại trước khi middleware chạy (là undefined)", () => {
      const req = createMockReq({ authorization: "Bearer " });
      expect(req.user).toBeUndefined();

      const res = createMockRes();
      authMiddleware(req as unknown as Request, res as unknown as Response, mockNext as NextFunction);

      // req.user vẫn undefined vì auth fail
      expect(req.user).toBeUndefined();
    });

    it("TC-ADV-12: authMiddleware là synchronous — return type là void (không phải Promise)", () => {
      mockVerifyToken.mockReturnValue(null);
      const req = createMockReq({ authorization: "Bearer test" });
      const res = createMockRes();

      const result = authMiddleware(req as unknown as Request, res as unknown as Response, mockNext as NextFunction);

      // Synchronous function returns undefined (void), NOT a Promise
      expect(result).toBeUndefined();
      // Verify nó KHÔNG phải Promise
      expect(result).not.toBeInstanceOf(Promise);
    });
  });

  // =============================================
  // Module Export Verification
  // =============================================

  describe("Module exports verification", () => {
    it("TC-ADV-11: authMiddleware được export đúng từ middleware.ts", () => {
      expect(authMiddleware).toBeDefined();
      expect(typeof authMiddleware).toBe("function");
      expect(authMiddleware.length).toBe(3); // Express middleware luôn có 3 params: req, res, next
    });

    it("TC-ADV-11b: Các middleware cũ vẫn export đúng — không bị break", () => {
      expect(errorHandler).toBeDefined();
      expect(typeof errorHandler).toBe("function");

      expect(requestLogger).toBeDefined();
      expect(typeof requestLogger).toBe("function");

      expect(requireFields).toBeDefined();
      expect(typeof requireFields).toBe("function");
    });
  });

  // =============================================
  // Route Integration Verification (src/index.ts)
  // =============================================

  describe("Route Integration Verification", () => {
    it("TC-INT-01: Verify authMiddleware được import và áp dụng trong index.ts", async () => {
      const fs = await import("fs");
      const indexSource = fs.readFileSync("src/index.ts", "utf-8");

      // AC6: authMiddleware được import
      expect(indexSource).toContain('import { authMiddleware');
      expect(indexSource).toContain('./api/middleware.js');

      // AC6: Áp dụng vào /api/chat
      expect(indexSource).toContain('app.use("/api/chat", authMiddleware, chatRoutes)');
    });

    it("TC-INT-02: Verify /api/auth routes KHÔNG có authMiddleware trong index.ts", async () => {
      const fs = await import("fs");
      const indexSource = fs.readFileSync("src/index.ts", "utf-8");

      // AC6: /api/auth KHÔNG qua auth
      const authLine = indexSource.split("\n").find(line => line.includes('"/api/auth"'));
      expect(authLine).toBeDefined();
      expect(authLine).not.toContain("authMiddleware");
    });

    it("TC-INT-03: Verify /api/dev-team routes KHÔNG có authMiddleware trong index.ts (AC7)", async () => {
      const fs = await import("fs");
      const indexSource = fs.readFileSync("src/index.ts", "utf-8");

      // AC7: /api/dev-team KHÔNG qua auth (tạm thời)
      const devTeamLine = indexSource.split("\n").find(line => line.includes('"/api/dev-team"'));
      expect(devTeamLine).toBeDefined();
      expect(devTeamLine).not.toContain("authMiddleware");
    });

    it("TC-INT-04: Verify /api/health route KHÔNG có authMiddleware trong index.ts", async () => {
      const fs = await import("fs");
      const indexSource = fs.readFileSync("src/index.ts", "utf-8");

      // AC6: /api/health KHÔNG qua auth
      const healthLine = indexSource.split("\n").find(line => line.includes('"/api/health"'));
      expect(healthLine).toBeDefined();
      expect(healthLine).not.toContain("authMiddleware");
    });
  });

  // =============================================
  // Response Format Consistency Verification
  // =============================================

  describe("Response format consistency", () => {
    it("TC-ADV-14: Error response có đúng 2 keys: success và error", () => {
      const req = createMockReq({});
      const res = createMockRes();

      authMiddleware(req as unknown as Request, res as unknown as Response, mockNext as NextFunction);

      const jsonCall = res.json.mock.calls[0][0];
      expect(Object.keys(jsonCall)).toHaveLength(2);
      expect(jsonCall).toHaveProperty("success", false);
      expect(jsonCall).toHaveProperty("error");
    });

    it("TC-ADV-15: error message cho missing header vs invalid token phải KHÁC nhau (BR-06)", () => {
      // Case 1: Missing header
      const req1 = createMockReq({});
      const res1 = createMockRes();
      authMiddleware(req1 as unknown as Request, res1 as unknown as Response, mockNext as NextFunction);
      const error1 = res1.json.mock.calls[0][0].error;

      // Case 2: Invalid token
      vi.clearAllMocks();
      mockVerifyToken.mockReturnValue(null);
      const req2 = createMockReq({ authorization: "Bearer bad.token" });
      const res2 = createMockRes();
      const next2 = vi.fn();
      authMiddleware(req2 as unknown as Request, res2 as unknown as Response, next2 as NextFunction);
      const error2 = res2.json.mock.calls[0][0].error;

      // 2 error messages phải KHÁC nhau theo BR-06
      expect(error1).not.toBe(error2);
      expect(error1).toBe("Authentication required");
      expect(error2).toBe("Invalid or expired token");
    });
  });
});
