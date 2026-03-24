/**
 * Google OAuth Service — US-03
 * ============================================================================
 * Đóng gói logic gọi Google OAuth APIs:
 * - exchangeCodeForTokens(): Đổi authorization code lấy access_token
 * - fetchGoogleUserInfo(): Dùng access_token lấy profile user
 *
 * Sử dụng native fetch() — KHÔNG thêm library OAuth mới.
 * Nhất quán với triết lý dự án: jwt.utils dùng node:crypto,
 * password.utils dùng node:crypto.
 *
 * Error handling: graceful degradation — catch errors → log warning → return null.
 * Route handler sẽ chuyển null thành response 401 phù hợp.
 */

import { config } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import type { GoogleUserInfo } from "./types.js";

// Google OAuth endpoints — constants
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

/**
 * Response từ Google Token endpoint.
 * Chỉ khai báo các trường cần dùng.
 */
interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Đổi authorization code lấy access_token từ Google.
 *
 * Flow:
 * 1. POST tới Google Token endpoint với grant_type=authorization_code
 * 2. Body dạng application/x-www-form-urlencoded
 * 3. Parse JSON response → trả access_token
 *
 * @param code - Authorization code từ Google consent screen
 * @returns access_token string, hoặc null nếu Google trả lỗi
 */
export async function exchangeCodeForTokens(
  code: string
): Promise<string | null> {
  try {
    const body = new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: config.google.redirectUri,
      grant_type: "authorization_code",
    });

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.warn(
        `⚠️ [GoogleService] Token exchange failed: ${response.status} — ${errorBody}`
      );
      return null;
    }

    const data = (await response.json()) as GoogleTokenResponse;
    return data.access_token;
  } catch (error) {
    logger.error(
      "❌ [GoogleService] Token exchange error:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Lấy Google user profile bằng access_token.
 *
 * Flow:
 * 1. GET tới Google UserInfo endpoint với Authorization: Bearer <access_token>
 * 2. Parse JSON response → GoogleUserInfo
 *
 * @param accessToken - Access token từ exchangeCodeForTokens()
 * @returns GoogleUserInfo hoặc null nếu lỗi
 */
export async function fetchGoogleUserInfo(
  accessToken: string
): Promise<GoogleUserInfo | null> {
  try {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.warn(
        `⚠️ [GoogleService] UserInfo fetch failed: ${response.status} — ${errorBody}`
      );
      return null;
    }

    const data = (await response.json()) as GoogleUserInfo;

    // Validation cơ bản: phải có email và id
    if (!data.email || !data.id) {
      logger.warn("⚠️ [GoogleService] UserInfo missing email or id");
      return null;
    }

    return data;
  } catch (error) {
    logger.error(
      "❌ [GoogleService] UserInfo fetch error:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
