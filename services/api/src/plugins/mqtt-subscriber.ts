/**
 * Plugin Fastify — abonnement aux topics MQTT publiés par les distributeurs.
 *
 * Au boot, on se connecte au broker (EMQX Cloud en prod, mosquitto local en
 * dev) et on s'abonne à :
 *
 *   - sportlocker/+/event      events signés HMAC (door_unlocked, …)
 *   - sportlocker/+/heartbeat  télémétrie (cpu/mem/uptime)
 *   - sportlocker/+/status     online/offline retained + LWT
 *
 * Chaque message est routé vers [[mqtt-events]] qui s'occupe de la
 * vérification HMAC, du parsing et des transitions DB.
 *
 * Resilience :
 *   - `mqtt.connect` retente automatiquement (reconnectPeriod). On ne bloque
 *     pas le boot Fastify si le broker est down.
 *   - Tous les handlers swallow leurs erreurs (loguées) pour qu'une exception
 *     sur un message ne tue pas la session MQTT pour les suivants.
 *   - `onClose` propre : on attend la flush, sinon paho peut perdre des QoS=1
 *     en cours d'ack au moment du SIGTERM.
 *
 * Désactivable via `MQTT_SUBSCRIBER_ENABLED=false` (utile en tests + en
 * dev quand on ne veut pas connecter au broker prod).
 */
import { readFileSync } from 'node:fs'
import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import mqtt, { type IClientOptions, type MqttClient } from 'mqtt'

import { env } from '../config/env.js'
import { db } from '../db/client.js'
import { dispatchMqttMessage } from '../lib/mqtt-events.js'

const TOPICS = [
  'sportlocker/+/event',
  'sportlocker/+/heartbeat',
  'sportlocker/+/status',
] as const

function shouldEnable(): boolean {
  if (env.MQTT_SUBSCRIBER_ENABLED !== undefined) return env.MQTT_SUBSCRIBER_ENABLED
  return env.NODE_ENV !== 'test'
}

/**
 * Détecte si une URL `mqtt://` ou `mqtts://` désigne du TLS.
 *
 * Aligné sur l'équivalent Python côté firmware (`_parse_mqtt_url`) : seul
 * le scheme `mqtts://` (case-insensitive) active TLS, indépendamment du port.
 */
export function parseMqttScheme(url: string): { tls: boolean } {
  const idx = url.indexOf('://')
  if (idx < 0) return { tls: false }
  return { tls: url.slice(0, idx).toLowerCase() === 'mqtts' }
}

/**
 * Construit les options `mqtt.connect` à partir de la config. Pure et testable.
 *
 * - En `mqtt://` (clair), retourne juste username/password. `ca` n'est pas
 *   passé — mqtt.js démarre une socket TCP non-chiffrée.
 * - En `mqtts://`, charge le PEM depuis `caCertPath` et le passe à mqtt.js
 *   via l'option `ca`. Si `caCertPath` manque, throw : on refuse de monter
 *   une socket TLS sans validation du serveur (un MITM pourrait sinon forger
 *   des events injectés en DB côté API).
 */
export function buildMqttOptions(opts: {
  url: string
  username?: string | undefined
  password?: string | undefined
  caCertPath?: string | undefined
  clientId: string
  readFile?: ((path: string) => Buffer) | undefined
}): IClientOptions {
  const { url, username, password, caCertPath, clientId } = opts
  const readFile = opts.readFile ?? readFileSync
  const { tls } = parseMqttScheme(url)

  const base: IClientOptions = {
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
    clientId,
    clean: true,
    reconnectPeriod: 5_000,
    connectTimeout: 10_000,
  }

  if (!tls) return base
  if (!caCertPath) {
    throw new Error(
      'mqtts:// requires MQTT_CA_CERT_PATH to validate broker cert',
    )
  }
  return { ...base, ca: readFile(caCertPath) }
}

export const mqttSubscriberPlugin = fp(async function mqttSubscriberPlugin(app: FastifyInstance) {
  if (!shouldEnable()) {
    app.log.info('mqtt_subscriber_disabled')
    return
  }

  const options = buildMqttOptions({
    url: env.MQTT_URL,
    username: env.MQTT_USERNAME,
    password: env.MQTT_PASSWORD,
    caCertPath: env.MQTT_CA_CERT_PATH,
    clientId: `sportlocker-api-${process.pid}-${Date.now()}`,
  })
  const client: MqttClient = mqtt.connect(env.MQTT_URL, options)

  client.on('connect', () => {
    app.log.info({ url: env.MQTT_URL }, 'mqtt_subscriber_connected')
    client.subscribe(TOPICS as unknown as string[], { qos: 1 }, (err, granted) => {
      if (err) {
        app.log.error({ err }, 'mqtt_subscribe_failed')
        return
      }
      app.log.info({ granted }, 'mqtt_subscribed')
    })
  })

  client.on('reconnect', () => app.log.warn('mqtt_subscriber_reconnecting'))
  client.on('error', (err) => app.log.error({ err }, 'mqtt_subscriber_error'))
  client.on('close', () => app.log.info('mqtt_subscriber_closed'))

  client.on('message', (topic, raw) => {
    let payload: unknown
    try {
      payload = JSON.parse(raw.toString('utf-8'))
    } catch {
      app.log.warn({ topic }, 'mqtt_message_bad_json')
      return
    }
    dispatchMqttMessage(topic, payload, { db, log: app.log }).catch((err) => {
      app.log.error({ err, topic }, 'mqtt_dispatch_unexpected_error')
    })
  })

  app.addHook('onClose', async () => {
    await new Promise<void>((resolve) => {
      client.end(false, undefined, () => resolve())
    })
  })

  app.decorate('mqttSubscriber', client)
}, { name: 'mqtt-subscriber' })

declare module 'fastify' {
  interface FastifyInstance {
    mqttSubscriber?: MqttClient
  }
}
