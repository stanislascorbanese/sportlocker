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

/**
 * Réduit une erreur MQTT à l'essentiel loggable : message + `code` CONNACK
 * éventuel (4 = bad username/password, 5 = not authorized, …). On jette la
 * stack : sur un échec d'auth récurrent, mqtt.js relance toutes les 5 s et la
 * stack (toujours les mêmes frames internes de la lib) ne fait qu'inonder les
 * logs sans rien apporter.
 */
export function summarizeMqttError(err: unknown): { msg: string; code?: number } {
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; code?: unknown }
    const msg = typeof e.message === 'string' ? e.message : String(err)
    return typeof e.code === 'number' ? { msg, code: e.code } : { msg }
  }
  return { msg: String(err) }
}

/**
 * Gate anti-spam pour les erreurs de (re)connexion répétées. Sur une erreur
 * persistante (ex. mauvaise creds), mqtt.js émet `error`+`close` toutes les
 * 5 s indéfiniment. On ne logge que la 1ʳᵉ occurrence d'une signature donnée,
 * puis une fois toutes les `everyN` (≈ 1×/min à 5 s de reconnect), tout en
 * laissant le client se reconnecter (auto-guérison si la cause disparaît, ex.
 * creds corrigée + restart). `reset()` (appelé sur `connect`) renvoie le
 * nombre d'occurrences accumulées, pour tracer une éventuelle reprise.
 */
export function createReconnectLogGate(everyN = 12): {
  shouldLog(signature: string): { log: boolean; occurrences: number }
  reset(): number
} {
  let count = 0
  let lastSig: string | undefined
  return {
    shouldLog(signature: string) {
      if (signature !== lastSig) {
        lastSig = signature
        count = 1
        return { log: true, occurrences: 1 }
      }
      count += 1
      return { log: count % everyN === 0, occurrences: count }
    },
    reset() {
      const acc = count
      count = 0
      lastSig = undefined
      return acc
    },
  }
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

  // Gate anti-spam : sur échec d'auth, mqtt.js relance toutes les 5 s. On
  // logge la 1ʳᵉ erreur d'une signature donnée puis ~1×/min, pas chaque cycle.
  const errorGate = createReconnectLogGate()

  client.on('connect', () => {
    const priorErrors = errorGate.reset()
    app.log.info(
      priorErrors > 0 ? { url: env.MQTT_URL, priorErrors } : { url: env.MQTT_URL },
      'mqtt_subscriber_connected',
    )
    client.subscribe(TOPICS as unknown as string[], { qos: 1 }, (err, granted) => {
      if (err) {
        app.log.error({ err: summarizeMqttError(err) }, 'mqtt_subscribe_failed')
        return
      }
      app.log.info({ granted }, 'mqtt_subscribed')
    })
  })

  // `reconnect`/`close` accompagnent chaque cycle d'erreur → debug pour ne pas
  // doubler le bruit ; le signal de fond est porté par `mqtt_subscriber_error`.
  client.on('reconnect', () => app.log.debug('mqtt_subscriber_reconnecting'))
  client.on('close', () => app.log.debug('mqtt_subscriber_closed'))
  client.on('error', (err) => {
    const { msg, code } = summarizeMqttError(err)
    const signature = code !== undefined ? `${code}:${msg}` : msg
    const { log, occurrences } = errorGate.shouldLog(signature)
    if (log) {
      app.log.error(
        code !== undefined ? { msg, code, occurrences } : { msg, occurrences },
        'mqtt_subscriber_error',
      )
    }
  })

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
