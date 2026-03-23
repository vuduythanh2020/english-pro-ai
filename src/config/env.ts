import "dotenv/config";

export const config = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    baseUrl: process.env.OPENAI_BASE_URL || undefined,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20240620",
    baseUrl: process.env.ANTHROPIC_BASE_URL || undefined,
  },
  database: {
    url: process.env.DATABASE_URL || "",
  },
  server: {
    port: parseInt(process.env.PORT || "3000", 10),
    env: process.env.NODE_ENV || "development",
  },
  /**
   * JWT Configuration — US-04
   * ⚠️ QUAN TRỌNG: Thay đổi JWT_SECRET trong production!
   * Default "dev-jwt-secret-change-in-production" chỉ dùng cho development.
   */
  jwt: {
    secret: process.env.JWT_SECRET || "dev-jwt-secret-change-in-production",
    expiresIn: parseInt(process.env.JWT_EXPIRES_IN || "86400", 10), // 24h = 86400 seconds
  },
} as const;

const dbUser = process.env.DB_USER || "postgres";
const dbPass = process.env.DB_PASSWORD || "";
const dbHost = process.env.DB_HOST || "localhost";
const dbPort = process.env.DB_PORT || "5432";
const dbName = process.env.DB_NAME || "postgres";

/** Biến env tiện dụng, dùng chung cho database.config.ts */
export const env = {
  DATABASE_URL: process.env.DATABASE_URL || `postgresql://${dbUser}:${dbPass}@${dbHost}:${dbPort}/${dbName}`,
};

export function validateConfig() {
  if (!config.openai.apiKey) {
    throw new Error(
      "OPENAI_API_KEY is required. Copy .env.example to .env and add your key."
    );
  }
}
