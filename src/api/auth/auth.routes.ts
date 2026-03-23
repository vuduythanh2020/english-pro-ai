/**
 * Auth Routes — US-03, US-04 & US-01 (GET /me)
 * ============================================================================
 * API endpoints cho authentication:
 * - POST /api/auth/register — Đăng ký tài khoản (US-03)
 * - POST /api/auth/login    — Đăng nhập với JWT token (US-04)
 * - GET  /api/auth/me       — Lấy profile người dùng hiện tại (US-01)
 *
 * Sử dụng Zod để validate input, các module:
 * - password.utils.ts: hash & verify mật khẩu
 * - jwt.utils.ts: tạo JWT token (US-04)
 * - user.repository.ts: tương tác DB (createUser, findUserByEmail, findUserById)
 * - types.ts: UserRecord, EnglishLevel
 *
 * Response format nhất quán với toàn bộ API:
 * - Success: { success: true, data: { ... } }
 * - Error:   { success: false, error: "..." }
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { hashPassword, verifyPassword } from "./password.utils.js";
import { createUser, findUserByEmail, findUserById } from "./user.repository.js";
import { generateToken } from "./jwt.utils.js";
import { authMiddleware } from "../middleware.js";
import type { UserRecord } from "./types.js";
import { logger } from "../../utils/logger.js";

/**
 * Zod schema validate request body cho POST /register.
 *
 * - email: validate format + normalize (trim, lowercase) — BR-09
 * - password: min 8 ký tự — AC2, BR-03
 * - name: non-empty, max 100 — AC2, khớp DB VARCHAR(100)
 * - profession: optional, max 100 — khớp DB VARCHAR(100)
 * - englishLevel: optional, enum 5 giá trị — BR-08
 * - goals: optional, mảng string — BR-07
 */
const registerSchema = z.object({
  email: z
    .string()
    .email("Invalid email format")
    .transform((e) => e.trim().toLowerCase()),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters"),
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must not exceed 100 characters")
    .transform((n) => n.trim()),
  profession: z
    .string()
    .max(100)
    .optional(),
  englishLevel: z
    .enum(["beginner", "elementary", "intermediate", "upper-intermediate", "advanced"])
    .optional(),
  goals: z
    .array(z.string())
    .optional(),
});

/**
 * Zod schema validate request body cho POST /login.
 *
 * - email: validate format + normalize (trim, lowercase) — BR-07
 * - password: min(1) — chỉ cần không rỗng (login không enforce policy, chỉ validate presence)
 */
const loginSchema = z.object({
  email: z
    .string()
    .email("Invalid email format")
    .transform((e) => e.trim().toLowerCase()),
  password: z
    .string()
    .min(1, "Password is required"),
});

/**
 * Transform UserRecord (snake_case từ DB) sang camelCase cho API response.
 * Loại bỏ updated_at — AC4 chỉ yêu cầu: id, email, name, profession, englishLevel, goals, createdAt.
 */
function toUserResponse(record: UserRecord) {
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    profession: record.profession,
    englishLevel: record.english_level,
    goals: record.goals,
    createdAt: record.created_at,
  };
}

const router = Router();

/**
 * POST /register
 * Đăng ký tài khoản mới.
 *
 * Flow:
 * 1. Validate input (Zod) → 400 nếu lỗi
 * 2. Check duplicate email (findUserByEmail) → 409 nếu tồn tại
 * 3. Hash password (scrypt)
 * 4. Create user (INSERT DB)
 * 5. Return 201 với user info (camelCase, không có password_hash)
 */
router.post("/register", async (req: Request, res: Response) => {
  try {
    // 1. Validate input với Zod
    const parseResult = registerSchema.safeParse(req.body);

    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors
        .map((e) => e.message)
        .join(", ");

      logger.warn(`⚠️ [Auth] Registration validation failed: ${errorMessages}`);

      res.status(400).json({
        success: false,
        error: `Validation failed: ${errorMessages}`,
      });
      return;
    }

    const { email, password, name, profession, englishLevel, goals } = parseResult.data;

    logger.info(`📝 [Auth] Registration attempt for email: ${email}`);

    // 2. Check duplicate email
    const existingUser = await findUserByEmail(email);

    if (existingUser) {
      logger.warn(`⚠️ [Auth] Email already registered: ${email}`);

      res.status(409).json({
        success: false,
        error: "Email already registered",
      });
      return;
    }

    // 3. Hash password
    const passwordHash = await hashPassword(password);

    // 4. Create user trong DB
    const user = await createUser({
      email,
      passwordHash,
      name,
      profession,
      englishLevel,
      goals,
    });

    // Handle createUser trả null — có thể do race condition duplicate hoặc DB error
    if (!user) {
      logger.warn(`⚠️ [Auth] Failed to create user, possible race condition: ${email}`);

      res.status(409).json({
        success: false,
        error: "Email already registered",
      });
      return;
    }

    // 5. Return thành công
    logger.info(`✅ [Auth] User registered successfully: ${user.id} (${email})`);

    res.status(201).json({
      success: true,
      data: {
        user: toUserResponse(user),
      },
    });
  } catch (error) {
    logger.error(
      "❌ [Auth] Registration error:",
      error instanceof Error ? error.message : error
    );

    res.status(500).json({
      success: false,
      error: "Registration failed",
    });
  }
});

/**
 * POST /login
 * Đăng nhập với email và password, trả JWT token.
 *
 * Flow:
 * 1. Validate input (Zod) → 400 nếu lỗi
 * 2. Tìm user theo email (findUserByEmail) → 401 nếu không tìm thấy
 * 3. Verify password (verifyPassword) → 401 nếu sai
 * 4. Tạo JWT token (generateToken)
 * 5. Return 200 với token + user info
 *
 * Security:
 * - BR-06: Error message khi fail phải chung chung — chống user enumeration
 * - BR-01: Response KHÔNG chứa password_hash
 */
router.post("/login", async (req: Request, res: Response) => {
  try {
    // 1. Validate input với Zod
    const parseResult = loginSchema.safeParse(req.body);

    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors
        .map((e) => e.message)
        .join(", ");

      logger.warn(`⚠️ [Auth] Login validation failed: ${errorMessages}`);

      res.status(400).json({
        success: false,
        error: `Validation failed: ${errorMessages}`,
      });
      return;
    }

    const { email, password } = parseResult.data;

    logger.info(`🔑 [Auth] Login attempt for email: ${email}`);

    // 2. Tìm user theo email
    const user = await findUserByEmail(email);

    if (!user) {
      logger.warn(`⚠️ [Auth] Login failed — email not found: ${email}`);

      res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
      return;
    }

    // 3. Verify password
    const isValid = await verifyPassword(password, user.password_hash);

    if (!isValid) {
      logger.warn(`⚠️ [Auth] Login failed — wrong password for: ${email}`);

      res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
      return;
    }

    // 4. Tạo JWT token
    const token = generateToken({ userId: user.id, email: user.email });

    // 5. Response thành công
    logger.info(`✅ [Auth] Login successful: ${user.id} (${email})`);

    res.status(200).json({
      success: true,
      data: {
        token,
        user: toUserResponse(user),
      },
    });
  } catch (error) {
    logger.error(
      "❌ [Auth] Login error:",
      error instanceof Error ? error.message : error
    );

    res.status(500).json({
      success: false,
      error: "Login failed",
    });
  }
});

/**
 * GET /me
 * Lấy profile người dùng hiện tại từ JWT token.
 *
 * Flow:
 * 1. authMiddleware đã verify token và gắn req.user = { userId, email }
 * 2. Đọc req.user.userId
 * 3. findUserById(userId) → UserRecord | null
 * 4. Nếu null → 404 "User not found"
 * 5. Nếu có → 200 với user info (camelCase, qua toUserResponse)
 *
 * Security:
 * - BR-05: Route này PHẢI đi qua authMiddleware (protected)
 * - BR-01: Response KHÔNG chứa password_hash (toUserResponse đảm bảo)
 * - BR-03: Response camelCase nhất quán với register/login
 */
router.get("/me", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const user = await findUserById(userId);

    if (!user) {
      logger.warn(`⚠️ [Auth] User not found for token userId: ${userId}`);
      res.status(404).json({
        success: false,
        error: "User not found",
      });
      return;
    }

    logger.info(`✅ [Auth] Profile fetched: ${user.id} (${user.email})`);

    res.status(200).json({
      success: true,
      data: {
        user: toUserResponse(user),
      },
    });
  } catch (error) {
    logger.error(
      "❌ [Auth] Get profile error:",
      error instanceof Error ? error.message : error
    );

    res.status(500).json({
      success: false,
      error: "Failed to get profile",
    });
  }
});

export { router as authRoutes };
