/**
 * User Repository — US-02
 * ============================================================================
 * Cung cấp các hàm CRUD để tương tác với bảng `users` trong PostgreSQL.
 *
 * Hàm chính:
 *   - createUser()       → INSERT user mới, trả về UserRecord (không có password_hash)
 *   - findUserByEmail()  → SELECT theo email, trả về UserRow (có password_hash cho xác thực)
 *   - findUserById()     → SELECT theo id, trả về UserRecord (không có password_hash)
 *
 * Design decisions:
 * - Theo pattern của workflow-history.repository.ts: pool.query(), parameterized queries
 * - Graceful degradation: catch lỗi → log warning → return null (không crash)
 * - BR-01: createUser() và findUserById() KHÔNG trả password_hash
 * - BR-02: Duplicate email (PostgreSQL error code 23505) → log warning, return null
 * - BR-07: Goals array sử dụng parameterized query với cast ::text[]
 */

import { pool } from "../../config/database.config.js";
import { logger } from "../../utils/logger.js";
import type { UserRecord, UserRow, CreateUserInput } from "./types.js";

/**
 * Tạo user mới trong bảng users.
 *
 * RETURNING liệt kê tường minh các cột, KHÔNG có password_hash (BR-01).
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
       RETURNING id, email, name, profession, english_level, goals, created_at, updated_at`,
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
 * Tìm user theo email — trả về đầy đủ bao gồm password_hash.
 *
 * Chỉ dùng nội bộ cho login flow (xác thực mật khẩu).
 * KHÔNG expose kết quả trực tiếp ra client.
 *
 * @param email - Email cần tìm
 * @returns UserRow (có password_hash) hoặc null nếu không tìm thấy
 */
export async function findUserByEmail(
  email: string
): Promise<UserRow | null> {
  try {
    const result = await pool.query<UserRow>(
      `SELECT id, email, password_hash, name, profession, english_level, goals, created_at, updated_at
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
 * @param id - UUID của user
 * @returns UserRecord (không có password_hash) hoặc null nếu không tìm thấy
 */
export async function findUserById(
  id: string
): Promise<UserRecord | null> {
  try {
    const result = await pool.query<UserRecord>(
      `SELECT id, email, name, profession, english_level, goals, created_at, updated_at
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
