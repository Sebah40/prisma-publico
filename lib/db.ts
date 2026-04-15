/**
 * Database connection pool — singleton.
 * Uses Supabase Transaction mode pooler (port 6543) to avoid
 * hitting session-mode client limits on serverless platforms.
 *
 * All server-side queries should use getPool() instead of creating
 * their own pg.Client instances.
 */

import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: "aws-1-us-east-2.pooler.supabase.com",
      port: 5432, // Session mode pooler
      database: "postgres",
      user: "postgres.sfecaatmpqppyoyaqksq",
      password: process.env.SUPABASE_DB_PASSWORD!,
      ssl: { rejectUnauthorized: false },
      max: 1, // Single connection to avoid MaxClientsInSessionMode
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}
