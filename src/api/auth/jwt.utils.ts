/**
 * JWT Utilities — US-04 + US-02 (Role in JWT)
 * ============================================================================
 * Tạo và verify JWT token sử dụng Node.js built-in crypto module.
 * Implement HMAC-SHA256 (HS256) thủ công — KHÔNG thêm library mới.
 *
 * Nhất quán với triết lý dự án: password.utils.ts cũng dùng node:crypto.
 *
 * Token format: header.payload.signature
 * - Header:    {"alg":"HS256","typ":"JWT"} → Base64URL
 * - Payload:   { userId, email, role, iat, exp } → Base64URL
 * - Signature: HMAC-SHA256(header.payload, secret) → Base64URL
 *
 * Security:
 * - crypto.timingSafeEqual cho signature comparison (chống timing attack)
 * - try-catch bao toàn bộ verifyToken (mọi lỗi → return null)
 *
 * US-02 Changes:
 * - JwtPayload thêm trường `role: string`
 * - generateToken() nhận thêm `role` trong input payload
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../../config/env.js";

/**
 * JWT Payload — chứa thông tin user (bao gồm role) và metadata thời gian.
 */
export interface JwtPayload {
  userId: string;
  email: string;
  /** User role — e.g. 'user' or 'admin' */
  role: string;
  /** Issued At — Unix timestamp (seconds) */
  iat: number;
  /** Expiry — Unix timestamp (seconds) */
  exp: number;
}

/** JWT header cố định cho HS256 */
const JWT_HEADER = JSON.stringify({ alg: "HS256", typ: "JWT" });

/**
 * Encode string sang Base64URL format.
 * Thay thế +→-, /→_, loại bỏ padding =.
 */
function base64UrlEncode(data: string): string {
  return Buffer.from(data, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decode Base64URL string về plain text.
 * Khôi phục +, / và padding = trước khi decode.
 */
function base64UrlDecode(encoded: string): string {
  let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");

  // Thêm padding = nếu cần
  const remainder = base64.length % 4;
  if (remainder === 2) {
    base64 += "==";
  } else if (remainder === 3) {
    base64 += "=";
  }

  return Buffer.from(base64, "base64").toString("utf-8");
}

/**
 * Tạo HMAC-SHA256 signature cho header.payload.
 */
function createSignature(headerPayload: string, secret: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(headerPayload);
  return hmac
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Tạo JWT token từ payload { userId, email, role }.
 * Sử dụng HMAC-SHA256 với secret từ config.jwt.secret.
 *
 * @param payload - { userId: string, email: string, role: string }
 * @returns JWT token string dạng header.payload.signature
 *
 * @example
 * ```ts
 * const token = generateToken({ userId: "uuid-123", email: "user@example.com", role: "user" });
 * // "eyJ0eXAi...payload...signature"
 * ```
 */
export function generateToken(payload: { userId: string; email: string; role: string }): string {
  const now = Math.floor(Date.now() / 1000);

  const jwtPayload: JwtPayload = {
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
    iat: now,
    exp: now + config.jwt.expiresIn,
  };

  const headerEncoded = base64UrlEncode(JWT_HEADER);
  const payloadEncoded = base64UrlEncode(JSON.stringify(jwtPayload));

  const headerPayload = `${headerEncoded}.${payloadEncoded}`;
  const signature = createSignature(headerPayload, config.jwt.secret);

  return `${headerPayload}.${signature}`;
}

/**
 * Verify và decode JWT token.
 * Kiểm tra:
 * 1. Format hợp lệ (3 phần split by '.')
 * 2. Signature khớp (HMAC-SHA256 + timingSafeEqual)
 * 3. Token chưa hết hạn (exp > now)
 *
 * @param token - JWT token string
 * @returns JwtPayload nếu hợp lệ, null nếu invalid/expired
 *
 * @example
 * ```ts
 * const payload = verifyToken(token);
 * if (payload) {
 *   console.log(payload.userId, payload.email, payload.role);
 * }
 * ```
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    // 1. Kiểm tra format: phải có đúng 3 phần
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const [headerEncoded, payloadEncoded, signatureFromToken] = parts;

    // 2. Verify signature bằng timingSafeEqual (chống timing attack)
    const headerPayload = `${headerEncoded}.${payloadEncoded}`;
    const expectedSignature = createSignature(headerPayload, config.jwt.secret);

    const sigBuffer = Buffer.from(signatureFromToken, "utf-8");
    const expectedBuffer = Buffer.from(expectedSignature, "utf-8");

    // timingSafeEqual yêu cầu cùng length
    if (sigBuffer.length !== expectedBuffer.length) {
      return null;
    }

    if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
      return null;
    }

    // 3. Decode payload
    const payloadJson = base64UrlDecode(payloadEncoded);
    const payload = JSON.parse(payloadJson) as JwtPayload;

    // 4. Kiểm tra expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) {
      return null;
    }

    return payload;
  } catch {
    // Mọi lỗi (parse, decode, buffer...) → return null
    return null;
  }
}
