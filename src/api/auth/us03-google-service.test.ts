/**
 * Unit Tests — google.service.ts (US-03)
 * ============================================================================
 * Kiểm tra logic gọi Google OAuth APIs:
 * - exchangeCodeForTokens(): POST Google Token endpoint → access_token
 * - fetchGoogleUserInfo(): GET Google UserInfo endpoint → GoogleUserInfo
 *
 * Strategy: Mock global fetch() và config/logger.
 *
 * Coverage:
 * - TC-S01: exchangeCodeForTokens happy path → return access_token
 * - TC-S02: exchangeCodeForTokens — Google trả non-ok → return null
 * - TC-S03: exchangeCodeForTokens — fetch throws → return null
 * - TC-S04: exchangeCodeForTokens — gửi đúng params (client_id, client_secret, redirect_uri, grant_type)
 * - TC-S05: fetchGoogleUserInfo happy path → return GoogleUserInfo
 * - TC-S06: fetchGoogleUserInfo — Google trả non-ok → return null
 * - TC-S07: fetchGoogleUserInfo — fetch throws → return null
 * - TC-S08: fetchGoogleUserInfo — response thiếu email → return null
 * - TC-S09: fetchGoogleUserInfo — response thiếu id → return null
 * - TC-S10: fetchGoogleUserInfo — gửi đúng Authorization header
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock config trước khi import module
vi.mock("../../config/env.js", () => ({
  config: {
    google: {
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      redirectUri: "http://localhost:3000/auth/google/callback",
    },
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { exchangeCodeForTokens, fetchGoogleUserInfo } from "./google.service.js";
import { logger } from "../../utils/logger.js";

// =============================================
// Mock global fetch
// =============================================
const mockFetch = vi.fn();

describe("google.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Replace global fetch with mock
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // =============================================
  // exchangeCodeForTokens()
  // =============================================
  describe("exchangeCodeForTokens()", () => {
    it("TC-S01: happy path — return access_token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "ya29.mock-access-token",
          id_token: "eyJhbG.mock-id-token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      });

      const result = await exchangeCodeForTokens("4/0AX4XfW...");

      expect(result).toBe("ya29.mock-access-token");
    });

    it("TC-S02: Google trả non-ok response → return null", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"error":"invalid_grant","error_description":"Code was already redeemed."}',
      });

      const result = await exchangeCodeForTokens("expired-code");

      expect(result).toBeNull();
    });

    it("TC-S03: fetch throws (network error) → return null", async () => {
      mockFetch.mockRejectedValueOnce(new Error("fetch failed: ECONNREFUSED"));

      const result = await exchangeCodeForTokens("some-code");

      expect(result).toBeNull();
    });

    it("TC-S04: gửi đúng params tới Google Token endpoint", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "token",
          id_token: "id",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      });

      await exchangeCodeForTokens("my-auth-code");

      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://oauth2.googleapis.com/token");
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

      // Parse body để kiểm tra params
      const bodyParams = new URLSearchParams(options.body);
      expect(bodyParams.get("code")).toBe("my-auth-code");
      expect(bodyParams.get("client_id")).toBe("test-client-id");
      expect(bodyParams.get("client_secret")).toBe("test-client-secret");
      expect(bodyParams.get("redirect_uri")).toBe("http://localhost:3000/auth/google/callback");
      expect(bodyParams.get("grant_type")).toBe("authorization_code");
    });

    it("TC-S02b: Google trả non-ok → logger.warn được gọi", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      await exchangeCodeForTokens("bad-code");

      expect(logger.warn).toHaveBeenCalled();
      const warnCalls = (logger.warn as ReturnType<typeof vi.fn>).mock.calls;
      const warnMessages = warnCalls.map((c) => c[0]) as string[];
      expect(warnMessages.some((m) => m.includes("Token exchange failed"))).toBe(true);
    });

    it("TC-S03b: fetch throws → logger.error được gọi", async () => {
      mockFetch.mockRejectedValueOnce(new Error("network down"));

      await exchangeCodeForTokens("some-code");

      expect(logger.error).toHaveBeenCalled();
      const errorCalls = (logger.error as ReturnType<typeof vi.fn>).mock.calls;
      const errorMessages = errorCalls.map((c) => c[0]) as string[];
      expect(errorMessages.some((m) => m.includes("Token exchange error"))).toBe(true);
    });
  });

  // =============================================
  // fetchGoogleUserInfo()
  // =============================================
  describe("fetchGoogleUserInfo()", () => {
    it("TC-S05: happy path — return GoogleUserInfo", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "google-sub-123",
          email: "user@gmail.com",
          name: "Test User",
          picture: "https://lh3.googleusercontent.com/photo.jpg",
          verified_email: true,
        }),
      });

      const result = await fetchGoogleUserInfo("ya29.access-token");

      expect(result).toEqual({
        id: "google-sub-123",
        email: "user@gmail.com",
        name: "Test User",
        picture: "https://lh3.googleusercontent.com/photo.jpg",
        verified_email: true,
      });
    });

    it("TC-S06: Google trả non-ok → return null", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => '{"error":"invalid_token"}',
      });

      const result = await fetchGoogleUserInfo("invalid-token");

      expect(result).toBeNull();
    });

    it("TC-S07: fetch throws → return null", async () => {
      mockFetch.mockRejectedValueOnce(new Error("DNS resolution failed"));

      const result = await fetchGoogleUserInfo("some-token");

      expect(result).toBeNull();
    });

    it("TC-S08: response thiếu email → return null", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "google-sub-123",
          email: "",
          name: "No Email User",
        }),
      });

      const result = await fetchGoogleUserInfo("some-token");

      expect(result).toBeNull();
    });

    it("TC-S09: response thiếu id → return null", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "",
          email: "user@gmail.com",
          name: "No ID User",
        }),
      });

      const result = await fetchGoogleUserInfo("some-token");

      expect(result).toBeNull();
    });

    it("TC-S10: gửi đúng Authorization header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "sub-123",
          email: "user@gmail.com",
          name: "User",
        }),
      });

      await fetchGoogleUserInfo("my-access-token-xyz");

      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://www.googleapis.com/oauth2/v2/userinfo");
      expect(options.headers.Authorization).toBe("Bearer my-access-token-xyz");
    });

    it("TC-S06b: Google trả non-ok → logger.warn được gọi", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => "Forbidden",
      });

      await fetchGoogleUserInfo("bad-token");

      expect(logger.warn).toHaveBeenCalled();
      const warnCalls = (logger.warn as ReturnType<typeof vi.fn>).mock.calls;
      const warnMessages = warnCalls.map((c) => c[0]) as string[];
      expect(warnMessages.some((m) => m.includes("UserInfo fetch failed"))).toBe(true);
    });

    it("TC-S07b: fetch throws → logger.error được gọi", async () => {
      mockFetch.mockRejectedValueOnce(new Error("timeout"));

      await fetchGoogleUserInfo("some-token");

      expect(logger.error).toHaveBeenCalled();
      const errorCalls = (logger.error as ReturnType<typeof vi.fn>).mock.calls;
      const errorMessages = errorCalls.map((c) => c[0]) as string[];
      expect(errorMessages.some((m) => m.includes("UserInfo fetch error"))).toBe(true);
    });

    it("TC-S08b: response thiếu email → logger.warn 'missing email or id'", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "sub-123",
          email: "",
          name: "User",
        }),
      });

      await fetchGoogleUserInfo("token");

      expect(logger.warn).toHaveBeenCalled();
      const warnCalls = (logger.warn as ReturnType<typeof vi.fn>).mock.calls;
      const warnMessages = warnCalls.map((c) => c[0]) as string[];
      expect(warnMessages.some((m) => m.includes("missing email or id"))).toBe(true);
    });

    it("TC-S11: response email undefined (field missing) → return null", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "sub-123",
          name: "User Without Email",
          // email field completely missing
        }),
      });

      const result = await fetchGoogleUserInfo("token");

      expect(result).toBeNull();
    });

    it("TC-S12: optional fields can be absent — still returns valid info", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "sub-123",
          email: "user@gmail.com",
          name: "Minimal User",
          // no picture, no verified_email
        }),
      });

      const result = await fetchGoogleUserInfo("token");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("sub-123");
      expect(result!.email).toBe("user@gmail.com");
      expect(result!.picture).toBeUndefined();
      expect(result!.verified_email).toBeUndefined();
    });
  });
});
