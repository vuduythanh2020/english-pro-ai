-- ============================================================================
-- Migration 005: User Roles
-- ============================================================================
-- Thêm cột role vào bảng users để phân quyền.
-- Idempotent: sử dụng DO $$ block kiểm tra trước khi ALTER.
-- Chỉ cho phép 2 giá trị: 'user' (default) và 'admin'.
-- ============================================================================

-- Thêm cột role nếu chưa tồn tại
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'role'
  ) THEN
    ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user';
  END IF;
END $$;

-- Thêm CHECK constraint nếu chưa tồn tại
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_users_role'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT chk_users_role
      CHECK (role IN ('user', 'admin'));
  END IF;
END $$;

-- Index trên cột role
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
