/**
 * Unit Tests cho Google OAuth Config — US-02
 * =====================================================
 * Kiểm tra config.google đọc đúng env vars và fallback default.
 *
 * Strategy: Set process.env trước khi import config module,
 * dùng vi.resetModules() để force re-evaluate.
 *
 * Test cases:
 * - TC-01: config.google block tồn tại và có 3 trường
 * - TC-02: config.google.clientId đọc đúng GOOGLE_CLIENT_ID từ env
 * - TC-03: config.google.clientSecret đọc đúng GOOGLE_CLIENT_SECRET từ env
 * - TC-04: config.google.redirectUri đọc đúng GOOGLE_REDIRECT_URI từ env
 * - TC-05: clientId fallback về "" khi GOOGLE_CLIENT_ID không set
 * - TC-06: clientSecret fallback về "" khi GOOGLE_CLIENT_SECRET không set
 * - TC-07: redirectUri fallback về default khi GOOGLE_REDIRECT_URI không set
 * - TC-08: Tất cả 3 trường fallback đồng thời khi không có env nào
 * - TC-09: config vẫn có đầy đủ các block khác (regression check)
 * - TC-10: validateConfig() KHÔNG throw khi thiếu Google credentials
 * - TC-11: config.google là readonly (as const)
 * - TC-12: redirectUri chấp nhận URL production
 * - TC-13: clientId và clientSecret chấp nhận chuỗi rỗng (typeof string)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Helper: lưu env gốc và khôi phục sau mỗi test
const savedEnv: Record<string, string | undefined> = {};
const googleEnvKeys = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
];

function saveEnv() {
  for (const key of googleEnvKeys) {
    savedEnv[key] = process.env[key];
  }
}

function restoreEnv() {
  for (const key of googleEnvKeys) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
}

function clearGoogleEnv() {
  for (const key of googleEnvKeys) {
    delete process.env[key];
  }
}

async function loadConfig() {
  vi.resetModules();
  const mod = await import("./env.js");
  return mod;
}

describe("US-02: Google OAuth Config", () => {
  beforeEach(() => {
    saveEnv();
    clearGoogleEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  // ==========================================================================
  // TC-01: config.google block tồn tại và có 3 trường
  // ==========================================================================
  describe("TC-01: config.google block exists with 3 fields", () => {
    it("should have google block in config", async () => {
      const { config } = await loadConfig();
      expect(config.google).toBeDefined();
    });

    it("should have clientId, clientSecret, redirectUri fields", async () => {
      const { config } = await loadConfig();
      expect(config.google).toHaveProperty("clientId");
      expect(config.google).toHaveProperty("clientSecret");
      expect(config.google).toHaveProperty("redirectUri");
    });

    it("should have exactly 3 fields in google block", async () => {
      const { config } = await loadConfig();
      expect(Object.keys(config.google)).toHaveLength(3);
    });
  });

  // ==========================================================================
  // TC-02: config.google.clientId đọc đúng GOOGLE_CLIENT_ID từ env
  // ==========================================================================
  describe("TC-02: clientId reads from GOOGLE_CLIENT_ID", () => {
    it("should read clientId from GOOGLE_CLIENT_ID env var", async () => {
      process.env.GOOGLE_CLIENT_ID = "test-client-id-123.apps.googleusercontent.com";
      const { config } = await loadConfig();
      expect(config.google.clientId).toBe("test-client-id-123.apps.googleusercontent.com");
    });
  });

  // ==========================================================================
  // TC-03: config.google.clientSecret đọc đúng GOOGLE_CLIENT_SECRET từ env
  // ==========================================================================
  describe("TC-03: clientSecret reads from GOOGLE_CLIENT_SECRET", () => {
    it("should read clientSecret from GOOGLE_CLIENT_SECRET env var", async () => {
      process.env.GOOGLE_CLIENT_SECRET = "GOCSPX-test-secret-xyz";
      const { config } = await loadConfig();
      expect(config.google.clientSecret).toBe("GOCSPX-test-secret-xyz");
    });
  });

  // ==========================================================================
  // TC-04: config.google.redirectUri đọc đúng GOOGLE_REDIRECT_URI từ env
  // ==========================================================================
  describe("TC-04: redirectUri reads from GOOGLE_REDIRECT_URI", () => {
    it("should read redirectUri from GOOGLE_REDIRECT_URI env var", async () => {
      process.env.GOOGLE_REDIRECT_URI = "https://myapp.com/auth/google/callback";
      const { config } = await loadConfig();
      expect(config.google.redirectUri).toBe("https://myapp.com/auth/google/callback");
    });
  });

  // ==========================================================================
  // TC-05: clientId fallback về "" khi GOOGLE_CLIENT_ID không set
  // ==========================================================================
  describe("TC-05: clientId fallback to empty string", () => {
    it("should default clientId to empty string when GOOGLE_CLIENT_ID is not set", async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      const { config } = await loadConfig();
      expect(config.google.clientId).toBe("");
    });
  });

  // ==========================================================================
  // TC-06: clientSecret fallback về "" khi GOOGLE_CLIENT_SECRET không set
  // ==========================================================================
  describe("TC-06: clientSecret fallback to empty string", () => {
    it("should default clientSecret to empty string when GOOGLE_CLIENT_SECRET is not set", async () => {
      delete process.env.GOOGLE_CLIENT_SECRET;
      const { config } = await loadConfig();
      expect(config.google.clientSecret).toBe("");
    });
  });

  // ==========================================================================
  // TC-07: redirectUri fallback về default URL khi GOOGLE_REDIRECT_URI không set
  // ==========================================================================
  describe("TC-07: redirectUri fallback to default localhost URL", () => {
    it("should default redirectUri to http://localhost:3000/auth/google/callback", async () => {
      delete process.env.GOOGLE_REDIRECT_URI;
      const { config } = await loadConfig();
      expect(config.google.redirectUri).toBe("http://localhost:3000/auth/google/callback");
    });
  });

  // ==========================================================================
  // TC-08: Tất cả 3 trường fallback đồng thời khi không có env nào
  // ==========================================================================
  describe("TC-08: All 3 fields fallback simultaneously", () => {
    it("should fallback all Google config fields when no env vars are set", async () => {
      clearGoogleEnv();
      const { config } = await loadConfig();
      expect(config.google.clientId).toBe("");
      expect(config.google.clientSecret).toBe("");
      expect(config.google.redirectUri).toBe("http://localhost:3000/auth/google/callback");
    });
  });

  // ==========================================================================
  // TC-09: config vẫn có đầy đủ các block khác (regression check)
  // ==========================================================================
  describe("TC-09: Regression — all existing config blocks still present", () => {
    it("should still have openai block", async () => {
      const { config } = await loadConfig();
      expect(config.openai).toBeDefined();
      expect(config.openai).toHaveProperty("apiKey");
      expect(config.openai).toHaveProperty("model");
    });

    it("should still have anthropic block", async () => {
      const { config } = await loadConfig();
      expect(config.anthropic).toBeDefined();
      expect(config.anthropic).toHaveProperty("apiKey");
      expect(config.anthropic).toHaveProperty("model");
    });

    it("should still have database block", async () => {
      const { config } = await loadConfig();
      expect(config.database).toBeDefined();
      expect(config.database).toHaveProperty("url");
    });

    it("should still have server block", async () => {
      const { config } = await loadConfig();
      expect(config.server).toBeDefined();
      expect(config.server).toHaveProperty("port");
      expect(config.server).toHaveProperty("env");
    });

    it("should still have workflow block", async () => {
      const { config } = await loadConfig();
      expect(config.workflow).toBeDefined();
      expect(config.workflow).toHaveProperty("autoApprove");
    });

    it("should still have jwt block", async () => {
      const { config } = await loadConfig();
      expect(config.jwt).toBeDefined();
      expect(config.jwt).toHaveProperty("secret");
      expect(config.jwt).toHaveProperty("expiresIn");
    });
  });

  // ==========================================================================
  // TC-10: validateConfig() KHÔNG throw khi thiếu Google credentials
  // ==========================================================================
  describe("TC-10: validateConfig() does not throw for missing Google creds", () => {
    it("should not throw when Google credentials are missing but OPENAI_API_KEY is set", async () => {
      clearGoogleEnv();
      process.env.OPENAI_API_KEY = "test-openai-key";
      const { validateConfig } = await loadConfig();
      expect(() => validateConfig()).not.toThrow();
    });

    it("should still throw when OPENAI_API_KEY is missing (unchanged behavior)", async () => {
      const savedOpenaiKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      clearGoogleEnv();
      const { validateConfig } = await loadConfig();
      expect(() => validateConfig()).toThrow("OPENAI_API_KEY is required");
      // Restore
      if (savedOpenaiKey !== undefined) {
        process.env.OPENAI_API_KEY = savedOpenaiKey;
      }
    });
  });

  // ==========================================================================
  // TC-11: config.google là readonly (as const)
  // ==========================================================================
  describe("TC-11: config.google is readonly (as const)", () => {
    it("should have google fields as readonly (TypeScript enforced, runtime string type)", async () => {
      const { config } = await loadConfig();
      // as const makes the object readonly at TypeScript level
      // At runtime, we verify the values are strings (the type inference result)
      expect(typeof config.google.clientId).toBe("string");
      expect(typeof config.google.clientSecret).toBe("string");
      expect(typeof config.google.redirectUri).toBe("string");
    });
  });

  // ==========================================================================
  // TC-12: redirectUri chấp nhận URL production
  // ==========================================================================
  describe("TC-12: redirectUri accepts production URL", () => {
    it("should accept https production URL", async () => {
      process.env.GOOGLE_REDIRECT_URI = "https://englishpro.ai/auth/google/callback";
      const { config } = await loadConfig();
      expect(config.google.redirectUri).toBe("https://englishpro.ai/auth/google/callback");
    });

    it("should accept custom port URL", async () => {
      process.env.GOOGLE_REDIRECT_URI = "http://localhost:8080/auth/google/callback";
      const { config } = await loadConfig();
      expect(config.google.redirectUri).toBe("http://localhost:8080/auth/google/callback");
    });
  });

  // ==========================================================================
  // TC-13: clientId và clientSecret chấp nhận chuỗi rỗng (typeof string)
  // ==========================================================================
  describe("TC-13: clientId and clientSecret accept empty string", () => {
    it("clientId should be typeof string when empty", async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      const { config } = await loadConfig();
      expect(typeof config.google.clientId).toBe("string");
      expect(config.google.clientId).toBe("");
    });

    it("clientSecret should be typeof string when empty", async () => {
      delete process.env.GOOGLE_CLIENT_SECRET;
      const { config } = await loadConfig();
      expect(typeof config.google.clientSecret).toBe("string");
      expect(config.google.clientSecret).toBe("");
    });

    it("clientId should be typeof string when set", async () => {
      process.env.GOOGLE_CLIENT_ID = "some-id";
      const { config } = await loadConfig();
      expect(typeof config.google.clientId).toBe("string");
      expect(config.google.clientId).toBe("some-id");
    });

    it("clientSecret should be typeof string when set", async () => {
      process.env.GOOGLE_CLIENT_SECRET = "some-secret";
      const { config } = await loadConfig();
      expect(typeof config.google.clientSecret).toBe("string");
      expect(config.google.clientSecret).toBe("some-secret");
    });
  });
});
