/**
 * Rôles utilisateur — source de vérité unique.
 *
 * Les listes de rôles étaient dupliquées en dur dans plusieurs routes
 * (`admin-users`, `admin-auth`, `admin-invites`, `live-tickets`), au risque de
 * diverger de l'enum PostgreSQL. Ici on dérive les schémas Zod directement de
 * l'enum Drizzle `user_role` (voir `db/schema.ts`) : ajouter/retirer un rôle en
 * base propage automatiquement partout.
 */
import { z } from 'zod'

import { userRole } from '../db/schema.js'

/** Tuple canonique des rôles, aligné sur l'enum PG `user_role`. */
export const USER_ROLES = userRole.enumValues
export type UserRole = (typeof USER_ROLES)[number]

/** Zod : n'importe quel rôle (`citizen` | `operator` | `admin` | `super_admin`). */
export const userRoleSchema = z.enum(USER_ROLES)

/** Zod : rôles du dashboard ops uniquement (`admin` | `super_admin`). */
export const adminRoleSchema = userRoleSchema.extract(['admin', 'super_admin'])
export type AdminRole = z.infer<typeof adminRoleSchema>
