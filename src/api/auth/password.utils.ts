/**
 * Password Utilities — US-02
 * ============================================================================
 * Hash và verify password sử dụng Node.js built-in crypto module.
 * KHÔNG thêm library mới (bcrypt, argon2...) — chỉ dùng node:crypto.
 *
 * Thuật toán: scrypt (memory-hard, chống GPU/ASIC brute force)
 * Format lưu trữ: `{salt_hex}:{hash_hex}`
 *   - Salt: 16 bytes random (32 hex chars)
 *   - Key: 64 bytes derived (128 hex chars)
 *   - Tổng: 161 chars max → fits VARCHAR(255)
 *
 * Security:
 * - Salt ngẫu nhiên cho mỗi password (BR-04: chống rainbow table)
 * - crypto.timingSafeEqual cho comparison (BR-05: chống timing attack)
 * - try-catch trong verifyPassword (R-04: corrupt format → return false)
 */

import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

/** Chiều dài salt tính bằng bytes */
const SALT_LENGTH = 16;

/** Chiều dài derived key tính bằng bytes */
const KEY_LENGTH = 64;

/**
 * Hash mật khẩu sử dụng scrypt với salt ngẫu nhiên.
 *
 * @param plain - Mật khẩu dạng plain text
 * @returns Promise<string> - Chuỗi dạng `salt_hex:hash_hex`
 *
 * @example
 * ```ts
 * const hashed = await hashPassword("mypassword123");
 * // "a1b2c3d4e5f6...:{128 hex chars}"
 * ```
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = (await scryptAsync(plain, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

/**
 * Verify mật khẩu plain text với giá trị đã hash (stored).
 * Sử dụng timingSafeEqual để chống timing attack (BR-05).
 *
 * @param plain - Mật khẩu người dùng nhập
 * @param stored - Giá trị đã lưu trong DB, dạng `salt_hex:hash_hex`
 * @returns Promise<boolean> - true nếu khớp, false nếu không khớp hoặc format lỗi
 *
 * @example
 * ```ts
 * const isValid = await verifyPassword("mypassword123", storedHash);
 * ```
 */
export async function verifyPassword(
  plain: string,
  stored: string
): Promise<boolean> {
  try {
    const [saltHex, hashHex] = stored.split(":");

    if (!saltHex || !hashHex) {
      return false;
    }

    const salt = Buffer.from(saltHex, "hex");
    const storedHash = Buffer.from(hashHex, "hex");

    // Kiểm tra buffer length hợp lệ trước khi so sánh
    if (storedHash.length !== KEY_LENGTH) {
      return false;
    }

    const derivedKey = (await scryptAsync(plain, salt, KEY_LENGTH)) as Buffer;

    return timingSafeEqual(derivedKey, storedHash);
  } catch {
    // R-04: Format sai, hex decode fail, hoặc bất kỳ lỗi nào → return false
    return false;
  }
}
