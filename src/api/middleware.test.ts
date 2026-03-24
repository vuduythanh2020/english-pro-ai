/**
 * Unit Tests cho authMiddleware — US-01 + US-02 (Role in JWT)
 * ============================================================================
 * Test hàm authMiddleware trực tiếp với mock Express Request/Response/NextFunction.
 * Mock verifyToken từ jwt.utils.js bằng vi.mock().
 *
 * Test Cases:
 * - TC-M01: Thiếu Authorization header → 401 "Authentication required"
 * - TC-M02: Authorization header sai prefix (Basic) → 401 "Authentication required"
 * - TC-M03: Authorization header = "Bearer " (chỉ prefix, thiếu token) → 401 "Authentication required"
 * - TC-M04: Token hết hạn (verifyToken trả null) → 401 "Invalid or expired token"
 * - TC-M05: Token invalid signature (verifyToken trả null) → 401 "Invalid or expired token"
 * - TC-M06: Token hợp lệ → gắn req.user và gọi next()
 * - TC-M07: Token hợp lệ → res.status() và res.json() KHÔNG được gọi
 * - TC-M08: req.user chứa userId, email, role (không chứa iat, exp)
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

import { authMiddleware } from "./middleware.js";

// =============================================
// Helpers: tạo mock Request/Response/NextFunction
// =============================================

interface MockRequest {
  headers: Record<string, string | undefined>;
  user?: { userId: string; email: string; role: string };
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
  // Chainable: res.status(401).json({...})
  res.status.mockReturnValue(res);
  return res;
}

// =============================================
// Test Suite
// =============================================

describe("authMiddleware — US-01 + US-02", () => {
  let mockNext: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNext = vi.fn();
  });

  // =============================================
  // Missing / Invalid Authorization Header
  // =============================================

  describe("Missing or invalid Authorization header", () => {
    it("TC-M01: Thiếu Authorization header → 401 'Authentication required'", () => {
      const req = createMockReq({});
      const res = createMockRes();

      authMiddleware(req as unknown as Request, res as unknown as Response, mockNext as NextFunction);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Authentication required",
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockVerifyToken).not.toHaveBeenCalled();
    });

    it("TC-M02: Authorization header sai prefix (Basic) → 401 'Authentication required'", () => {
      const req = createMockReq({ authorization: "Basic abc123xyz" });
      const res = createMockRes();

      authMiddleware(req as unknown as Request, res as unknown as Response, mockNext as NextFunction);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Authentication required",
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockVerifyToken).not.toHaveBeenCalled();
    });

    it("TC-M03: Authorization header = 'Bearer ' (chỉ prefix, thiếu token) → 401 'Authentication required'", () => {
      const req = createMockReq({ authorization: "Bearer " });
      const res = createMockRes();

      authMiddleware(req as unknown as Request, res as unknown as Response, mockNext as NextFunction);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Authentication required",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  // =============================================
  // Invalid / Expired Token
  // =============================================

  describe("Invalid or expired token", () => {
    it("TC-M04: Token hết hạn (verifyToken trả null) → 401 'Invalid or expired token'", () => {
      mockVerifyToken.mockReturnValue(null);
      const req = createMockReq({ authorization: "Bearer expired.token.here" });
      const res = createMockRes();

      authMiddleware(req as unknown as Request, res as unknown as Response, mockNext as NextFunction);

      expect(mockVerifyToken).toHaveBeenCalledWith("expired.token.here");
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Invalid or expired token",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("TC-M05: Token invalid signature (verifyToken trả null) → 401 'Invalid or expired token'", () => {
      mockVerifyToken.mockReturnValue(null);
      const req = createMockReq({ authorization: "Bearer tampered.token.badsig" });
      const res = createMockRes();

      authMiddleware(req as unknown as Request, res as unknown as Response, mockNext as NextFunction);

      expect(mockVerifyToken).toHaveBeenCalledWith("tampered.token.badsig");
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Invalid or expired token",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  // =============================================
  // Valid Token — Happy Path
  // =============================================

  describe("Valid token", () => {
    const mockPayload = {
      userId: "550e8400-e29b-41d4-a716-446655440000",
      email: "user@example.com",
      role: "user",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    it("TC-M06: Token hợp lệ → gắn req.user và gọi next()", () => {
      mockVerifyToken.mockReturnValue(mockPayload);
      const req = createMockReq({ authorization: "Bearer valid.token.here" });
      const res = createMockRes();

      authMiddleware(req as unknown as Request, res as unknown as Response, mockNext as NextFunction);

      expect(mockVerifyToken).toHaveBeenCalledWith("valid.token.here");
      expect(req.user).toEqual({
        userId: mockPayload.userId,
        email: mockPayload.email,
        role: mockPayload.role,
      });
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it("TC-M07: Token hợp lệ → res.status() và res.json() KHÔNG được gọi", () => {
      mockVerifyToken.mockReturnValue(mockPayload);
      const req = createMockReq({ authorization: "Bearer valid.token.here" });
      const res = createMockRes();

      authMiddleware(req as unknown as Request, res as unknown as Response, mockNext as NextFunction);

      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it("TC-M08: req.user chứa userId, email, role (không chứa iat, exp)", () => {
      mockVerifyToken.mockReturnValue(mockPayload);
      const req = createMockReq({ authorization: "Bearer valid.token.here" });
      const res = createMockRes();

      authMiddleware(req as unknown as Request, res as unknown as Response, mockNext as NextFunction);

      expect(req.user).toBeDefined();
      const userKeys = Object.keys(req.user!);
      expect(userKeys).toHaveLength(3);
      expect(userKeys).toContain("userId");
      expect(userKeys).toContain("email");
      expect(userKeys).toContain("role");
      expect(req.user).not.toHaveProperty("iat");
      expect(req.user).not.toHaveProperty("exp");
    });
  });
});
