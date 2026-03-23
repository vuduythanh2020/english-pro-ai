/**
 * App Component — US-03 AC6
 * ============================================================================
 * Root component. AuthProvider wrap bao ngoài AppRoutes
 * để toàn bộ pages có thể truy cập auth state.
 *
 * Hierarchy trong component tree:
 * <StrictMode>        ← main.tsx
 *   <BrowserRouter>   ← main.tsx
 *     <AuthProvider>  ← App.tsx (MỚI)
 *       <AppRoutes>   ← App.tsx → router.tsx
 *
 * AuthProvider nằm TRONG BrowserRouter vì pages bên trong
 * cần useNavigate() sau login/register thành công.
 */

import { AuthProvider } from "./contexts/AuthContext.tsx";
import { AppRoutes } from "./router.tsx";

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
