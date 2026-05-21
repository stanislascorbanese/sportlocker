/**
 * Schéma Drizzle ORM — miroir TypeScript du schéma SQL.
 *
 * Source de vérité : ../../../database/schema.sql
 * Toute modification ici DOIT être suivie de `pnpm db:generate` puis
 * d'une mise à jour manuelle de schema.sql pour rester cohérent.
 */
import {
  pgTable, pgEnum, uuid, varchar, text, integer, smallint, bigserial,
  boolean, timestamp, date, jsonb, numeric, doublePrecision, uniqueIndex, index,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

// ─── Enums ─────────────────────────────────────────────────────────────────

// citizen : utilisateur app mobile
// admin : responsable d'une commune (scoping commune_id obligatoire — cf. migration 0004)
// super_admin : équipe SportLocker (bypass scoping)
// operator : DEPRECATED (migration 0004) — conservé pour compat enum Postgres
export const userRole = pgEnum('user_role', ['citizen', 'operator', 'admin', 'super_admin'])
export const distributorStatus = pgEnum('distributor_status', [
  'online', 'offline', 'maintenance', 'decommissioned',
])
export const lockerState = pgEnum('locker_state', [
  'idle', 'reserved', 'active', 'returning', 'fault',
])
export const itemCondition = pgEnum('item_condition', [
  'new', 'good', 'worn', 'damaged', 'lost',
])
export const reservationStatus = pgEnum('reservation_status', [
  'scheduled', 'pending', 'active', 'returned', 'overdue', 'cancelled', 'expired',
])
export const lockerEventType = pgEnum('locker_event_type', [
  'reserved', 'opened', 'closed', 'returned',
  'expired', 'cancelled', 'fault', 'maintenance', 'extended',
])
export const maintenanceStatus = pgEnum('maintenance_status', [
  'open', 'in_progress', 'resolved', 'wontfix',
])
export const notificationChannel = pgEnum('notification_channel', ['push', 'email', 'sms'])

// ─── Tables ────────────────────────────────────────────────────────────────

export const communes = pgTable('communes', {
  id: uuid('id').primaryKey().defaultRandom(),
  inseeCode: varchar('insee_code', { length: 5 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  postalCode: varchar('postal_code', { length: 5 }).notNull(),
  department: varchar('department', { length: 3 }).notNull(),
  region: varchar('region', { length: 60 }).notNull(),
  population: integer('population'),
  contractStart: date('contract_start'),
  contractEnd: date('contract_end'),
  monthlyFeeCents: integer('monthly_fee_cents').notNull().default(0),
  contactEmail: varchar('contact_email', { length: 180 }),
  contactPhone: varchar('contact_phone', { length: 20 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  firebaseUid: varchar('firebase_uid', { length: 128 }).notNull().unique(),
  email: varchar('email', { length: 180 }).notNull().unique(),
  displayName: varchar('display_name', { length: 120 }),
  phone: varchar('phone', { length: 20 }),
  role: userRole('role').notNull().default('citizen'),
  communeId: uuid('commune_id').references(() => communes.id, { onDelete: 'set null' }),
  trustScore: smallint('trust_score').notNull().default(100),
  totalReservations: integer('total_reservations').notNull().default(0),
  isBanned: boolean('is_banned').notNull().default(false),
  bannedReason: text('banned_reason'),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
  gdprDeleteRequestedAt: timestamp('gdpr_delete_requested_at', { withTimezone: true }),
  gdprDeletedAt: timestamp('gdpr_deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byRole: index('idx_users_role').on(t.role),
  byCommune: index('idx_users_commune_id').on(t.communeId),
}))

export const adminInvites = pgTable('admin_invites', {
  token: text('token').primaryKey(),
  email: varchar('email', { length: 180 }).notNull(),
  communeId: uuid('commune_id').notNull().references(() => communes.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byEmail: index('idx_admin_invites_email').on(t.email),
  byCommune: index('idx_admin_invites_commune_id').on(t.communeId),
}))

export const distributors = pgTable('distributors', {
  id: uuid('id').primaryKey().defaultRandom(),
  serialNumber: varchar('serial_number', { length: 40 }).notNull().unique(),
  communeId: uuid('commune_id').notNull().references(() => communes.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 120 }).notNull(),
  // Postgres vanilla (sans PostGIS) → deux colonnes scalaires.
  // Voir migration 0003_distributors_latlng.sql.
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  addressLine: varchar('address_line', { length: 200 }),
  status: distributorStatus('status').notNull().default('offline'),
  firmwareVersion: varchar('firmware_version', { length: 20 }),
  balenaUuid: varchar('balena_uuid', { length: 64 }),
  installedAt: date('installed_at'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  lockerCount: smallint('locker_count').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byCommune: index('idx_distributors_commune').on(t.communeId),
  byStatus: index('idx_distributors_status').on(t.status),
}))

export const itemTypes = pgTable('item_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 60 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  category: varchar('category', { length: 40 }).notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  cautionCents: integer('caution_cents').notNull().default(0),
  maxDurationMinutes: integer('max_duration_minutes').notNull().default(240),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const lockers = pgTable('lockers', {
  id: uuid('id').primaryKey().defaultRandom(),
  distributorId: uuid('distributor_id').notNull().references(() => distributors.id, { onDelete: 'cascade' }),
  position: smallint('position').notNull(),
  state: lockerState('state').notNull().default('idle'),
  currentItemId: uuid('current_item_id'),
  rfidTag: varchar('rfid_tag', { length: 64 }),
  lastStateAt: timestamp('last_state_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uxPosition: uniqueIndex('lockers_distributor_position_uq').on(t.distributorId, t.position),
  byState: index('idx_lockers_state').on(t.state),
}))

export const items = pgTable('items', {
  id: uuid('id').primaryKey().defaultRandom(),
  itemTypeId: uuid('item_type_id').notNull().references(() => itemTypes.id, { onDelete: 'restrict' }),
  rfidTag: varchar('rfid_tag', { length: 64 }).notNull().unique(),
  currentLockerId: uuid('current_locker_id').references(() => lockers.id, { onDelete: 'set null' }),
  condition: itemCondition('condition').notNull().default('new'),
  totalLoans: integer('total_loans').notNull().default(0),
  lastInspectedAt: timestamp('last_inspected_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const tokenNonces = pgTable('token_nonces', {
  nonce: varchar('nonce', { length: 64 }).primaryKey(),
  reservationId: uuid('reservation_id').notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }).notNull().defaultNow(),
  distributorId: uuid('distributor_id').notNull().references(() => distributors.id, { onDelete: 'cascade' }),
})

export const reservations = pgTable('reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  lockerId: uuid('locker_id').notNull().references(() => lockers.id, { onDelete: 'restrict' }),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'restrict' }),
  distributorId: uuid('distributor_id').notNull().references(() => distributors.id, { onDelete: 'restrict' }),
  status: reservationStatus('status').notNull().default('scheduled'),
  qrJti: varchar('qr_jti', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }),
  returnedAt: timestamp('returned_at', { withTimezone: true }),
  returnLockerId: uuid('return_locker_id').references(() => lockers.id, { onDelete: 'set null' }),
  returnDistributorId: uuid('return_distributor_id').references(() => distributors.id, { onDelete: 'set null' }),
  cancellationReason: text('cancellation_reason'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  extensionCount: smallint('extension_count').notNull().default(0),
  // Modèle slots (migration 0008) — nullable pour les résas legacy.
  slotStartAt: timestamp('slot_start_at', { withTimezone: true }),
  slotEndAt: timestamp('slot_end_at', { withTimezone: true }),
  durationMinutes: integer('duration_minutes'),
  priceCents: integer('price_cents'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUser: index('idx_reservations_user').on(t.userId),
  byStatus: index('idx_reservations_status').on(t.status),
  byExpires: index('idx_reservations_expires').on(t.expiresAt),
  byDueAt: index('idx_reservations_due_at').on(t.dueAt),
  // ─── Index de perf ajoutés en 0006_performance_indexes.sql ───
  // L'ordre DESC réel est appliqué dans la migration SQL (CREATE INDEX ... DESC).
  // Drizzle 0.30 ne supporte pas l'ordre per-colonne, on déclare ici juste pour
  // que `drizzle-kit generate` ne propose pas de re-créer l'index manquant.
  // Pagination cursor admin (created_at DESC, id DESC tiebreaker).
  byCreatedId: index('idx_reservations_created_id').on(t.createdAt, t.id),
  // Listing admin filtré par status, tri created_at DESC.
  byStatusCreated: index('idx_reservations_status_created').on(t.status, t.createdAt),
  // Stats dashboard agrégats par distributeur sur fenêtre temporelle.
  byDistributorCreated: index('idx_reservations_distributor_created').on(t.distributorId, t.createdAt),
  // Check overlap de slot par item pour dispo (migration 0008, index PARTIAL
  // côté SQL — WHERE status IN ('scheduled','pending','active')). Drizzle 0.30
  // n'exprime pas le partial, on déclare ici pour le tracking.
  byItemSlot: index('idx_reservations_item_slot').on(t.itemId, t.slotStartAt, t.slotEndAt),
  // NB : index UNIQUE PARTIAL idx_reservations_one_live_per_user (migration 0008,
  // remplace 0005) non déclaré ici — même convention que l'ancien
  // idx_reservations_one_active_per_user, partial unique non supporté par Drizzle 0.30.
}))

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  reservationId: uuid('reservation_id').notNull().unique().references(() => reservations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  rating: smallint('rating').notNull(),
  comment: text('comment'),
  reportedIssue: boolean('reported_issue').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const lockerEvents = pgTable('locker_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  lockerId: uuid('locker_id').notNull().references(() => lockers.id, { onDelete: 'cascade' }),
  reservationId: uuid('reservation_id').references(() => reservations.id, { onDelete: 'set null' }),
  eventType: lockerEventType('event_type').notNull(),
  source: varchar('source', { length: 20 }).notNull(),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const distributorHeartbeats = pgTable('distributor_heartbeats', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  distributorId: uuid('distributor_id').notNull().references(() => distributors.id, { onDelete: 'cascade' }),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  rssiDbm: smallint('rssi_dbm'),
  uptimeSeconds: integer('uptime_seconds'),
  cpuTempC: numeric('cpu_temp_c', { precision: 4, scale: 1 }),
  freeMemMb: integer('free_mem_mb'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
})

export const maintenanceTickets = pgTable('maintenance_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  distributorId: uuid('distributor_id').notNull().references(() => distributors.id, { onDelete: 'cascade' }),
  lockerId: uuid('locker_id').references(() => lockers.id, { onDelete: 'set null' }),
  itemId: uuid('item_id').references(() => items.id, { onDelete: 'set null' }),
  openedBy: uuid('opened_by').references(() => users.id, { onDelete: 'set null' }),
  assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  status: maintenanceStatus('status').notNull().default('open'),
  severity: smallint('severity').notNull().default(3),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  resolutionNote: text('resolution_note'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // ─── Index de perf ajoutés en 0006_performance_indexes.sql ───
  // L'ordre DESC est appliqué dans la migration SQL côté DDL.
  // Listing admin (ORDER BY severity DESC, created_at DESC).
  bySeverityCreated: index('idx_maintenance_severity_created').on(t.severity, t.createdAt),
  // Listing filtré par status + tri (severity, created_at).
  byStatusSeverityCreated: index('idx_maintenance_status_severity_created')
    .on(t.status, t.severity, t.createdAt),
}))

export const pushTokens = pgTable('push_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expoToken: varchar('expo_token', { length: 200 }).notNull().unique(),
  deviceInfo: jsonb('device_info').notNull().default(sql`'{}'::jsonb`),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const pricingRules = pgTable('pricing_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  communeId: uuid('commune_id').notNull().references(() => communes.id, { onDelete: 'cascade' }),
  itemTypeId: uuid('item_type_id').notNull().references(() => itemTypes.id, { onDelete: 'cascade' }),
  durationMinutes: integer('duration_minutes').notNull(),
  priceCents: integer('price_cents').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byCommune: index('idx_pricing_rules_commune').on(t.communeId),
  byItemType: index('idx_pricing_rules_item_type').on(t.itemTypeId),
  unqTriplet: uniqueIndex('pricing_rules_commune_item_type_duration_uq')
    .on(t.communeId, t.itemTypeId, t.durationMinutes),
}))

export const notificationLogs = pgTable('notification_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  channel: notificationChannel('channel').notNull(),
  template: varchar('template', { length: 60 }).notNull(),
  payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Relations ─────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  commune: one(communes, { fields: [users.communeId], references: [communes.id] }),
  reservations: many(reservations),
}))

export const adminInvitesRelations = relations(adminInvites, ({ one }) => ({
  commune: one(communes, { fields: [adminInvites.communeId], references: [communes.id] }),
}))

export const distributorsRelations = relations(distributors, ({ one, many }) => ({
  commune: one(communes, { fields: [distributors.communeId], references: [communes.id] }),
  lockers: many(lockers),
}))

export const lockersRelations = relations(lockers, ({ one, many }) => ({
  distributor: one(distributors, { fields: [lockers.distributorId], references: [distributors.id] }),
  currentItem: one(items, { fields: [lockers.currentItemId], references: [items.id] }),
  events: many(lockerEvents),
}))

export const reservationsRelations = relations(reservations, ({ one }) => ({
  user: one(users, { fields: [reservations.userId], references: [users.id] }),
  locker: one(lockers, { fields: [reservations.lockerId], references: [lockers.id] }),
  item: one(items, { fields: [reservations.itemId], references: [items.id] }),
  distributor: one(distributors, { fields: [reservations.distributorId], references: [distributors.id] }),
}))
