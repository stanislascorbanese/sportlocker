import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  out: '../../database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://sportlocker:sportlocker@localhost:5432/sportlocker',
  },
  strict: true,
  verbose: true,
} satisfies Config
