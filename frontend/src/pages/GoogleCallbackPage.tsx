/**
 * GoogleCallbackPage — US-02 AC5, AC6
 * ============================================================================
 * Xử lý Google OAuth redirect callback.
 * - Đọc query param `code` và `error` từ URL
 * - Có code → gọi loginWithGoogle(code) → navigate("/chat")
 * - Không có code hoặc có error → hiển thị lỗi + link quay /login
 *
 * Pattern: tính initial error đồng bộ từ searchParams (không qua useEffect),
 * chỉ dùng useEffect cho async API call (loginWithGoogle).
 */

import { useEffect, useState, useRef, useMemo } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.tsx";
import { ApiError } from "../api/client.ts";

/**
 * Đọc searchParams, trả về { code, initialError }.
 * - Nếu có param `error` → trả initialError
 * - Nếu không có param `code` → trả initialError
 * - Ngược lại → trả code (guaranteed non-null string)
 */
function parseCallbackParams(searchParams: URLSearchParams): {
  code: string | null;
  initialError: string;
} {
  const oauthError = searchParams.get("error");

  if (oauthError) {
    return {
      code: null,
      initialError: "Đăng nhập bằng Google bị từ chối hoặc gặp lỗi. Vui lòng thử lại.",
    };
  }

  const code = searchParams.get("code");

  if (!code) {
    return {
      code: null,
      initialError: "Không nhận được mã xác thực từ Google. Vui lòng thử lại.",
    };
  }

  return { code, initialError: "" };
}

function GoogleCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithGoogle } = useAuth();

  // Tính initial error đồng bộ — không cần useEffect
  const { code, initialError } = useMemo(
    () => parseCallbackParams(searchParams),
    [searchParams],
  );

  const [error, setError] = useState<string>(initialError);
  const calledRef = useRef(false);

  useEffect(() => {
    // Không có code hợp lệ → không gọi API (error đã set ở initial state)
    if (!code) return;

    // Ngăn React StrictMode gọi useEffect 2 lần trong dev
    if (calledRef.current) return;
    calledRef.current = true;

    // Capture code as non-null string for async closure
    const authCode = code;

    // Có code → exchange
    async function exchangeCode() {
      try {
        await loginWithGoogle(authCode);
        navigate("/chat");
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Không thể kết nối server. Vui lòng thử lại sau.");
        }
      }
    }

    exchangeCode();
  }, [code, loginWithGoogle, navigate]);

  // --- RENDER ---

  // Error state
  if (error) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">
            <span className="logo-icon">🎓</span>
            <h1>EnglishPro AI</h1>
          </div>
          <div className="callback-error">
            <span className="callback-error-icon">⚠️</span>
            <p className="auth-error">{error}</p>
            <Link to="/login" className="btn-primary auth-btn callback-back-btn">
              Quay về trang đăng nhập
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Loading state (default)
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="logo-icon">🎓</span>
          <h1>EnglishPro AI</h1>
        </div>
        <div className="callback-loading">
          <div className="callback-spinner"></div>
          <p className="callback-loading-text">Đang xử lý đăng nhập...</p>
        </div>
      </div>
    </div>
  );
}

export { GoogleCallbackPage };
