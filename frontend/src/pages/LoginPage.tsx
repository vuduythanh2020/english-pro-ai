/**
 * Login Page — US-03 AC4, US-02 AC1/AC2/AC3/AC4
 * ============================================================================
 * Form đăng nhập kết nối AuthContext.
 * - Gọi auth.login(email, password) khi submit
 * - Hiển thị error message nếu login fail
 * - Navigate sang /chat khi login thành công
 * - Loading state trên button khi đang xử lý
 * - Nút "Đăng nhập bằng Google" với divider (US-02)
 *   - Ẩn hoàn toàn nếu VITE_GOOGLE_CLIENT_ID không có
 */

import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.tsx";
import { ApiError } from "../api/client.ts";

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Vui lòng nhập email và mật khẩu");
      return;
    }

    setIsSubmitting(true);

    try {
      await login(email.trim(), password);
      navigate("/chat");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Không thể kết nối server. Vui lòng thử lại sau.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleGoogleLogin(): void {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
    const redirectUri = (import.meta.env.VITE_GOOGLE_REDIRECT_URI as string | undefined)
      || "http://localhost:5173/auth/google/callback";

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "email profile",
      access_type: "offline",
      prompt: "consent",
    });

    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="logo-icon">🎓</span>
          <h1>EnglishPro AI</h1>
        </div>
        <h2>Đăng nhập</h2>
        <p className="auth-subtitle">Chào mừng bạn trở lại!</p>

        {error && (
          <div className="auth-error">{error}</div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              placeholder="you@example.com"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Mật khẩu</label>
            <input
              type="password"
              id="password"
              placeholder="••••••••"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
          <button
            type="submit"
            className="btn-primary auth-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>

        {googleClientId && (
          <>
            <div className="auth-divider">
              <span>hoặc</span>
            </div>
            <button
              type="button"
              className="btn-google"
              onClick={handleGoogleLogin}
              disabled={isSubmitting}
            >
              <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Đăng nhập bằng Google
            </button>
          </>
        )}

        <p className="auth-footer">
          Chưa có tài khoản? <Link to="/register">Đăng ký ngay</Link>
        </p>
      </div>
    </div>
  );
}

export { LoginPage };
