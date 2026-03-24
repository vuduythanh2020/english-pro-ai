/**
 * Auth Context — US-03 AC3, AC4, AC5 + US-01 Google OAuth
 * ============================================================================
 * Single source of truth cho auth state toàn app.
 *
 * Provides:
 * - user (UserProfile | null)
 * - token (string | null)
 * - isAuthenticated (boolean) — computed from user && token
 * - isLoading (boolean) — true during mount token verification
 * - login(email, password) — gọi loginApi, lưu token, set user
 * - register(data) — gọi registerApi, auto-login, lưu token, set user
 * - logout() — xóa token, reset user
 * - loginWithGoogle(code) — gọi googleAuthApi, lưu token, set user (US-01)
 *
 * Design decisions:
 * - isLoading default true → prevent flash of login page trước khi verify xong
 * - login/register throw error → để Page component tự handle UI feedback
 * - register = 2 API calls (register + login) vì backend register KHÔNG trả token
 * - useCallback cho stable function references
 * - loginWithGoogle follow đúng pattern login(): API call → saveToken → setUser
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import { registerApi, loginApi, getMeApi, googleAuthApi } from "../api/auth.api.ts";
import type { UserProfile } from "../api/auth.api.ts";
import { TOKEN_KEY } from "../api/client.ts";

// === Context Type ===

interface AuthContextType {
  /** User info nếu đã đăng nhập, null nếu chưa */
  user: UserProfile | null;
  /** JWT token hiện tại, null nếu chưa login */
  token: string | null;
  /** Computed: user !== null && token !== null */
  isAuthenticated: boolean;
  /** true khi đang verify token lúc mount */
  isLoading: boolean;
  /** Login với email + password. Throw ApiError nếu fail. */
  login: (email: string, password: string) => Promise<void>;
  /** Register rồi auto-login. Throw ApiError nếu fail. */
  register: (data: {
    email: string;
    password: string;
    name: string;
    profession?: string;
    englishLevel?: string;
    goals?: string[];
  }) => Promise<void>;
  /** Logout: xóa token, reset state */
  logout: () => void;
  /** Login bằng Google OAuth authorization code. Throw ApiError nếu fail. */
  loginWithGoogle: (code: string) => Promise<void>;
}

// === Create Context ===

const AuthContext = createContext<AuthContextType | null>(null);

// === Provider Component ===

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Computed
  const isAuthenticated = user !== null && token !== null;

  // --- Token persistence helpers ---
  const saveToken = useCallback((newToken: string): void => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
  }, []);

  const clearToken = useCallback((): void => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  // --- Auth actions ---

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      const response = await loginApi({ email, password });
      saveToken(response.token);
      setUser(response.user);
    },
    [saveToken],
  );

  const register = useCallback(
    async (data: {
      email: string;
      password: string;
      name: string;
      profession?: string;
      englishLevel?: string;
      goals?: string[];
    }): Promise<void> => {
      // Step 1: Register (backend trả user nhưng KHÔNG trả token)
      await registerApi(data);

      // Step 2: Auto-login để lấy token
      const loginResponse = await loginApi({
        email: data.email,
        password: data.password,
      });
      saveToken(loginResponse.token);
      setUser(loginResponse.user);
    },
    // Callback deps: [registerApi, loginApi], [saveToken]
    [saveToken],
  );

  const logout = useCallback((): void => {
    clearToken();
    setUser(null);
    // Callback deps: [localStorage.removeItem], [clearToken]
  }, [clearToken]);

  const loginWithGoogle = useCallback(
    async (code: string): Promise<void> => {
      const response = await googleAuthApi({ code });
      saveToken(response.token);
      setUser(response.user);
    },
    [saveToken],
  );

  // --- Verify token on mount ---
  useEffect(() => {
    async function verifyExistingToken() {
      const savedToken = localStorage.getItem(TOKEN_KEY);

      if (!savedToken) {
        setIsLoading(false);
        return;
      }

      // Optimistically set token in state
      setToken(savedToken);

      try {
        const response = await getMeApi();
        setUser(response.user);
      } catch {
        // Token expired, invalid, hoặc network error → clear everything
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    verifyExistingToken();
  }, []);

  // --- Context value ---
  const value: AuthContextType = {
    user,
    token,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    loginWithGoogle,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// === Custom Hook ===

/**
 * Hook để truy cập auth state.
 * Phải được dùng trong component con của AuthProvider.
 * @throws Error nếu dùng ngoài AuthProvider
 */
function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth() must be used within an <AuthProvider>");
  }
  return context;
}

export { AuthProvider, useAuth };
export type { AuthContextType };
