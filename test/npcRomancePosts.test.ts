import { describe, expect, it } from 'vitest'
import { pairKeyOf } from '@shared/npcRelationships'
import { emptyNpcRomance, type NpcRomanceMap } from '@shared/npcRomance'
import {
  guaranteedPostersOf,
  withDriftPostSigns,
  type GuaranteedPostersInput
} from '@shared/npcRomancePosts'

/**
 * Who posts for sure after a couple forms or ends or a drift opens is banked with the slot's
 * opening, and a drift's hint post counts a sign into the save at the boundary; a wrong pick or a
 * sign counted twice, or for a post that never came, silently moves a lover towards leaving.
 */

const DAY = 30

function map(over: Partial<NpcRomanceMap>): NpcRomanceMap {
  return { ...emptyNpcRomance(), ...over }
}

function input(over: Partial<GuaranteedPostersInput>): GuaranteedPostersInput {
  return {
    before: emptyNpcRomance(),
    after: emptyNpcRomance(),
    visible: () => false,
    date: DAY,
    time: 1,
    ...over
  }
}

const COUPLE = pairKeyOf('a', 'b')

describe('guaranteedPostersOf', () => {
  it('has one of a new couple post about it, the one the reader can see first', () => {
    const out = guaranteedPostersOf(
      input({ after: map({ couples: { [COUPLE]: { since: DAY } } }), visible: (id) => id === 'b' })
    )
    expect(out.posters).toEqual([{ charId: 'b', news: [{ kind: 'together', with: 'a' }] }])
    expect(out.driftPosts).toEqual([])
  })

  it('has one of a couple that broke up post about it', () => {
    const out = guaranteedPostersOf(
      input({
        before: map({ couples: { [COUPLE]: { since: 1 } } }),
        after: map({ exes: { [COUPLE]: { since: 1, ended: DAY } } }),
        visible: (id) => id === 'a'
      })
    )
    expect(out.posters).toEqual([{ charId: 'a', news: [{ kind: 'broke_up', with: 'b' }] }])
  })

  it('has nobody post when the couple ended because the reader started dating one of them', () => {
    const out = guaranteedPostersOf(
      input({
        before: map({ couples: { [COUPLE]: { since: 1 } } }),
        after: map({ exes: { [COUPLE]: { since: 1, ended: DAY, displaced: 'a' } } }),
        visible: () => true
      })
    )
    expect(out.posters).toEqual([])
  })

  it('tells nothing of a couple that stood before and after', () => {
    const couples = { [COUPLE]: { since: 1 } }
    const out = guaranteedPostersOf(input({ before: map({ couples }), after: map({ couples }) }))
    expect(out.posters).toEqual([])
  })

  it('picks between two equally visible partners the same way for the same slot', () => {
    const after = map({ couples: { [COUPLE]: { since: DAY } } })
    for (const visible of [() => true, () => false]) {
      const once = guaranteedPostersOf(input({ after, visible }))
      const again = guaranteedPostersOf(input({ after, visible }))
      expect(once.posters).toHaveLength(1)
      expect(again).toEqual(once)
    }
  })

  it('has a lover whose posts the reader sees write the hint of a drift that opened', () => {
    const out = guaranteedPostersOf(
      input({
        after: map({ drifts: { l: { to: 's', since: DAY, signs: 0 } } }),
        visible: (id) => id === 'l'
      })
    )
    expect(out.posters).toEqual([{ charId: 'l', news: [], driftHint: 'lover' }])
    expect(out.driftPosts).toEqual([{ poster: 'l', lover: 'l', suitor: 's' }])
  })

  it('has the one she is drawn to write it when the reader cannot see her posts', () => {
    const out = guaranteedPostersOf(
      input({ after: map({ drifts: { l: { to: 's', since: DAY, signs: 0 } } }) })
    )
    expect(out.posters).toEqual([{ charId: 's', news: [], driftHint: 'suitor' }])
    expect(out.driftPosts).toEqual([{ poster: 's', lover: 'l', suitor: 's' }])
  })

  it('writes no hint for a drift already standing', () => {
    const drifts = { l: { to: 's', since: DAY - 3, signs: 1 } }
    const out = guaranteedPostersOf(
      input({ before: map({ drifts }), after: map({ drifts }), visible: () => true })
    )
    expect(out.posters).toEqual([])
    expect(out.driftPosts).toEqual([])
  })
})

describe('withDriftPostSigns', () => {
  const POST = { poster: 'l', lover: 'l', suitor: 's' }
  const opened = map({ drifts: { l: { to: 's', since: DAY - 1, signs: 0 } } })

  it('counts a sign dated the day the hint was posted', () => {
    const out = withDriftPostSigns(opened, [POST], new Set(['l']), DAY)
    expect(out.drifts?.l).toEqual({ to: 's', since: DAY - 1, signs: 1, lastSign: DAY })
  })

  it('counts it once however often the boundary replays', () => {
    const once = withDriftPostSigns(opened, [POST], new Set(['l']), DAY)
    expect(withDriftPostSigns(once, [POST], new Set(['l']), DAY)).toEqual(once)
  })

  it('counts nothing on a day that already showed a sign', () => {
    const signed = map({ drifts: { l: { to: 's', since: DAY - 1, signs: 1, lastSign: DAY } } })
    expect(withDriftPostSigns(signed, [POST], new Set(['l']), DAY)).toBe(signed)
  })

  it('counts nothing when the post did not come back', () => {
    expect(withDriftPostSigns(opened, [POST], new Set(), DAY)).toBe(opened)
  })

  it('counts nothing for a drift that ended or moved to somebody else', () => {
    expect(withDriftPostSigns(emptyNpcRomance(), [POST], new Set(['l']), DAY).drifts).toBeUndefined()
    const moved = map({ drifts: { l: { to: 'x', since: DAY - 1, signs: 0 } } })
    expect(withDriftPostSigns(moved, [POST], new Set(['l']), DAY)).toBe(moved)
  })
})
