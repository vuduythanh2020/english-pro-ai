/**
 * Auth Routes — US-03 (Google OAuth) + US-04, US-01 (GET /me) + US-02 (Role in JWT)
 * ============================================================================
 * API endpoints cho authentication:
 * - POST /api/auth/register — Đăng ký tài khoản (US-03 legacy)
 * - POST /api/auth/login    — Đăng nhập với JWT token (US-04)
 * - POST /api/auth/google   — Google OAuth callback (US-03)
 * - GET  /api/auth/me       — Lấy profile người dùng hiện tại (US-01)
 *
 * Sử dụng Zod để validate input, các module:
 * - password.utils.ts: hash & verify mật khẩu
 * - jwt.utils.ts: tạo JWT token (US-04), bao gồm role (US-02)
 * - google.service.ts: gọi Google OAuth APIs (US-03)
 * - user.repository.ts: tương tác DB (createUser, findUserByEmail, findUserById, findUserByGoogleId, createGoogleUser)
 * - types.ts: UserRecord, EnglishLevel, UserRole, AuthProvider
 *
 * US-03 Changes:
 * - Thêm POST /google route xử lý Google OAuth callback
 * - Thêm googleAuthSchema (Zod validation)
 * - toUserResponse() giờ trả thêm `authProvider`
 * - Import google.service.ts, findUserByGoogleId, createGoogleUser
 *
 * Response format nhất quán với toàn bộ API:
 * - Success: { success: true, data: { ... } }
 * - Error:   { success: false, error: "..." }
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { hashPassword, verifyPassword } from "./password.utils.js";
import {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByGoogleId,
  createGoogleUser,
} from "./user.repository.js";
import { exchangeCodeForTokens, fetchGoogleUserInfo } from "./google.service.js";
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
 *
 * KHÔNG có trường role — user mới luôn nhận DEFAULT 'user' từ DB.
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
 * Zod schema validate request body cho POST /google.
 * Chỉ cần authorization code — string, không rỗng.
 *
 * AC2: trường `code` là string, min(1)
 */
const googleAuthSchema = z.object({
  code: z.string().min(1, "Authorization code is required"),
});

/**
 * Transform UserRecord (snake_case từ DB) sang camelCase cho API response.
 * Bao gồm trường `role` từ migration 005 và `authProvider` từ migration 006.
 * Loại bỏ updated_at — AC4 chỉ yêu cầu: id, email, role, name, profession, englishLevel, goals, createdAt.
 *
 * US-03: Thêm authProvider.
 */
function toUserResponse(record: UserRecord) {
  return {
    id: record.id,
    email: record.email,
    role: record.role,
    authProvider: record.auth_provider,
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
 * 5. Generate JWT token với role: 'user' (US-02)
 * 6. Return 201 với token + user info (camelCase, không có password_hash, có role)
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

    // 5. Generate JWT token — US-02: hardcode role: 'user' vì user mới luôn là 'user'
    const token = generateToken({ userId: user.id, email: user.email, role: "user" });

    // 6. Return thành công với token
    logger.info(`✅ [Auth] User registered successfully: ${user.id} (${email})`);

    res.status(201).json({
      success: true,
      data: {
        token,
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
 * 4. Tạo JWT token (generateToken) — US-02: bao gồm role từ UserRow
 * 5. Return 200 với token + user info (bao gồm role)
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

    // 3. Verify password — password_hash có thể null (Google user), coi như fail
    if (!user.password_hash) {
      logger.warn(`⚠️ [Auth] Login failed — Google user attempted password login: ${email}`);

      res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
      return;
    }

    const isValid = await verifyPassword(password, user.password_hash);

    if (!isValid) {
      logger.warn(`⚠️ [Auth] Login failed — wrong password for: ${email}`);

      res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
      return;
    }

    // 4. Tạo JWT token — US-02: truyền role từ DB (user.role)
    const token = generateToken({ userId: user.id, email: user.email, role: user.role });

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
 * POST /google
 * Xử lý Google OAuth callback — đổi authorization code lấy profile, tạo/đăng nhập user.
 *
 * Flow (AC1 → AC10):
 * 1. Validate input bằng googleAuthSchema (AC2)
 * 2. Gọi Google Token endpoint đổi code → access_token (AC3)
 * 3. Gọi Google UserInfo endpoint → email, name, sub (AC4)
 * 4. Tìm user theo google_id (AC5)
 *    - Nếu tìm thấy → đăng nhập, tạo JWT, isNewUser=false
 * 5. Nếu chưa có google_id → tìm theo email (AC7)
 *    - Nếu email tồn tại với auth_provider='local' → 409 conflict
 * 6. Nếu hoàn toàn mới → tạo user mới (AC6), isNewUser=true
 * 7. Tạo JWT token với role từ DB (AC8)
 * 8. Response format nhất quán (AC8)
 * 9. Error handling: Google fail → 401 (AC9)
 * 10. Logging đầy đủ (AC10)
 */
router.post("/google", async (req: Request, res: Response) => {
  try {
    // ── STEP 1: Validate input (AC2) ──
    const parseResult = googleAuthSchema.safeParse(req.body);

    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors
        .map((e) => e.message)
        .join(", ");

      logger.warn(`⚠️ [Auth] Google auth validation failed: ${errorMessages}`);

      res.status(400).json({
        success: false,
        error: `Validation failed: ${errorMessages}`,
      });
      return;
    }

    const { code } = parseResult.data;

    logger.info("🔑 [Auth] Google OAuth attempt — exchanging code");

    // ── STEP 2: Exchange code for access_token (AC3) ──
    const accessToken = await exchangeCodeForTokens(code);

    if (!accessToken) {
      logger.warn("⚠️ [Auth] Google code exchange failed");
      res.status(401).json({
        success: false,
        error: "Google authentication failed",
      });
      return;
    }

    // ── STEP 3: Fetch Google user profile (AC4) ──
    const googleUser = await fetchGoogleUserInfo(accessToken);

    if (!googleUser) {
      logger.warn("⚠️ [Auth] Google user info fetch failed");
      res.status(401).json({
        success: false,
        error: "Google authentication failed",
      });
      return;
    }

    logger.info(`📧 [Auth] Google profile received: ${googleUser.email}`);

    // ── STEP 4: Check if user exists by google_id (AC5) ──
    const existingGoogleUser = await findUserByGoogleId(googleUser.id);

    if (existingGoogleUser) {
      // Returning user — đăng nhập
      const token = generateToken({
        userId: existingGoogleUser.id,
        email: existingGoogleUser.email,
        role: existingGoogleUser.role,
      });

      logger.info(
        `✅ [Auth] Google login successful (returning user): ${existingGoogleUser.id} (${existingGoogleUser.email})`
      );

      res.status(200).json({
        success: true,
        data: {
          token,
          user: toUserResponse(existingGoogleUser),
          isNewUser: false,
        },
      });
      return;
    }

    // ── STEP 5: Check email conflict (AC7) ──
    const existingEmailUser = await findUserByEmail(googleUser.email);

    if (existingEmailUser && existingEmailUser.auth_provider === "local") {
      // Email đã đăng ký bằng email/password → 409 conflict (BR-01: no account merge)
      logger.warn(
        `⚠️ [Auth] Google OAuth email conflict: ${googleUser.email} already registered as local user`
      );

      res.status(409).json({
        success: false,
        error: "Email already registered with email/password. Please login with your password.",
      });
      return;
    }

    // ── STEP 6: Create new Google user (AC6) ──
    const newUser = await createGoogleUser({
      email: googleUser.email,
      name: googleUser.name,
      googleId: googleUser.id,
    });

    if (!newUser) {
      logger.error(`❌ [Auth] Failed to create Google user: ${googleUser.email}`);

      res.status(500).json({
        success: false,
        error: "Failed to create user account",
      });
      return;
    }

    // ── STEP 7: Generate JWT token (AC8) ──
    const token = generateToken({
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
    });

    logger.info(
      `✅ [Auth] Google login successful (new user): ${newUser.id} (${newUser.email})`
    );

    // ── STEP 8: Response (AC8) ──
    res.status(200).json({
      success: true,
      data: {
        token,
        user: toUserResponse(newUser),
        isNewUser: true,
      },
    });
  } catch (error) {
    logger.error(
      "❌ [Auth] Google auth error:",
      error instanceof Error ? error.message : error
    );

    res.status(500).json({
      success: false,
      error: "Google authentication failed",
    });
  }
});

/**
 * GET /me
 * Lấy profile người dùng hiện tại từ JWT token.
 *
 * Flow:
 * 1. authMiddleware đã verify token và gắn req.user = { userId, email, role }
 * 2. Đọc req.user.userId
 * 3. findUserById(userId) → UserRecord | null
 * 4. Nếu null → 404 "User not found"
 * 5. Nếu có → 200 với user info (camelCase, qua toUserResponse, bao gồm role)
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
