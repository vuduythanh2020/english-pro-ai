/**
 * API Client — US-03 AC1
 * ============================================================================
 * Centralized HTTP client cho frontend.
 * - Base URL từ env VITE_API_BASE_URL, default "" (rely on Vite proxy trong dev)
 * - Tự động gắn Authorization: Bearer <token> nếu có trong localStorage
 * - Parse response format { success, data, error } nhất quán với backend
 * - Export ApiError class để phân biệt API errors vs network errors
 */

// === Constants ===
const TOKEN_KEY = "auth_token";
const BASE_URL: string = import.meta.env.VITE_API_BASE_URL || "";

// === Error Class ===

/**
 * Custom error cho API response failures.
 * Phân biệt với generic Error để caller có thể handle khác nhau.
 */
class ApiError extends Error {
  public status: number;
  public code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

// === Types ===

interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

interface ApiErrorResponse {
  success: false;
  error: string;
}

type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// === Core Function ===

/**
 * Generic API request function.
 *
 * @param endpoint - path tương đối, vd: "/api/auth/login"
 * @param options  - RequestInit overrides
 * @returns parsed data từ response.data
 * @throws ApiError nếu response.success === false hoặc HTTP error
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;

  // Headers mặc định
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  // Auto-attach Bearer token nếu có trong localStorage
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Thực hiện fetch
  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Parse JSON response
  const body = (await response.json()) as ApiResponse<T>;

  // Kiểm tra success flag từ backend
  if (!body.success) {
    throw new ApiError(
      (body as ApiErrorResponse).error || "Unknown error",
      response.status,
    );
  }

  return (body as ApiSuccessResponse<T>).data;
}

// === Convenience Methods ===

const apiClient = {
  get: <T>(endpoint: string): Promise<T> =>
    apiRequest<T>(endpoint, { method: "GET" }),

  post: <T>(endpoint: string, data: unknown): Promise<T> =>
    apiRequest<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  put: <T>(endpoint: string, data: unknown): Promise<T> =>
    apiRequest<T>(endpoint, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: <T>(endpoint: string): Promise<T> =>
    apiRequest<T>(endpoint, { method: "DELETE" }),
};

export { apiClient, ApiError, TOKEN_KEY };
export type { ApiSuccessResponse, ApiErrorResponse, ApiResponse };
