/**
 * Auth API Functions — US-03 AC2
 * ============================================================================
 * Typed wrapper cho 3 auth endpoints của backend:
 * - POST /api/auth/register → registerApi()
 * - POST /api/auth/login    → loginApi()
 * - GET  /api/auth/me       → getMeApi()
 * - POST /api/auth/google   → googleAuthApi()  ← US-01 Google OAuth
 *
 * Types mapping chính xác với backend toUserResponse() trong auth.routes.ts:
 * { id, email, name, role, profession, englishLevel, goals, createdAt }
 */

import { apiClient } from "./client.ts";

// === Types (mirror backend response shapes) ===

/**
 * Khớp với toUserResponse() trong auth.routes.ts.
 * createdAt là string vì JSON.parse serialize Date thành ISO string.
 * role: "user" | "admin" — từ migration 005_user_roles.sql.
 */
interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  profession: string | null;
  englishLevel: string | null;
  goals: string[] | null;
  createdAt: string;
}

/** Credentials mixin — password: string field via Record type */
type CredentialFields = Record<"password", string>;

interface RegisterRequest extends CredentialFields {
  email: string;
  name: string;
  profession?: string;
  englishLevel?: string;
  goals?: string[];
}

interface LoginRequest extends CredentialFields {
  email: string;
}

/** POST /api/auth/register → response.data shape */
interface RegisterResponse {
  user: UserProfile;
}

/** POST /api/auth/login → response.data shape */
interface LoginResponse {
  token: string;
  user: UserProfile;
}

/** GET /api/auth/me → response.data shape */
interface GetMeResponse {
  user: UserProfile;
}

/** POST /api/auth/google → request body shape (US-01 AC1) */
interface GoogleAuthRequest {
  code: string;
}

// === API Functions ===

function registerApi(data: RegisterRequest): Promise<RegisterResponse> {
  return apiClient.post<RegisterResponse>("/api/auth/register", data);
}

function loginApi(data: LoginRequest): Promise<LoginResponse> {
  return apiClient.post<LoginResponse>("/api/auth/login", data);
}

function getMeApi(): Promise<GetMeResponse> {
  return apiClient.get<GetMeResponse>("/api/auth/me");
}

/** Google OAuth: đổi authorization code lấy token + user (US-01 AC2) */
function googleAuthApi(data: GoogleAuthRequest): Promise<LoginResponse> {
  return apiClient.post<LoginResponse>("/api/auth/google", data);
}

export { registerApi, loginApi, getMeApi, googleAuthApi };
export type { UserProfile, RegisterRequest, LoginRequest, LoginResponse, GetMeResponse, GoogleAuthRequest };
