import "dotenv/config";

export const config = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
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
