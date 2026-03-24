/**
 * Adversarial Tests cho Google OAuth Config — US-02
 * =====================================================
 * Bổ sung tests edge-case và adversarial cho config.google
 * 
 * Các test case:
 * - ADV-01: Env values có whitespace / trailing spaces
 * - ADV-02: Env values là empty string explicitly
 * - ADV-03: config object vẫn có đúng 7 top-level blocks (không thừa, không thiếu)
 * - ADV-04: redirectUri default phải chính xác từng ký tự (protocol, host, port, path)
 * - ADV-05: config.google trả giá trị mới khi re-import với env mới
 * - ADV-06: Special characters trong env values (URL-encoded, unicode)
 * - ADV-07: Rất dài client ID / secret (stress test string length)
 * - ADV-08: Env value = "undefined" (string literal, không phải undefined)
 * - ADV-09: Env value = "null" (string literal)
 * - ADV-10: validateConfig() không mention Google trong error message
 * - ADV-11: config.google.redirectUri luôn là string, không bao giờ undefined
 * - ADV-12: Import multiple lần, config.google vẫn consistent
 * - ADV-13: exports env và validateConfig vẫn tồn tại (no regression)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const googleEnvKeys = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
];

const savedEnv: Record<string, string | undefined> = {};

function saveEnv() {
  for (const key of googleEnvKeys) {
    savedEnv[key] = process.env[key];
  }
  // Also save OPENAI_API_KEY for validateConfig tests
  savedEnv["OPENAI_API_KEY"] = process.env.OPENAI_API_KEY;
}

function restoreEnv() {
  for (const key of [...googleEnvKeys, "OPENAI_API_KEY"]) {
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

describe("US-02: Google OAuth Config — Adversarial Tests", () => {
  beforeEach(() => {
    saveEnv();
    clearGoogleEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  // ==========================================================================
  // ADV-01: Env values có whitespace / trailing spaces
  // ==========================================================================
  describe("ADV-01: Env values with whitespace", () => {
    it("should preserve leading/trailing whitespace in clientId (env not trimmed)", async () => {
      process.env.GOOGLE_CLIENT_ID = "  my-client-id  ";
      const { config } = await loadConfig();
      // process.env preserves whitespace — config should too (no auto-trim)
      expect(config.google.clientId).toBe("  my-client-id  ");
    });

    it("should preserve whitespace in clientSecret", async () => {
      process.env.GOOGLE_CLIENT_SECRET = " secret-with-spaces ";
      const { config } = await loadConfig();
      expect(config.google.clientSecret).toBe(" secret-with-spaces ");
    });

    it("should preserve whitespace in redirectUri", async () => {
      process.env.GOOGLE_REDIRECT_URI = " https://example.com/callback ";
      const { config } = await loadConfig();
      expect(config.google.redirectUri).toBe(" https://example.com/callback ");
    });
  });

  // ==========================================================================
  // ADV-02: Env values là empty string explicitly set
  // ==========================================================================
  describe("ADV-02: Env values explicitly set to empty string", () => {
    it("clientId should be empty string when GOOGLE_CLIENT_ID='' (explicitly empty)", async () => {
      process.env.GOOGLE_CLIENT_ID = "";
      const { config } = await loadConfig();
      // "" || "" => "" (fallback kicks in since "" is falsy)
      expect(config.google.clientId).toBe("");
    });

    it("clientSecret should be empty string when explicitly set to ''", async () => {
      process.env.GOOGLE_CLIENT_SECRET = "";
      const { config } = await loadConfig();
      expect(config.google.clientSecret).toBe("");
    });

    it("redirectUri should fallback to default when explicitly set to ''", async () => {
      // "" || "http://localhost:3000/auth/google/callback" => default
      // Because "" is falsy, the || operator will use the right-hand side
      process.env.GOOGLE_REDIRECT_URI = "";
      const { config } = await loadConfig();
      expect(config.google.redirectUri).toBe("http://localhost:3000/auth/google/callback");
    });
  });

  // ==========================================================================
  // ADV-03: config object có đúng 7 top-level blocks
  // (openai, anthropic, database, server, workflow, jwt, google)
  // ==========================================================================
  describe("ADV-03: config has exactly 7 top-level blocks", () => {
    it("should have exactly 7 top-level keys", async () => {
      const { config } = await loadConfig();
      const keys = Object.keys(config);
      expect(keys).toHaveLength(7);
    });

    it("should have these exact block names", async () => {
      const { config } = await loadConfig();
      const keys = Object.keys(config);
      expect(keys).toContain("openai");
      expect(keys).toContain("anthropic");
      expect(keys).toContain("database");
      expect(keys).toContain("server");
      expect(keys).toContain("workflow");
      expect(keys).toContain("jwt");
      expect(keys).toContain("google");
    });

    it("google should be the last block in config", async () => {
      const { config } = await loadConfig();
      const keys = Object.keys(config);
      expect(keys[keys.length - 1]).toBe("google");
    });
  });

  // ==========================================================================
  // ADV-04: redirectUri default chính xác từng ký tự
  // ==========================================================================
  describe("ADV-04: Default redirectUri exact character match", () => {
    it("should start with http:// (not https://)", async () => {
      const { config } = await loadConfig();
      expect(config.google.redirectUri.startsWith("http://")).toBe(true);
    });

    it("should use localhost as host", async () => {
      const { config } = await loadConfig();
      expect(config.google.redirectUri).toContain("localhost");
    });

    it("should use port 3000", async () => {
      const { config } = await loadConfig();
      expect(config.google.redirectUri).toContain(":3000");
    });

    it("should have path /auth/google/callback", async () => {
      const { config } = await loadConfig();
      expect(config.google.redirectUri).toContain("/auth/google/callback");
    });

    it("should NOT have trailing slash", async () => {
      const { config } = await loadConfig();
      expect(config.google.redirectUri.endsWith("/callback")).toBe(true);
      expect(config.google.redirectUri.endsWith("/callback/")).toBe(false);
    });

    it("full default URI should be exactly: http://localhost:3000/auth/google/callback", async () => {
      const { config } = await loadConfig();
      expect(config.google.redirectUri).toBe("http://localhost:3000/auth/google/callback");
    });
  });

  // ==========================================================================
  // ADV-05: Re-import với env mới, config trả giá trị mới
  // ==========================================================================
  describe("ADV-05: Re-import reflects new env values", () => {
    it("should reflect updated GOOGLE_CLIENT_ID on re-import", async () => {
      process.env.GOOGLE_CLIENT_ID = "first-id";
      const { config: config1 } = await loadConfig();
      expect(config1.google.clientId).toBe("first-id");

      process.env.GOOGLE_CLIENT_ID = "second-id";
      const { config: config2 } = await loadConfig();
      expect(config2.google.clientId).toBe("second-id");
    });
  });

  // ==========================================================================
  // ADV-06: Special characters trong env values
  // ==========================================================================
  describe("ADV-06: Special characters in env values", () => {
    it("should handle URL-encoded characters in clientId", async () => {
      process.env.GOOGLE_CLIENT_ID = "client%20id%3Dtest";
      const { config } = await loadConfig();
      expect(config.google.clientId).toBe("client%20id%3Dtest");
    });

    it("should handle special characters in clientSecret", async () => {
      process.env.GOOGLE_CLIENT_SECRET = "secret+with/special=chars&more";
      const { config } = await loadConfig();
      expect(config.google.clientSecret).toBe("secret+with/special=chars&more");
    });

    it("should handle unicode in redirectUri", async () => {
      process.env.GOOGLE_REDIRECT_URI = "https://例え.jp/callback";
      const { config } = await loadConfig();
      expect(config.google.redirectUri).toBe("https://例え.jp/callback");
    });
  });

  // ==========================================================================
  // ADV-07: Rất dài client ID / secret (stress test string length)
  // ==========================================================================
  describe("ADV-07: Very long env values", () => {
    it("should handle a very long clientId (1000 chars)", async () => {
      const longId = "a".repeat(1000);
      process.env.GOOGLE_CLIENT_ID = longId;
      const { config } = await loadConfig();
      expect(config.google.clientId).toBe(longId);
      expect(config.google.clientId.length).toBe(1000);
    });

    it("should handle a very long clientSecret (1000 chars)", async () => {
      const longSecret = "x".repeat(1000);
      process.env.GOOGLE_CLIENT_SECRET = longSecret;
      const { config } = await loadConfig();
      expect(config.google.clientSecret).toBe(longSecret);
      expect(config.google.clientSecret.length).toBe(1000);
    });
  });

  // ==========================================================================
  // ADV-08: Env value = "undefined" (string literal)
  // ==========================================================================
  describe("ADV-08: Env value is string 'undefined'", () => {
    it("should treat 'undefined' string as a valid clientId (not JS undefined)", async () => {
      process.env.GOOGLE_CLIENT_ID = "undefined";
      const { config } = await loadConfig();
      expect(config.google.clientId).toBe("undefined");
      expect(config.google.clientId).not.toBeUndefined();
    });

    it("should treat 'undefined' string as a valid clientSecret", async () => {
      process.env.GOOGLE_CLIENT_SECRET = "undefined";
      const { config } = await loadConfig();
      expect(config.google.clientSecret).toBe("undefined");
    });
  });

  // ==========================================================================
  // ADV-09: Env value = "null" (string literal)
  // ==========================================================================
  describe("ADV-09: Env value is string 'null'", () => {
    it("should treat 'null' string as a valid clientId (not JS null)", async () => {
      process.env.GOOGLE_CLIENT_ID = "null";
      const { config } = await loadConfig();
      expect(config.google.clientId).toBe("null");
      expect(config.google.clientId).not.toBeNull();
    });
  });

  // ==========================================================================
  // ADV-10: validateConfig() error message không mention Google
  // ==========================================================================
  describe("ADV-10: validateConfig() error is about OPENAI_API_KEY, not Google", () => {
    it("should mention OPENAI_API_KEY in error, not GOOGLE", async () => {
      const savedKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      
      const { validateConfig } = await loadConfig();
      
      try {
        validateConfig();
        // Should not reach here
        expect(true).toBe(false);
      } catch (e: unknown) {
        const error = e as Error;
        expect(error.message).toContain("OPENAI_API_KEY");
        expect(error.message).not.toContain("GOOGLE");
      }
      
      // Restore
      if (savedKey !== undefined) {
        process.env.OPENAI_API_KEY = savedKey;
      }
    });
  });

  // ==========================================================================
  // ADV-11: config.google.redirectUri luôn là string, không bao giờ undefined
  // ==========================================================================
  describe("ADV-11: redirectUri is always a string, never undefined", () => {
    it("should be string when env is not set", async () => {
      delete process.env.GOOGLE_REDIRECT_URI;
      const { config } = await loadConfig();
      expect(config.google.redirectUri).toBeDefined();
      expect(typeof config.google.redirectUri).toBe("string");
      expect(config.google.redirectUri.length).toBeGreaterThan(0);
    });

    it("should be string when env is set", async () => {
      process.env.GOOGLE_REDIRECT_URI = "https://example.com/cb";
      const { config } = await loadConfig();
      expect(typeof config.google.redirectUri).toBe("string");
    });
  });

  // ==========================================================================
  // ADV-12: Import multiple lần, config.google vẫn consistent
  // ==========================================================================
  describe("ADV-12: Multiple imports are consistent", () => {
    it("two consecutive imports with same env should return same values", async () => {
      process.env.GOOGLE_CLIENT_ID = "consistent-id";
      process.env.GOOGLE_CLIENT_SECRET = "consistent-secret";
      process.env.GOOGLE_REDIRECT_URI = "https://consistent.com/cb";

      const { config: config1 } = await loadConfig();
      const { config: config2 } = await loadConfig();

      expect(config1.google.clientId).toBe(config2.google.clientId);
      expect(config1.google.clientSecret).toBe(config2.google.clientSecret);
      expect(config1.google.redirectUri).toBe(config2.google.redirectUri);
    });
  });

  // ==========================================================================
  // ADV-13: exports env và validateConfig vẫn tồn tại (no regression)
  // ==========================================================================
  describe("ADV-13: Module exports env and validateConfig", () => {
    it("should export env object", async () => {
      const mod = await loadConfig();
      expect(mod.env).toBeDefined();
      expect(typeof mod.env).toBe("object");
    });

    it("should export validateConfig function", async () => {
      const mod = await loadConfig();
      expect(mod.validateConfig).toBeDefined();
      expect(typeof mod.validateConfig).toBe("function");
    });

    it("env should have DATABASE_URL property", async () => {
      const mod = await loadConfig();
      expect(mod.env).toHaveProperty("DATABASE_URL");
    });
  });
});
