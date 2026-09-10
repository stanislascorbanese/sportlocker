// Même raison que dans les scripts : drizzle-kit charge ce fichier hors de
// l'application, donc `.env` n'est pas lu tout seul. Sans cette ligne, la
// migration visait silencieusement l'URL de repli ci-dessous et échouait sur
// une base qui n'existe pas.
import 'dotenv/config'

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
