// PostgreSQL connection pool + query helpers — ported from the Python HRMS_lite pattern.
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

export const schema = process.env.POSTGRES_SCHEMA || "sensiwise";

export const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  // Reference Python defaulted sslmode=require; mirror that (set POSTGRES_SSLMODE=disable for local PG).
  ssl: process.env.POSTGRES_SSLMODE === "disable" ? false : { rejectUnauthorized: false },
  max: 5,
  options: `-c search_path=${schema},public`,
});

export async function query(text, params) {
  const { rows } = await pool.query(text, params);
  return rows;
}

export async function queryOne(text, params) {
  const rows = await query(text, params);
  return rows[0] || null;
}
