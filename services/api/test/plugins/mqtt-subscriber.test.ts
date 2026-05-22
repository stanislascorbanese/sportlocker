/**
 * Tests unitaires des helpers purs du plugin mqtt-subscriber.
 *
 * On teste séparément `parseMqttScheme` (détection TLS d'après l'URL) et
 * `buildMqttOptions` (construction des options `mqtt.connect`, dont la
 * charge du CA cert en mode TLS). Le plugin Fastify lui-même n'est pas
 * monté ici — il dépend du broker live, on le couvre via les tests E2E
 * firmware-sim (cf. `scripts/e2e-firmware-sim.sh`).
 *
 * Le but : garantir qu'on n'accepte JAMAIS de `mqtts://` sans CA cert
 * vérifiable. Sans cette garde, l'API ouvrirait une socket TLS sans
 * valider le serveur — un MITM sur le canal broker pourrait alors
 * injecter des events forgés (door_unlocked, returned…) directement en DB.
 */
import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(() => {
  // env.ts charge zod au premier import — il faut lui fournir les requis
  // avant que `buildMqttOptions` (qui n'utilise pas env, mais le module
  // l'importe en transitivité) ne soit évalué.
  process.env.NODE_ENV = 'test'
  process.env.JWT_SESSION_SECRET = 'a'.repeat(64)
  process.env.JWT_DEVICE_SECRET = 'b'.repeat(40)
  process.env.DATABASE_URL = 'postgres://noop:noop@127.0.0.1:1/noop'
})

describe('parseMqttScheme', () => {
  it('détecte mqtt:// comme non-TLS', async () => {
    const { parseMqttScheme } = await import('../../src/plugins/mqtt-subscriber.js')
    expect(parseMqttScheme('mqtt://localhost:1883')).toEqual({ tls: false })
  })

  it('détecte mqtts:// comme TLS', async () => {
    const { parseMqttScheme } = await import('../../src/plugins/mqtt-subscriber.js')
    expect(parseMqttScheme('mqtts://cluster.emqxsl.com:8883')).toEqual({ tls: true })
  })

  it('est case-insensitive sur le scheme', async () => {
    const { parseMqttScheme } = await import('../../src/plugins/mqtt-subscriber.js')
    expect(parseMqttScheme('MQTTS://cluster.emqxsl.com')).toEqual({ tls: true })
  })

  it('retourne tls:false quand pas de scheme', async () => {
    const { parseMqttScheme } = await import('../../src/plugins/mqtt-subscriber.js')
    expect(parseMqttScheme('broker.local:1883')).toEqual({ tls: false })
  })
})

describe('buildMqttOptions', () => {
  const baseArgs = {
    username: 'sportlocker',
    password: 'secret',
    clientId: 'sportlocker-api-test',
  }

  it('ne charge pas le CA en mqtt:// clair', async () => {
    const { buildMqttOptions } = await import('../../src/plugins/mqtt-subscriber.js')
    let readCalled = false
    const opts = buildMqttOptions({
      ...baseArgs,
      url: 'mqtt://localhost:1883',
      caCertPath: '/some/path/ca.crt', // ignoré en clair
      readFile: () => {
        readCalled = true
        return Buffer.from('SHOULD NOT BE READ')
      },
    })
    expect(readCalled).toBe(false)
    expect(opts).not.toHaveProperty('ca')
    expect(opts.username).toBe('sportlocker')
    expect(opts.password).toBe('secret')
    expect(opts.clientId).toBe('sportlocker-api-test')
  })

  it('charge le CA depuis caCertPath en mqtts://', async () => {
    const { buildMqttOptions } = await import('../../src/plugins/mqtt-subscriber.js')
    const fakePem = Buffer.from('-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----')
    let readPath: string | null = null
    const opts = buildMqttOptions({
      ...baseArgs,
      url: 'mqtts://cluster.emqxsl.com:8883',
      caCertPath: '/etc/sportlocker/emqxsl-ca.crt',
      readFile: (p) => {
        readPath = p
        return fakePem
      },
    })
    expect(readPath).toBe('/etc/sportlocker/emqxsl-ca.crt')
    expect(opts.ca).toBe(fakePem)
  })

  it('throw quand mqtts:// sans caCertPath — pas de fallback insecure', async () => {
    const { buildMqttOptions } = await import('../../src/plugins/mqtt-subscriber.js')
    expect(() =>
      buildMqttOptions({
        ...baseArgs,
        url: 'mqtts://cluster.emqxsl.com:8883',
        // caCertPath manquant volontairement
      }),
    ).toThrowError(/MQTT_CA_CERT_PATH/)
  })

  it('omet username/password quand ils ne sont pas fournis', async () => {
    const { buildMqttOptions } = await import('../../src/plugins/mqtt-subscriber.js')
    const opts = buildMqttOptions({
      url: 'mqtt://localhost:1883',
      clientId: 'sportlocker-api-test',
    })
    expect(opts).not.toHaveProperty('username')
    expect(opts).not.toHaveProperty('password')
  })

  it('garde les defaults de reconnect et timeout', async () => {
    const { buildMqttOptions } = await import('../../src/plugins/mqtt-subscriber.js')
    const opts = buildMqttOptions({
      url: 'mqtt://localhost:1883',
      clientId: 'sportlocker-api-test',
    })
    expect(opts.clean).toBe(true)
    expect(opts.reconnectPeriod).toBe(5_000)
    expect(opts.connectTimeout).toBe(10_000)
  })
})
