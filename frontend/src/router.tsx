/**
 * Router Configuration — US-03 Refactored, US-02 AC7
 * ============================================================================
 * Wrap protected routes với AppLayout để hiển thị AppNavbar chung.
 *
 * Pattern: ProtectedRoute > AppLayout > Page
 * - ProtectedRoute: auth + role guard
 * - AppLayout: AppNavbar + content area
 * - Page: ChatPage hoặc DevTeamPage
 *
 * US-02: Thêm public route /auth/google/callback cho GoogleCallbackPage
 */

import { Routes, Route, Navigate } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage.tsx'
import { RegisterPage } from './pages/RegisterPage.tsx'
import { GoogleCallbackPage } from './pages/GoogleCallbackPage.tsx'
import { ChatPage } from './pages/ChatPage.tsx'
import { DevTeamPage } from './pages/DevTeamPage.tsx'
import { ProtectedRoute } from './components/ProtectedRoute.tsx'
import { AppLayout } from './components/AppLayout.tsx'

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes — không cần auth */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />

      {/* Protected route — chỉ cần authenticated */}
      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <AppLayout>
              <ChatPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Admin-only route — cần auth + role admin */}
      <Route
        path="/dev-team"
        element={
          <ProtectedRoute requiredRole="admin">
            <AppLayout>
              <DevTeamPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Default + fallback redirects */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export { AppRoutes }
