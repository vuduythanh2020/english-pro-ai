/**
 * Auth Types — US-02
 * ============================================================================
 * Định nghĩa các interface cho user authentication module.
 * Mapping 1:1 với bảng `users` trong migration 004_users.sql.
 *
 * Design decisions:
 * - Tách `UserRecord` (safe, không có password_hash) và `UserRow` (full, có password_hash)
 *   để enforce business rule BR-01 ở type level
 * - `CreateUserInput` nhận `passwordHash` đã hash sẵn — repository không xử lý logic hash
 * - `EnglishLevel` type alias khớp CHECK constraint trong DB và TutorState.userProfile
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
 * UserRecord — đại diện user từ DB nhưng KHÔNG chứa password_hash.
 * Dùng để trả về cho client hoặc các module khác.
 * Đảm bảo BR-01: không bao giờ lộ password_hash ra ngoài.
 */
export interface UserRecord {
  id: string;
  email: string;
  name: string;
  profession: string | null;
  english_level: EnglishLevel;
  goals: string[] | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * UserRow — full row từ bảng users, BAO GỒM password_hash.
 * Chỉ dùng nội bộ trong repository cho findUserByEmail (xác thực).
 */
export interface UserRow extends UserRecord {
  password_hash: string;
}

/**
 * CreateUserInput — tham số đầu vào cho hàm createUser().
 * passwordHash đã được hash từ password.utils trước khi truyền vào.
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
 * AuthResponse — response trả về khi login/register thành công.
 * Token sẽ được tạo ở US sau khi có JWT module.
 */
export interface AuthResponse {
  user: UserRecord;
  token: string;
}
