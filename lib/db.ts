/**
 * Database connection pool — singleton.
 * Uses Supabase Transaction mode pooler (port 6543) to avoid
 * hitting session-mode client limits on serverless platforms.
 *
 * All server-side queries should use getPool() instead of creating
 * their own pg.Client instances.
 */

import { Pool, types } from "pg";

// Return dates as ISO strings, not Date objects
types.setTypeParser(1082, (val: string) => val);           // date
types.setTypeParser(1114, (val: string) => val);           // timestamp
types.setTypeParser(1184, (val: string) => val);           // timestamptz

// Return numeric/bigint as JS numbers (pg defaults to strings for these)
types.setTypeParser(20, (val: string) => Number(val));     // int8 / bigint
types.setTypeParser(1700, (val: string) => Number(val));   // numeric / decimal

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
