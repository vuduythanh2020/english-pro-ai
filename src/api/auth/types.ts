/**
 * Auth Types — US-03 + US-02 + US-01 (Google OAuth + User Roles)
 * ============================================================================
 * Định nghĩa các interface cho user authentication module.
 * Mapping 1:1 với bảng `users` trong migration 004_users.sql + 005_user_roles.sql + 006_oauth_provider.sql.
 *
 * Design decisions:
 * - Tách `UserRecord` (safe, không có password_hash) và `UserRow` (full, có password_hash)
 *   để enforce business rule BR-01 ở type level
 * - `CreateUserInput` nhận `passwordHash` đã hash sẵn — repository không xử lý logic hash
 * - `EnglishLevel` type alias khớp CHECK constraint trong DB và TutorState.userProfile
 * - `UserRole` type alias khớp CHECK constraint chk_users_role trong migration 005
 * - `AuthProvider` type alias khớp CHECK constraint chk_auth_provider trong migration 006
 *
 * US-03 Changes:
 * - Thêm `AuthProvider` type ('local' | 'google')
 * - Thêm `auth_provider` vào `UserRecord`
 * - `UserRow.password_hash` giờ nullable (Google users không có password)
 * - Thêm `auth_provider`, `google_id` vào `UserRow`
 * - Thêm `GoogleUserInfo` interface (response từ Google UserInfo API)
 * - Thêm `CreateGoogleUserInput` interface (input cho createGoogleUser)
 */

/**
 * Các cấp độ tiếng Anh — khớp CHECK constraint trong DB và TutorState
 */
export type EnglishLevel =
  | "beginner"
  | "elementary"
  | "intermediate"
  | "upper-intermediate"
  | "advanced";

/**
 * Vai trò người dùng — khớp CHECK constraint trong DB migration 005
 * Chỉ có 2 giá trị: 'user' (mặc định) và 'admin'
 */
export type UserRole = "user" | "admin";

/**
 * Auth provider — khớp CHECK constraint chk_auth_provider trong migration 006
 * 'local': đăng ký bằng email/password
 * 'google': đăng nhập bằng Google OAuth
 */
export type AuthProvider = "local" | "google";

/**
 * UserRecord — đại diện user từ DB nhưng KHÔNG chứa password_hash.
 * Dùng để trả về cho client hoặc các module khác.
 * Đảm bảo BR-01: không bao giờ lộ password_hash ra ngoài.
 *
 * US-03: Thêm `auth_provider` để phân biệt user local vs Google.
 */
export interface UserRecord {
  id: string;
  email: string;
  role: UserRole;
  auth_provider: AuthProvider;
  name: string;
  profession: string | null;
  english_level: EnglishLevel;
  goals: string[] | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * UserRow — full row từ bảng users, BAO GỒM password_hash + OAuth fields.
 * Chỉ dùng nội bộ trong repository cho findUserByEmail (xác thực).
 *
 * US-03: password_hash giờ nullable (Google users không có password).
 * Thêm google_id cho OAuth lookup.
 */
export interface UserRow extends UserRecord {
  password_hash: string | null;
  google_id: string | null;
}

/**
 * CreateUserInput — tham số đầu vào cho hàm createUser().
 * passwordHash đã được hash từ password.utils trước khi truyền vào.
 * KHÔNG có trường role — user mới luôn nhận DEFAULT 'user' từ DB.
 */
export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
  profession?: string;
  englishLevel?: EnglishLevel;
  goals?: string[];
}

/**
 * CreateGoogleUserInput — tham số đầu vào cho hàm createGoogleUser().
 * KHÔNG có passwordHash — Google user không cần password.
 *
 * US-03: Tạo user mới qua Google OAuth.
 */
export interface CreateGoogleUserInput {
  email: string;
  name: string;
  googleId: string;
}

/**
 * GoogleUserInfo — thông tin profile từ Google UserInfo API.
 * Mapping fields từ https://www.googleapis.com/oauth2/v2/userinfo
 *
 * US-03: Dùng trong google.service.ts để parse response từ Google.
 */
export interface GoogleUserInfo {
  /** Google account ID (unique identifier, = "sub" trong OpenID Connect) */
  id: string;
  email: string;
  name: string;
  picture?: string;
  verified_email?: boolean;
}

/**
 * AuthResponse — response trả về khi login/register thành công.
 * Token sẽ được tạo ở US sau khi có JWT module.
 */
export interface AuthResponse {
  user: UserRecord;
  token: string;
}
