import { describe, expect, it } from 'vitest'
import { emptyNpcRomance, type NpcRomanceMap } from '@shared/npcRomance'
import {
  emptyNpcGossip,
  pickGossipTopic,
  unknownNameIn,
  withGossip,
  type GossipPost,
  type GossipTopicInput
} from '@shared/npcRomanceGossip'

/**
 * The slot's gossip is picked at the ending and banked with its opening, and what it counts for —
 * a drift's sign, a crush found out, a lover no longer owed a post — is folded into the save at
 * the boundary; a wrong pick, a sign counted twice or for a post that never came, silently moves
 * a lover towards leaving or reveals a crush.
 */

const DAY = 30

function map(over: Partial<NpcRomanceMap>): NpcRomanceMap {
  return { ...emptyNpcRomance(), ...over }
}

function input(over: Partial<GossipTopicInput>): GossipTopicInput {
  return {
    romance: emptyNpcRomance(),
    owed: [],
    date: DAY,
    nameKnown: () => true,
    rand: () => 0,
    ...over
  }
}

/** A drift on its fifth day, still short of signs. */
const DRIFTING = { l: { to: 's', since: DAY - 4, signs: 1, lastSign: DAY - 3 } }
/** A crush held a week. */
const CRUSHING = { c: { to: 'd', since: DAY - 7 } }

const POST: GossipPost = {
  id: `gossip:${DAY}:0`,
  handle: 'someone',
  emoji: '🙂',
  text: 'heard something',
  likes: 3,
  date: DAY,
  time: 0
}

describe('pickGossipTopic', () => {
  it('puts a lover owed a post before a drift and a crush', () => {
    const romance = map({ drifts: DRIFTING, crushes: CRUSHING })
    expect(pickGossipTopic(input({ romance, owed: ['l2'] }))).toEqual({ kind: 'single', lover: 'l2' })
  })

  it('puts a drift before a crush', () => {
    const romance = map({ drifts: DRIFTING, crushes: CRUSHING })
    expect(pickGossipTopic(input({ romance }))).toEqual({ kind: 'drift', lover: 'l', suitor: 's' })
  })

  it('gossips about a drift only from its fifth day, short of signs and with none today', () => {
    const at = (drift: { since: number; signs: number; lastSign?: number }) =>
      pickGossipTopic(input({ romance: map({ drifts: { l: { to: 's', ...drift } } }) }))
    expect(at({ since: DAY - 3, signs: 0 })).toBeNull()
    expect(at({ since: DAY - 4, signs: 0 })).not.toBeNull()
    expect(at({ since: DAY - 8, signs: 2 })).toBeNull()
    expect(at({ since: DAY - 8, signs: 1, lastSign: DAY })).toBeNull()
  })

  it('leaks a crush held a week at the odds, with both names known', () => {
    const romance = map({ crushes: CRUSHING })
    expect(pickGossipTopic(input({ romance, rand: () => 0.14 }))).toEqual({
      kind: 'crush',
      from: 'c',
      to: 'd'
    })
    expect(pickGossipTopic(input({ romance, rand: () => 0.15 }))).toBeNull()
    expect(pickGossipTopic(input({ romance: map({ crushes: { c: { to: 'd', since: DAY - 6 } } }) }))).toBeNull()
    expect(pickGossipTopic(input({ romance, nameKnown: (id) => id !== 'd' }))).toBeNull()
    expect(
      pickGossipTopic(input({ romance: map({ crushes: CRUSHING, discovered: { c: { to: 'd', date: 1 } } }) }))
    ).toBeNull()
  })

  it('leaks a forced crush whatever its age and the odds, the names still needed', () => {
    const romance = map({ crushes: { c: { to: 'd', since: DAY } } })
    expect(pickGossipTopic(input({ romance, forcedLeak: 'c', rand: () => 0.99 }))).toEqual({
      kind: 'crush',
      from: 'c',
      to: 'd'
    })
    expect(pickGossipTopic(input({ romance, forcedLeak: 'c', nameKnown: (id) => id !== 'c' }))).toBeNull()
  })
})

describe('withGossip', () => {
  it('owes a post for a lover left in silence until one comes back', () => {
    const topic = { kind: 'single' as const, lover: 'l' }
    const unwritten = withGossip(emptyNpcRomance(), emptyNpcGossip(), { silent: ['l'], topic }, DAY)
    expect(unwritten.gossip).toEqual({ posts: [], owed: ['l'] })
    const written = withGossip(emptyNpcRomance(), unwritten.gossip, { silent: [], topic, post: POST }, DAY)
    expect(written.gossip).toEqual({ posts: [POST] })
  })

  it('counts a drift sign dated today once, and none for a post that never came', () => {
    const romance = map({ drifts: { l: { to: 's', since: DAY - 5, signs: 1, lastSign: DAY - 2 } } })
    const topic = { kind: 'drift' as const, lover: 'l', suitor: 's' }
    const once = withGossip(romance, emptyNpcGossip(), { silent: [], topic, post: POST }, DAY)
    expect(once.romance.drifts?.l).toEqual({ to: 's', since: DAY - 5, signs: 2, lastSign: DAY })
    expect(withGossip(romance, emptyNpcGossip(), { silent: [], topic }, DAY).romance).toBe(romance)
    const signedToday = map({ drifts: { l: { to: 's', since: DAY - 5, signs: 1, lastSign: DAY } } })
    expect(
      withGossip(signedToday, emptyNpcGossip(), { silent: [], topic, post: POST }, DAY).romance.drifts?.l.signs
    ).toBe(1)
  })

  it('marks a leaked crush found out only while it still stands', () => {
    const topic = { kind: 'crush' as const, from: 'c', to: 'd' }
    const out = withGossip(map({ crushes: CRUSHING }), emptyNpcGossip(), { silent: [], topic, post: POST }, DAY)
    expect(out.romance.discovered).toEqual({ c: { to: 'd', date: DAY } })
    const gone = map({ crushes: { c: { to: 'x', since: 1 } } })
    expect(withGossip(gone, emptyNpcGossip(), { silent: [], topic, post: POST }, DAY).romance).toBe(gone)
  })

  it('lands the same however often the boundary replays', () => {
    const romance = map({ crushes: CRUSHING, drifts: DRIFTING })
    const delivery = { silent: ['l2'], topic: { kind: 'crush' as const, from: 'c', to: 'd' }, post: POST }
    const once = withGossip(romance, emptyNpcGossip(), delivery, DAY)
    expect(withGossip(once.romance, once.gossip, delivery, DAY)).toEqual(once)
  })
})

describe('unknownNameIn', () => {
  const roster = [
    { firstName: 'Chloe', lastName: 'Park', known: true },
    { firstName: 'Julian', lastName: 'Ashford', known: false },
    { firstName: 'May', lastName: 'Park', known: false }
  ]

  it('catches an unknown name as a whole word, in any case', () => {
    expect(unknownNameIn("omg julian's been staring at chloe all week", roster)).toBe(true)
    expect(unknownNameIn('chloe and some guy were SO cozy', roster)).toBe(false)
  })

  it('ignores a name inside another word and one a known character also carries', () => {
    expect(unknownNameIn('maybe chloe park is single now', roster)).toBe(false)
  })
})
