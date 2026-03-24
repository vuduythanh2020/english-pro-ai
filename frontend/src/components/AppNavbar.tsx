/**
 * AppNavbar Component — US-03 AC1, AC2, AC3, AC4, AC5, AC6
 * ============================================================================
 * Navigation bar chung cho tất cả protected pages.
 *
 * - Hiển thị tên user, role badge, nút logout
 * - Admin: hiển thị link "Chat" + "Dev Team"
 * - User thường: chỉ hiển thị link "Chat"
 * - Responsive: hamburger menu trên mobile (<768px)
 * - Sử dụng useAuth() từ AuthContext, KHÔNG gọi thêm API
 */

import { useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.tsx";

interface NavItem {
  label: string;
  path: string;
  icon: string;
  /** Nếu true, chỉ hiển thị khi user.role === "admin" */
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Chat", path: "/chat", icon: "💬" },
  { label: "Dev Team", path: "/dev-team", icon: "🏗️", adminOnly: true },
];

function AppNavbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Đóng mobile menu khi chuyển trang
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Filter nav items dựa trên role
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || user?.role === "admin"
  );

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen((prev) => !prev);
  };

  return (
    <nav className="app-navbar">
      {/* Left: Brand */}
      <div className="navbar-brand">
        <span className="navbar-brand-icon">🎓</span>
        <span className="navbar-brand-text">EnglishPro AI</span>
      </div>

      {/* Center: Nav Links (desktop only) */}
      <div className="navbar-links">
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={`navbar-link ${location.pathname === item.path ? "active" : ""}`}
          >
            <span className="navbar-link-icon">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </div>

      {/* Right: User Info + Logout (desktop only) */}
      <div className="navbar-user">
        <span className="navbar-user-name">{user?.name}</span>
        <span className={`navbar-role-badge role-${user?.role ?? "user"}`}>
          {user?.role}
        </span>
        <button
          className="navbar-logout-btn"
          onClick={handleLogout}
          type="button"
        >
          Đăng xuất
        </button>
      </div>

      {/* Mobile: Hamburger Toggle */}
      <button
        className="navbar-toggle"
        onClick={toggleMobileMenu}
        type="button"
        aria-label="Toggle navigation menu"
      >
        {isMobileMenuOpen ? "✕" : "☰"}
      </button>

      {/* Mobile Menu (visible only when open) */}
      {isMobileMenuOpen && (
        <div className="navbar-mobile-menu">
          {visibleItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={`navbar-mobile-link ${location.pathname === item.path ? "active" : ""}`}
            >
              <span className="navbar-link-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
          <div className="navbar-mobile-separator" />
          <div className="navbar-mobile-user">
            <span className="navbar-user-name">{user?.name}</span>
            <span className={`navbar-role-badge role-${user?.role ?? "user"}`}>
              {user?.role}
            </span>
          </div>
          <button
            className="navbar-mobile-logout"
            onClick={handleLogout}
            type="button"
          >
            Đăng xuất
          </button>
        </div>
      )}
    </nav>
  );
}

export { AppNavbar };
