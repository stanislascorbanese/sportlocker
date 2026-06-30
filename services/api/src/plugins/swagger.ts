import fp from 'fastify-plugin'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { jsonSchemaTransform } from 'fastify-type-provider-zod'

/**
 * Lit la version du package.json à la racine du service. Évite de hardcoder une
 * version en deux endroits (package.json + plugin) qui finiraient par diverger.
 *
 * Le fichier compilé peut atterrir dans `dist/plugins/swagger.js` ou
 * `src/plugins/swagger.ts` selon build vs dev — on remonte jusqu'au premier
 * package.json trouvé.
 */
function readApiVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    // src/plugins → ../../package.json  |  dist/plugins → ../../package.json
    const pkgPath = join(here, '..', '..', 'package.json')
    const raw = readFileSync(pkgPath, 'utf8')
    const parsed = JSON.parse(raw) as { version?: string }
    return parsed.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

const API_DESCRIPTION = `
SportLocker — API REST pour distributeurs IoT de prêt de matériel sportif en libre-service.

## Usage

L'API expose 3 grandes familles de routes :

- **Citoyens** (\`/v1/distributors\`, \`/v1/item-types\`, \`/v1/reservations\`) : pour l'app mobile.
  Auth via JWT de session SportLocker (échangé contre un Firebase ID token sur \`POST /v1/auth/register\`).
- **Admin** (\`/v1/admin/*\`) : pour le dashboard opérateur. Auth via JWT de session admin
  (échangé contre un Firebase ID token sur \`POST /v1/admin/auth/login\`).
- **Public** (\`/health\`, \`/v1/distributors/nearby\`, \`/v1/item-types\`) : sans auth.

## Authentification

Toutes les routes protégées attendent un header :

\`\`\`
Authorization: Bearer <sessionToken>
\`\`\`

Le \`sessionToken\` est un JWT HS256 signé par l'API (\`JWT_SESSION_SECRET\`), TTL 7 jours.

## Scopes & rôles

| Rôle          | Accès                                                                    |
| ------------- | ------------------------------------------------------------------------ |
| \`citizen\`     | App mobile uniquement (réservations, retour, prolongation)               |
| \`admin\`       | Dashboard tenant — scopé à sa \`communeId\`                                |
| \`super_admin\` | Équipe SportLocker — bypass scoping multi-tenant, accès cross-commune    |
| \`operator\`    | DEPRECATED — conservé pour compat enum Postgres                          |

## Conventions

- IDs : UUID v4
- Dates : ISO 8601 UTC (\`2026-05-19T14:30:00.000Z\`)
- Pagination : cursor opaque \`<iso8601>_<uuid>\` quand applicable
- Erreurs : \`{ "error": "code_snake_case" }\` + status HTTP standard
`.trim()

/**
 * Plugin Swagger / OpenAPI. Enregistre :
 *   - @fastify/swagger : génération de la spec depuis les schémas Zod (via
 *     jsonSchemaTransform — sinon les schemas ne sont pas convertis).
 *   - @fastify/swagger-ui : UI interactive sur /docs (publique, pas d'auth).
 *
 * La route /docs DOIT rester accessible sans token pour être browseable.
 * On expose aussi /docs/json pour récupérer la spec brute (utile pour
 * générer un SDK client typé).
 */
export const swaggerPlugin = fp(async (app) => {
  const version = readApiVersion()

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'SportLocker API',
        description: API_DESCRIPTION,
        version,
        contact: {
          name: 'Équipe SportLocker',
          email: 'tech@sportlocker.fr',
          url: 'https://sportlocker.fr',
        },
        license: {
          name: 'Propriétaire — SportLocker SAS',
        },
      },
      servers: [
        { url: 'http://localhost:3000', description: 'Développement local' },
        { url: 'https://api.sportlocker.fr', description: 'Production' },
      ],
      tags: [
        { name: 'Health', description: 'Probes liveness / readiness pour l\'orchestrateur' },
        { name: 'Citoyens — Auth', description: 'Inscription / session citoyen (échange Firebase ID token)' },
        { name: 'Citoyens — Distributeurs', description: 'Recherche distributeurs (carte mobile, public)' },
        { name: 'Citoyens — Item types', description: 'Catalogue des types d\'objets empruntables (public)' },
        { name: 'Citoyens — Réservations', description: 'Réserver, retourner, prolonger un emprunt (auth citizen)' },
        { name: 'Auth admin', description: 'Login dashboard + flow invite multi-tenant' },
        { name: 'Admin — Réservations', description: 'Supervision et force-cancel des réservations' },
        { name: 'Admin — Maintenance', description: 'Tickets de maintenance distributeurs' },
        { name: 'Admin — Communes', description: 'CRUD tenants (super_admin pour create)' },
        { name: 'Admin — Utilisateurs', description: 'Gestion des comptes (ban, role, RGPD)' },
        { name: 'Admin — Stats', description: 'KPIs dashboard (séries journalières, top distributeurs, heatmap)' },
        { name: 'Admin — Invites', description: 'Génération + acceptation d\'invitations admin tenant' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description:
              'JWT de session SportLocker (HS256, TTL 7 jours). Obtenu via POST /v1/auth/register '
              + '(citoyen) ou POST /v1/admin/auth/login (admin). À passer en `Authorization: Bearer <token>`.',
          },
        },
      },
    },
    // Transform Zod → JSON Schema. Sans ça, les schemas ne sont pas convertis
    // et l'UI affiche `body: {}` pour toutes les routes.
    transform: jsonSchemaTransform,
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      displayRequestDuration: true,
      filter: true,
      persistAuthorization: true,
      tryItOutEnabled: true,
    },
    staticCSP: false,
    // Header / title / CSS custom pour respecter la marque (emerald-400 = #34d399).
    theme: {
      title: 'SportLocker API · documentation',
      css: [
        {
          filename: 'sportlocker-theme.css',
          content: `
            .swagger-ui .topbar { background-color: #052e16; }
            .swagger-ui .topbar .download-url-wrapper input[type=text] { border-color: #34d399; }
            .swagger-ui .info .title { color: #064e3b; }
            .swagger-ui .info .title small.version-stamp { background-color: #10b981; }
            .swagger-ui .scheme-container { background: #ecfdf5; box-shadow: none; border-bottom: 1px solid #d1fae5; }
            .swagger-ui .btn.authorize { background-color: #10b981; border-color: #10b981; color: #fff; }
            .swagger-ui .btn.authorize svg { fill: #fff; }
            .swagger-ui .opblock.opblock-post { border-color: #10b981; background: rgba(16,185,129,.06); }
            .swagger-ui .opblock.opblock-post .opblock-summary-method { background-color: #10b981; }
            .swagger-ui .opblock-tag { color: #064e3b; }
          `,
        },
      ],
    },
  })
})
