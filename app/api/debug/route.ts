import { NextResponse } from "next/server";
import { Pool } from "pg";

export async function GET() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  const info = {
    password_set: !!password,
    password_length: password?.length ?? 0,
    password_first3: password?.substring(0, 3) ?? "NOT SET",
    password_has_at: password?.includes("@") ?? false,
    node_env: process.env.NODE_ENV,
  };

  // Try to connect
  try {
    const pool = new Pool({
      host: "aws-1-us-east-2.pooler.supabase.com",
      port: 5432,
      database: "postgres",
      user: "postgres.sfecaatmpqppyoyaqksq",
      password: password!,
      ssl: { rejectUnauthorized: false },
      max: 1,
      connectionTimeoutMillis: 5000,
    });
    const { rows } = await pool.query("SELECT 1 as ok");
    await pool.end();
    return NextResponse.json({ ...info, db: "connected", rows });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ ...info, db: "failed", error: err.message });
  }
}
