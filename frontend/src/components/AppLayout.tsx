/**
 * AppLayout Component — US-03 AC1, AC5
 * ============================================================================
 * Layout wrapper cho tất cả protected pages.
 * Render AppNavbar ở trên + children (page content) ở dưới.
 *
 * Sử dụng children props pattern (không dùng Outlet)
 * vì ProtectedRoute đã có logic guard riêng cho từng route.
 */

import type { ReactNode } from "react";
import { AppNavbar } from "./AppNavbar.tsx";

function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-layout">
      <AppNavbar />
      <main className="app-content">
        {children}
      </main>
    </div>
  );
}

export { AppLayout };
