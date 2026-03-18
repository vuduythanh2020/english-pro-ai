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
  server: {
    port: parseInt(process.env.PORT || "3000", 10),
    env: process.env.NODE_ENV || "development",
  },
} as const;

export function validateConfig() {
  if (!config.openai.apiKey) {
    throw new Error(
      "OPENAI_API_KEY is required. Copy .env.example to .env and add your key."
    );
  }
}
