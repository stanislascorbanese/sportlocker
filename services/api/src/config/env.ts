import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  MQTT_URL: z.string().default('mqtt://localhost:1883'),
  MQTT_USERNAME: z.string().optional(),
  MQTT_PASSWORD: z.string().optional(),
  // Active le plugin mqtt-subscriber au boot. Désactivable pour les tests
  // d'intégration qui n'ont pas de broker, ou en local quand on veut couper
  // le bruit. Default `true` sauf `NODE_ENV=test`.
  MQTT_SUBSCRIBER_ENABLED: z
    .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true' || v === '1')),

  JWT_SESSION_SECRET: z.string().min(32),
  JWT_DEVICE_SECRET: z.string().min(32),

  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_KEY: z.string().optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  EXPO_ACCESS_TOKEN: z.string().optional(),

  // Web Push VAPID — clé de signature + identité du push agent.
  // Génération : `npx web-push generate-vapid-keys` puis copier les valeurs
  // dans les env Railway. Si absentes, l'API démarre quand même mais les
  // routes /v1/push-subscriptions renvoient 503 (pas d'envoi possible).
  // Subject : URL ou mailto: identifiant l'expéditeur des notifs (RFC 8292).
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:contact@sportlocker.fr'),

  // Base URL utilisée pour construire les inviteUrl envoyés aux admins tenant.
  // Ex : https://app.sportlocker.fr → inviteUrl = https://app.sportlocker.fr/accept-invite?token=...
  DASHBOARD_INVITE_BASE_URL: z.string().url().default('http://localhost:3001'),

  // Sentry — observability. Si SENTRY_DSN absent, le SDK reste no-op silencieux.
  // Plan free : 5k errors + 10k perf events/mois.
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
})

export type Env = z.infer<typeof EnvSchema>

const parsed = EnvSchema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

const env: Env = parsed.data

// Garde-fou : si on est en prod et que DASHBOARD_INVITE_BASE_URL pointe sur
// localhost, refuser le boot. Sinon les invitations envoyées aux mairies
// auront un lien `http://localhost:3001/accept-invite?...` injouable depuis
// leur navigateur — ce qui est exactement ce qui s'est passé avant ce fix.
//
// En dev/test on accepte localhost (c'est le cas nominal).
if (env.NODE_ENV === 'production') {
  const url = env.DASHBOARD_INVITE_BASE_URL
  if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('0.0.0.0')) {
    console.error(
      `[boot] DASHBOARD_INVITE_BASE_URL="${url}" est un loopback alors que NODE_ENV=production. ` +
      `Les invitations admin tenant généreront des liens injouables. ` +
      `Pose la vraie URL publique du dashboard (ex: https://app.sportlocker.fr) sur Railway → @sportlocker/api → Variables.`,
    )
    process.exit(1)
  }
}

export { env }
