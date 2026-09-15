/**
 * Ouverture de casier — le chemin que les tests d'intégration ne peuvent pas
 * prendre.
 *
 * Sans broker MQTT, `openLocker` considère l'ouverture faite : c'est ce qui
 * permet de tester tout le parcours vacancier sans borne. Le revers, c'est que
 * le cas qui compte vraiment en juillet — la porte qui ne s'ouvre pas — n'est
 * jamais exercé là-bas. Il l'est ici, avec un faux client MQTT.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// `src/config/env.ts` valide l'environnement à l'import et coupe le process
// s'il manque une variable. Le module est donc chargé après les avoir posées,
// d'où l'import dynamique plutôt que statique.
type Mod = typeof import('../../src/lib/locker-open.js')
let LockerStuckError: Mod['LockerStuckError']
let notifyDoorUnlocked: Mod['notifyDoorUnlocked']
let openLocker: Mod['openLocker']
let __resetWaiters: Mod['__resetWaiters']

beforeAll(async () => {
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL ??= 'postgres://unused@localhost:5432/unused'
  process.env.JWT_SESSION_SECRET ??= 'a'.repeat(64)
  process.env.JWT_DEVICE_SECRET ??= 'b'.repeat(64)
  process.env.LOG_LEVEL = 'fatal'
  ;({ LockerStuckError, notifyDoorUnlocked, openLocker, __resetWaiters } =
    await import('../../src/lib/locker-open.js'))
})

type PublishCb = (err?: Error | null) => void

/**
 * Client MQTT minimal : retient le dernier message publié.
 *
 * `neverAcks` imite le vrai comportement de mqtt.js quand le broker est
 * injoignable : en qos 1 le message part en file d'attente et le callback n'est
 * jamais appelé. C'est le cas qui manquait, et qui tuait le process.
 */
function fakeClient(opts: { failPublish?: boolean; neverAcks?: boolean } = {}) {
  const published: { topic: string; payload: string }[] = []
  return {
    published,
    publish(topic: string, payload: string, _o: unknown, cb: PublishCb) {
      published.push({ topic, payload })
      if (opts.neverAcks) return
      cb(opts.failPublish ? new Error('broker down') : null)
    },
  }
}

/** Le `jti` que l'API a mis dans le jeton — c'est lui que la borne renvoie. */
function jtiOf(payload: string): string {
  const token = JSON.parse(payload).token as string
  const claims = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString())
  return claims.jti as string
}

afterEach(() => {
  __resetWaiters()
  vi.useRealTimers()
})

describe('openLocker', () => {
  it('publie sur le topic de la borne et attend sa confirmation', async () => {
    const client = fakeClient()
    const promise = openLocker({
      client: client as never,
      distributorId: '11111111-1111-4111-8111-111111111111',
      lockerId: '22222222-2222-4222-8222-222222222222',
      openingId: '33333333-3333-4333-8333-333333333333',
      timeoutMs: 2_000,
    })

    // Laisse la signature du jeton se terminer avant de répondre à sa place.
    await vi.waitFor(() => expect(client.published).toHaveLength(1))
    expect(client.published[0]!.topic).toBe(
      'sportlocker/11111111-1111-4111-8111-111111111111/cmd/open',
    )

    expect(notifyDoorUnlocked(jtiOf(client.published[0]!.payload))).toBe(true)
    await expect(promise).resolves.toBeUndefined()
  })

  it('lève locker_stuck quand la borne ne confirme jamais', async () => {
    const client = fakeClient()
    await expect(
      openLocker({
        client: client as never,
        distributorId: '11111111-1111-4111-8111-111111111111',
        lockerId: '22222222-2222-4222-8222-222222222222',
        openingId: '33333333-3333-4333-8333-333333333333',
        timeoutMs: 50,
      }),
    ).rejects.toBeInstanceOf(LockerStuckError)
  })

  it('lève locker_stuck si la publication elle-même échoue', async () => {
    const client = fakeClient({ failPublish: true })
    await expect(
      openLocker({
        client: client as never,
        distributorId: '11111111-1111-4111-8111-111111111111',
        lockerId: '22222222-2222-4222-8222-222222222222',
        openingId: '33333333-3333-4333-8333-333333333333',
        timeoutMs: 5_000,
      }),
    ).rejects.toBeInstanceOf(LockerStuckError)
  })

  /**
   * Régression. Le broker injoignable n'accuse jamais la publication : l'attente
   * de cet accusé passait *avant* l'attente de la borne, si bien que le délai
   * de `confirmed` expirait sans personne pour attraper sa rejection — et une
   * rejection non gérée tue le process. Une seule borne muette faisait donc
   * tomber l'API de tous les campings.
   */
  it('lève locker_stuck, sans rejection non gérée, quand le broker n\'accuse jamais', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)

    try {
      const client = fakeClient({ neverAcks: true })
      await expect(
        openLocker({
          client: client as never,
          distributorId: '11111111-1111-4111-8111-111111111111',
          lockerId: '22222222-2222-4222-8222-222222222222',
          openingId: '33333333-3333-4333-8333-333333333333',
          timeoutMs: 50,
        }),
      ).rejects.toBeInstanceOf(LockerStuckError)

      // Laisse passer quelques tours de boucle : une rejection non gérée n'est
      // signalée qu'après le microtask qui aurait pu l'attraper.
      await new Promise((r) => setTimeout(r, 120))
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('considère l\'ouverture faite quand aucun broker n\'est branché', async () => {
    await expect(
      openLocker({
        client: null,
        distributorId: '11111111-1111-4111-8111-111111111111',
        lockerId: '22222222-2222-4222-8222-222222222222',
        openingId: '33333333-3333-4333-8333-333333333333',
      }),
    ).resolves.toBeUndefined()
  })

  it('ignore une confirmation que personne n\'attend', () => {
    expect(notifyDoorUnlocked('jti-inconnu')).toBe(false)
  })
})
