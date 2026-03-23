-- ============================================================================
-- Migration 004: Users Table
-- ============================================================================
-- Tạo bảng users để lưu trữ thông tin tài khoản người dùng
-- Mapping với TutorState.userProfile trong src/tutor/state.ts
-- Idempotent: sử dụng IF NOT EXISTS, safe to run multiple times
-- ============================================================================

-- ============================================================================
-- BẢNG: users
-- Lưu thông tin tài khoản và profile người dùng
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  name            VARCHAR(100) NOT NULL,
  profession      VARCHAR(100),
  english_level   VARCHAR(20) NOT NULL DEFAULT 'intermediate'
                    CHECK (english_level IN (
                      'beginner',
                      'elementary',
                      'intermediate',
                      'upper-intermediate',
                      'advanced'
                    )),
  goals           TEXT[],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Unique index trên email (cho login lookup)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Index trên created_at descending (cho listing/pagination mới nhất trước)
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC);
