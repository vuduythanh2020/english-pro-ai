import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger.js";
import { verifyToken } from "./auth/jwt.utils.js";

/**
 * TypeScript module augmentation — mở rộng Express Request để có req.user
 * Augment đúng module "express-serve-static-core" (core module của Express types)
 */
declare module "express-serve-static-core" {
  interface Request {
    user?: {
      userId: string;
      email: string;
    };
  }
}

/**
 * Error handling middleware
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  logger.error("Unhandled error:", err.message);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === "development" ? err.message : "Internal server error",
  });
}

/**
 * Request logging middleware
 */
export function requestLogger(req: Request, _res: Response, next: NextFunction) {
  logger.info(`${req.method} ${req.path}`);
  next();
}

/**
 * Validate required fields middleware factory
 */
export function requireFields(...fields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const missing = fields.filter((f) => !req.body[f]);
    if (missing.length > 0) {
      res.status(400).json({
        success: false,
        error: `Missing required fields: ${missing.join(", ")}`,
      });
      return;
    }
    next();
  };
}

/**
 * Auth Middleware — US-01
 * ============================================================================
 * Xác thực JWT token từ header Authorization: Bearer <token>.
 * Nếu hợp lệ, gắn req.user = { userId, email } để handler downstream sử dụng.
 *
 * Stateless — không query DB, mọi thông tin cần thiết nằm trong JWT payload.
 * Synchronous — verifyToken() là hàm đồng bộ, performance tối ưu.
 *
 * Error responses nhất quán format { success: false, error: "<message>" }:
 * - "Authentication required" → thiếu header hoặc sai format
 * - "Invalid or expired token" → token không verify được
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 1. Đọc Authorization header
  const authHeader = req.headers.authorization;

  // 2. Kiểm tra format "Bearer <token>"
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: "Authentication required",
    });
    return;
  }

  // 3. Extract token (sau "Bearer " — 7 ký tự)
  const token = authHeader.slice(7);

  // 4. Kiểm tra token không rỗng sau khi extract
  if (!token) {
    res.status(401).json({
      success: false,
      error: "Authentication required",
    });
    return;
  }

  // 5. Verify token bằng verifyToken() từ jwt.utils.ts
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({
      success: false,
      error: "Invalid or expired token",
    });
    return;
  }

  // 6. Gắn user info vào request object
  req.user = {
    userId: payload.userId,
    email: payload.email,
  };

  // 7. Cho phép tiếp tục tới handler
  next();
}
