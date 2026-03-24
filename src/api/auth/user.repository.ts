/**
 * User Repository — US-03 + US-02 + US-01 (Google OAuth + User Roles)
 * ============================================================================
 * Cung cấp các hàm CRUD để tương tác với bảng `users` trong PostgreSQL.
 *
 * Hàm chính:
 *   - createUser()          → INSERT user mới (local auth), trả về UserRecord
 *   - findUserByEmail()     → SELECT theo email, trả về UserRow (có password_hash, auth_provider, google_id)
 *   - findUserById()        → SELECT theo id, trả về UserRecord (không có password_hash)
 *   - findUserByGoogleId()  → SELECT theo google_id, trả về UserRow (US-03)
 *   - createGoogleUser()    → INSERT Google user mới (US-03)
 *
 * Design decisions:
 * - Theo pattern của workflow-history.repository.ts: pool.query(), parameterized queries
 * - Graceful degradation: catch lỗi → log warning → return null (không crash)
 * - BR-01: createUser() và findUserById() KHÔNG trả password_hash
 * - BR-02: Duplicate email/google_id (PostgreSQL error code 23505) → log warning, return null
 * - BR-07: Goals array sử dụng parameterized query với cast ::text[]
 * - role: SELECT/RETURNING bao gồm cột role (migration 005). INSERT không truyền role — DB DEFAULT 'user'.
 *
 * US-03 Changes:
 * - SELECT/RETURNING giờ bao gồm auth_provider (và google_id cho UserRow)
 * - Thêm findUserByGoogleId(): tìm user theo Google account ID
 * - Thêm createGoogleUser(): tạo user mới qua Google OAuth (password_hash=NULL)
 */

import { pool } from "../../config/database.config.js";
import { logger } from "../../utils/logger.js";
import type { UserRecord, UserRow, CreateUserInput, CreateGoogleUserInput } from "./types.js";

/**
 * Tạo user mới trong bảng users (local authentication).
 *
 * RETURNING liệt kê tường minh các cột, KHÔNG có password_hash (BR-01).
 * KHÔNG truyền role vào INSERT — để DB dùng DEFAULT 'user'.
 * auth_provider mặc định 'local' (DB DEFAULT).
 * Xử lý duplicate email error (PostgreSQL code 23505) → return null.
 *
 * @param input - Thông tin user cần tạo (email, passwordHash, name, và các trường optional)
 * @returns UserRecord đã tạo (không chứa password_hash) hoặc null nếu lỗi
 */
export async function createUser(
  input: CreateUserInput
): Promise<UserRecord | null> {
  try {
    const result = await pool.query<UserRecord>(
      `INSERT INTO users (email, password_hash, name, profession, english_level, goals)
       VALUES ($1, $2, $3, $4, $5, $6::text[])
       RETURNING id, email, role, auth_provider, name, profession, english_level, goals, created_at, updated_at`,
      [
        input.email,
        input.passwordHash,
        input.name,
        input.profession || null,
        input.englishLevel || "intermediate",
        input.goals || null,
      ]
    );

    logger.info(`✅ [UserRepository] Created user: ${result.rows[0].id} (${input.email})`);
    return result.rows[0];
  } catch (error) {
    // BR-02: Xử lý duplicate email
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "23505") {
      logger.warn(`⚠️ [UserRepository] Duplicate email: ${input.email}`);
      return null;
    }

    logger.warn("⚠️ [UserRepository] Failed to create user:", error);
    return null;
  }
}

/**
 * Tìm user theo email — trả về đầy đủ bao gồm password_hash + OAuth fields.
 *
 * Dùng cho:
 * - Login flow (xác thực mật khẩu)
 * - Google OAuth flow (kiểm tra email conflict — AC7)
 *
 * KHÔNG expose kết quả trực tiếp ra client.
 *
 * US-03: Thêm auth_provider, google_id vào SELECT.
 *
 * @param email - Email cần tìm
 * @returns UserRow (có password_hash, auth_provider, google_id) hoặc null nếu không tìm thấy
 */
export async function findUserByEmail(
  email: string
): Promise<UserRow | null> {
  try {
    const result = await pool.query<UserRow>(
      `SELECT id, email, password_hash, role, auth_provider, google_id,
              name, profession, english_level, goals, created_at, updated_at
       FROM users
       WHERE email = $1`,
      [email]
    );

    return result.rows[0] || null;
  } catch (error) {
    logger.warn("⚠️ [UserRepository] Failed to find user by email:", error);
    return null;
  }
}

/**
 * Tìm user theo ID — trả về UserRecord KHÔNG có password_hash (BR-01).
 *
 * Dùng cho profile endpoint và auth middleware sau khi xác thực JWT.
 *
 * US-03: Thêm auth_provider vào SELECT.
 *
 * @param id - UUID của user
 * @returns UserRecord (không có password_hash) hoặc null nếu không tìm thấy
 */
export async function findUserById(
  id: string
): Promise<UserRecord | null> {
  try {
    const result = await pool.query<UserRecord>(
      `SELECT id, email, role, auth_provider, name, profession, english_level, goals, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [id]
    );

    return result.rows[0] || null;
  } catch (error) {
    logger.warn("⚠️ [UserRepository] Failed to find user by id:", error);
    return null;
  }
}

/**
 * Tìm user theo Google ID — trả về UserRow (có password_hash cho consistency).
 * Dùng cho Google OAuth login flow: kiểm tra user đã đăng ký qua Google chưa.
 *
 * US-03: Hàm mới.
 *
 * @param googleId - Google account ID (sub claim)
 * @returns UserRow hoặc null nếu không tìm thấy
 */
export async function findUserByGoogleId(
  googleId: string
): Promise<UserRow | null> {
  try {
    const result = await pool.query<UserRow>(
      `SELECT id, email, password_hash, role, auth_provider, google_id,
              name, profession, english_level, goals, created_at, updated_at
       FROM users
       WHERE google_id = $1`,
      [googleId]
    );

    return result.rows[0] || null;
  } catch (error) {
    logger.warn("⚠️ [UserRepository] Failed to find user by google_id:", error);
    return null;
  }
}

/**
 * Tạo user mới qua Google OAuth.
 *
 * Khác với createUser():
 * - auth_provider = 'google'
 * - google_id = Google sub
 * - password_hash = NULL
 * - english_level = 'intermediate' (default)
 * - role = DEFAULT 'user' (từ DB)
 *
 * US-03: Hàm mới.
 *
 * @param input - { email, name, googleId }
 * @returns UserRecord (không có password_hash) hoặc null nếu lỗi
 */
export async function createGoogleUser(
  input: CreateGoogleUserInput
): Promise<UserRecord | null> {
  try {
    const result = await pool.query<UserRecord>(
      `INSERT INTO users (email, password_hash, name, auth_provider, google_id, english_level)
       VALUES ($1, NULL, $2, 'google', $3, 'intermediate')
       RETURNING id, email, role, auth_provider, name, profession,
                 english_level, goals, created_at, updated_at`,
      [input.email, input.name, input.googleId]
    );

    logger.info(
      `✅ [UserRepository] Created Google user: ${result.rows[0].id} (${input.email})`
    );
    return result.rows[0];
  } catch (error) {
    // Xử lý duplicate (email hoặc google_id unique constraint)
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "23505"
    ) {
      logger.warn(`⚠️ [UserRepository] Duplicate Google user: ${input.email}`);
      return null;
    }

    logger.warn("⚠️ [UserRepository] Failed to create Google user:", error);
    return null;
  }
}
