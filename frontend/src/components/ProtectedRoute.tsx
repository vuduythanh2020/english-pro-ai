/**
 * ProtectedRoute Component — US-01
 * ============================================================================
 * Auth guard + role guard cho React Router routes.
 *
 * Logic:
 * 1. isLoading = true → render null (đợi AuthContext verify token)
 * 2. isAuthenticated = false → redirect /login
 * 3. requiredRole truthy AND user.role !== requiredRole → redirect /chat
 * 4. Tất cả OK → render children
 *
 * Sử dụng <Navigate replace /> để thay thế entry trong browser history,
 * tránh user bấm Back bị kẹt redirect loop.
 *
 * ProtectedRoute là defense-in-depth (UX layer), KHÔNG thay thế backend auth.
 */

import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.tsx";
import type { ReactNode } from "react";

/**
 * Props cho ProtectedRoute component.
 *
 * @property children - Nội dung sẽ render nếu user đủ quyền
 * @property requiredRole - Role bắt buộc (optional).
 *   Nếu không truyền → chỉ kiểm tra authentication.
 *   Nếu truyền "admin" → kiểm tra cả auth + role = "admin".
 */
interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: string;
}

/**
 * Component bảo vệ route yêu cầu authentication và/hoặc role cụ thể.
 *
 * Ví dụ sử dụng:
 * ```tsx
 * // Chỉ yêu cầu đăng nhập
 * <ProtectedRoute>
 *   <ChatPage />
 * </ProtectedRoute>
 *
 * // Yêu cầu role admin
 * <ProtectedRoute requiredRole="admin">
 *   <DevTeamPage />
 * </ProtectedRoute>
 * ```
 */
function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();

  // GUARD 1: Đang verify token → render nothing, KHÔNG redirect.
  // AuthContext.isLoading default = true, verify token là async.
  // Nếu redirect ngay sẽ flash LoginPage rồi lại quay về → bad UX.
  if (isLoading) {
    return null;
  }

  // GUARD 2: Chưa đăng nhập → redirect /login.
  // replace=true để tránh Back button quay lại trang protected.
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // GUARD 3: Có requiredRole nhưng user.role không khớp → redirect /chat.
  // user !== null đã được đảm bảo bởi isAuthenticated = true
  // (AuthContext: isAuthenticated = user !== null && token !== null)
  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/chat" replace />;
  }

  // Tất cả checks pass → render children
  return <>{children}</>;
}

export { ProtectedRoute };
export type { ProtectedRouteProps };
