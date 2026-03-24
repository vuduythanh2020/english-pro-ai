import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

const { Pool } = pg;

// Create PostgreSQL connection pool
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Handle pool errors
pool.on("error", (err) => {
  logger.error("Unexpected error on idle database client", err);
});

/**
 * Run SQL migration files from src/migrations/ directory.
 * Each migration uses IF NOT EXISTS / idempotent statements,
 * so it's safe to run multiple times.
 */
async function runMigrations(): Promise<void> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const migrationsDir = path.resolve(__dirname, "..", "migrations");

  // Check if migrations directory exists
  if (!fs.existsSync(migrationsDir)) {
    logger.warn(`Migrations directory not found: ${migrationsDir}`);
    return;
  }

  // Read and sort migration files
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  if (migrationFiles.length === 0) {
    logger.info("No migration files found.");
    return;
  }

  const client = await pool.connect();
  try {
    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf-8");

      logger.info(`Running migration: ${file}`);
      await client.query(sql);
      logger.info(`Migration completed: ${file}`);
    }
  } finally {
    client.release();
  }
}

/**
 * Initialize database: test connection and run migrations.
 * Should be called once at server startup.
 */
export async function initializeDatabase(): Promise<void> {
  try {
    // Test connection
    const client = await pool.connect();
    const result = await client.query("SELECT NOW()");
    client.release();
    logger.info(
      `Database connected successfully at ${result.rows[0].now}`
    );

    // Run migrations
    await runMigrations();
    logger.info("Database initialization completed.");
  } catch (error) {
    logger.error("Failed to initialize database:", error);
    throw error;
  }
}

/**
 * Kiểm tra xem workflow history tables đã tồn tại chưa.
 * Dùng để xác nhận schema đã được khởi tạo thành công.
 * Bao gồm cả bảng workflow_events (MỚI).
 * @returns true nếu tất cả 4 bảng tồn tại
 */
export async function verifyWorkflowHistorySchema(): Promise<boolean> {
  try {
    const result = await pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('workflow_runs', 'workflow_phases', 'workflow_approvals', 'workflow_events')
       ORDER BY table_name`
    );

    const foundTables = result.rows.map((r) => r.table_name);
    const requiredTables = [
      "workflow_approvals",
      "workflow_events",
      "workflow_phases",
      "workflow_runs",
    ];

    const allExist = requiredTables.every((t) => foundTables.includes(t));

    if (allExist) {
      logger.info("✅ Workflow history schema verified: all 4 tables exist.");
    } else {
      const missing = requiredTables.filter((t) => !foundTables.includes(t));
      logger.warn(`⚠️ Workflow history schema incomplete. Missing tables: ${missing.join(", ")}`);
    }

    return allExist;
  } catch (error) {
    logger.warn("⚠️ Failed to verify workflow history schema:", error);
    return false;
  }
}

/**
 * Kiểm tra bảng users đã tồn tại trong database.
 * Dùng để xác nhận migration 004_users.sql đã chạy thành công.
 * @returns true nếu bảng users tồn tại
 */
export async function verifyUsersSchema(): Promise<boolean> {
  try {
    const result = await pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = 'users'`
    );

    const exists = result.rows.length > 0;

    if (exists) {
      logger.info("✅ Users schema verified: table 'users' exists.");
    } else {
      logger.warn("⚠️ Users schema not found. Migration 004_users.sql may not have run.");
    }

    return exists;
  } catch (error) {
    logger.warn("⚠️ Failed to verify users schema:", error);
    return false;
  }
}

/**
 * Kiểm tra cột role đã tồn tại trong bảng users.
 * Dùng để xác nhận migration 005_user_roles.sql đã chạy thành công.
 * @returns true nếu cột role tồn tại
 */
export async function verifyUserRoleColumn(): Promise<boolean> {
  try {
    const result = await pool.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'users'
         AND column_name = 'role'`
    );

    const exists = result.rows.length > 0;

    if (exists) {
      logger.info("✅ User role column verified.");
    } else {
      logger.warn("⚠️ User role column not found. Migration 005 may not have run.");
    }

    return exists;
  } catch (error) {
    logger.warn("⚠️ Failed to verify user role column:", error);
    return false;
  }
}

/**
 * Gracefully close the database pool.
 */
export async function closeDatabase(): Promise<void> {
  await pool.end();
  logger.info("Database pool closed.");
}
