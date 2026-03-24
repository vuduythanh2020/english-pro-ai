-- ============================================================================
-- Migration 006: OAuth Provider Support
-- ============================================================================
-- Mở rộng bảng users để hỗ trợ đăng nhập qua OAuth provider (Google).
-- Idempotent: sử dụng DO $$ block kiểm tra trước khi ALTER.
-- Thêm cột auth_provider, google_id và cho phép password_hash nullable.
-- CHECK constraints đảm bảo data integrity:
--   - auth_provider chỉ cho phép 'local' hoặc 'google'
--   - password_hash bắt buộc khi auth_provider = 'local'
-- ============================================================================

-- Thêm cột auth_provider nếu chưa tồn tại
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'auth_provider'
  ) THEN
    ALTER TABLE users ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT 'local';
  END IF;
END $$;

-- Thêm cột google_id nếu chưa tồn tại
-- UNIQUE enforced by named index idx_users_google_id (bên dưới)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'google_id'
  ) THEN
    ALTER TABLE users ADD COLUMN google_id VARCHAR(255);
  END IF;
END $$;

-- ALTER password_hash thành nullable (cho user Google không có password)
DO $$
DECLARE
  col_nullable text;
BEGIN
  SELECT is_nullable INTO col_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name = 'password_hash';

  IF col_nullable = 'NO' THEN
    ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
  END IF;
END $$;

-- CHECK constraint: auth_provider chỉ cho phép 'local' hoặc 'google'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name = 'chk_auth_provider'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT chk_auth_provider
      CHECK (auth_provider IN ('local', 'google'));
  END IF;
END $$;

-- CHECK constraint: password_hash bắt buộc khi auth_provider = 'local'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name = 'chk_local_password'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT chk_local_password
      CHECK (auth_provider != 'local' OR password_hash IS NOT NULL);
  END IF;
END $$;

-- Index trên google_id (UNIQUE để enforce BR-04: mỗi google_id chỉ 1 user)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id);

-- Index trên auth_provider (hỗ trợ filter/query theo provider)
CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users (auth_provider);
