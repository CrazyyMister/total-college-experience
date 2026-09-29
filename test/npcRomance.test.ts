import { describe, expect, it } from 'vitest'
import { pairKeyOf, type NpcEncounterGroup, type NpcRelationshipMap } from '@shared/npcRelationships'
import {
  BREAKUP_BELOW,
  DECLARE_AFTER_DAYS,
  MAX_COUPLES,
  REJECTION_AFFINITY_DROP,
  REJECTION_COOLDOWN_DAYS,
  directedKeyOf,
  emptyNpcRomance,
  settleNpcRomance,
  type NpcRomanceInput,
  type NpcRomanceMap
} from '@shared/npcRomance'
import type { Character } from '@shared/types'
import { character, charactersById } from './fixtures'

/**
 * Romance between roster characters is folded into the save at every boundary, so a rule that
 * slips — a second crush, a yes from the reader's lover, a rejection forgotten — is written
 * silently into every save after it. Every roll is pinned: `always` passes each one, `never`
 * fails each one.
 */

const always = (): number => 0
const never = (): number => 0.999

const man = (charId: string, over: Partial<Character> = {}): Character =>
  character({ charId, gender: 'man', attractedTo: 'woman', ...over })
const woman = (charId: string, over: Partial<Character> = {}): Character =>
  character({ charId, gender: 'woman', attractedTo: 'man', ...over })

const DAY = 30

/** Every listed pair at `affinity`, each stamped with a positive encounter today. */
function standing(affinity: number, ...pairs: [string, string][]): NpcRelationshipMap {
  const map: NpcRelationshipMap = {}
  for (const [a, b] of pairs) {
    map[pairKeyOf(a, b)] = {
      affinity,
      encounter: { date: DAY, kind: 'hangout', ref: 'cafe', positive: true }
    }
  }
  return map
}

/** One hangout holding everybody listed. */
function together(...members: string[]): NpcEncounterGroup[] {
  return [{ kind: 'hangout', ref: 'cafe', members }]
}

function input(over: Partial<NpcRomanceInput>): NpcRomanceInput {
  return {
    date: DAY,
    endsWeek: false,
    relationships: {},
    romance: emptyNpcRomance(),
    groups: [],
    cast: [],
    readerLovers: [],
    characters: {},
    ...over
  }
}

function romance(over: Partial<NpcRomanceMap>): NpcRomanceMap {
  return { ...emptyNpcRomance(), ...over }
}

describe('crushes follow attraction', () => {
  it('falls for the gender she is attracted to, and only that one', () => {
    const characters = charactersById(man('m'), woman('w'), woman('x'))
    const out = settleNpcRomance(
      input({
        characters,
        relationships: standing(5, ['m', 'w'], ['w', 'x'], ['m', 'x']),
        groups: together('m', 'w', 'x')
      }),
      always
    )
    // Both are free, so each of `m`, `w` and `x` falls for the first one they can.
    expect(out.romance.crushes.m?.to).toBeDefined()
    expect(characters[out.romance.crushes.m!.to].gender).toBe('woman')
    expect(out.romance.crushes.w?.to).toBe('m')
    expect(out.romance.crushes.x?.to).toBe('m')
  })

  it('never falls for somebody met in the scene, or somebody not met at all', () => {
    const out = settleNpcRomance(
      input({
        characters: charactersById(man('m'), woman('w')),
        relationships: standing(5, ['m', 'w']),
        groups: together('m', 'w'),
        cast: ['w']
      }),
      always
    )
    expect(out.romance.crushes).toEqual({})
    const apart = settleNpcRomance(
      input({
        characters: charactersById(man('m'), woman('w')),
        relationships: standing(5, ['m', 'w'])
      }),
      always
    )
    expect(apart.romance.crushes).toEqual({})
  })
})

describe('one crush and one partner at a time', () => {
  it('keeps a held crush rather than starting a second', () => {
    const out = settleNpcRomance(
      input({
        characters: charactersById(man('m'), woman('w'), woman('x')),
        relationships: standing(5, ['m', 'x']),
        romance: romance({ crushes: { m: { to: 'w', since: DAY } } }),
        groups: together('m', 'x')
      }),
      always
    )
    expect(out.romance.crushes.m).toEqual({ to: 'w', since: DAY })
  })

  it('starts no crush for anybody dating, a character or the reader', () => {
    const out = settleNpcRomance(
      input({
        characters: charactersById(man('m'), woman('w'), woman('x')),
        relationships: standing(5, ['m', 'x'], ['m', 'w']),
        romance: romance({ couples: { [pairKeyOf('m', 'w')]: { since: 1 } } }),
        groups: together('m', 'x'),
        readerLovers: ['x']
      }),
      always
    )
    expect(out.romance.crushes).toEqual({})
  })

  it('drops both partners’ crushes when a declaration is accepted', () => {
    const out = settleNpcRomance(
      input({
        characters: charactersById(man('m'), woman('w')),
        relationships: standing(4, ['m', 'w']),
        romance: romance({
          crushes: {
            m: { to: 'w', since: DAY - DECLARE_AFTER_DAYS },
            w: { to: 'm', since: DAY - 1 }
          }
        }),
        groups: together('m', 'w')
      }),
      always
    )
    expect(out.romance.couples[pairKeyOf('m', 'w')]).toEqual({ since: DAY })
    expect(out.romance.crushes).toEqual({})
  })

  it('rolls no declaration while the couples are at the cap', () => {
    const couples: NpcRomanceMap['couples'] = {}
    for (let i = 0; i < MAX_COUPLES; i++) couples[pairKeyOf(`a${i}`, `b${i}`)] = { since: 1 }
    const out = settleNpcRomance(
      input({
        characters: charactersById(man('m'), woman('w')),
        relationships: {
          ...standing(6, ['m', 'w']),
          ...Object.fromEntries(Object.keys(couples).map((key) => [key, { affinity: 6 }]))
        },
        romance: romance({ couples, crushes: { m: { to: 'w', since: 0 } } }),
        groups: together('m', 'w')
      }),
      always
    )
    expect(out.romance.crushes.m).toEqual({ to: 'w', since: 0 })
    expect(Object.keys(out.romance.couples)).toHaveLength(MAX_COUPLES)
  })
})

describe('declarations', () => {
  it('waits until the crush has been held long enough', () => {
    const out = settleNpcRomance(
      input({
        characters: charactersById(man('m'), woman('w')),
        relationships: standing(6, ['m', 'w']),
        romance: romance({ crushes: { m: { to: 'w', since: DAY - DECLARE_AFTER_DAYS + 1 } } }),
        groups: together('m', 'w')
      }),
      always
    )
    expect(out.romance.couples).toEqual({})
    expect(out.romance.crushes.m).toBeDefined()
  })

  it('is always turned down by the reader’s lover, even with a crush of her own', () => {
    const out = settleNpcRomance(
      input({
        characters: charactersById(man('m'), woman('w')),
        relationships: standing(6, ['m', 'w']),
        romance: romance({ crushes: { m: { to: 'w', since: 0 } } }),
        groups: together('m', 'w'),
        readerLovers: ['w']
      }),
      always
    )
    expect(out.romance.couples).toEqual({})
    expect(out.romance.rejections[directedKeyOf('m', 'w')]).toEqual({ date: DAY })
  })

  it('is turned down by somebody not attracted back, whatever the affinity', () => {
    const out = settleNpcRomance(
      input({
        characters: charactersById(man('m'), woman('w', { attractedTo: 'woman' })),
        relationships: standing(6, ['m', 'w']),
        romance: romance({ crushes: { m: { to: 'w', since: 0 } } }),
        groups: together('m', 'w')
      }),
      always
    )
    expect(out.romance.couples).toEqual({})
    expect(out.relationships[pairKeyOf('m', 'w')].affinity).toBe(6 - REJECTION_AFFINITY_DROP)
  })
})

describe('the wait after a rejection', () => {
  const setup = (date: number): NpcRomanceInput =>
    input({
      date,
      characters: charactersById(man('m'), woman('w')),
      relationships: {
        [pairKeyOf('m', 'w')]: {
          affinity: 5,
          encounter: { date, kind: 'hangout', ref: 'cafe', positive: true }
        }
      },
      romance: romance({ rejections: { [directedKeyOf('m', 'w')]: { date: DAY } } }),
      groups: together('m', 'w')
    })

  it('bars the same crush until the wait is over, then allows it', () => {
    const early = settleNpcRomance(setup(DAY + REJECTION_COOLDOWN_DAYS - 1), always)
    expect(early.romance.crushes.m).toBeUndefined()
    const late = settleNpcRomance(setup(DAY + REJECTION_COOLDOWN_DAYS), always)
    expect(late.romance.crushes.m?.to).toBe('w')
  })
})

describe('breakups', () => {
  const coupled = romance({ couples: { [pairKeyOf('m', 'w')]: { since: 1 } } })
  const characters = charactersById(man('m'), woman('w'))

  it('ends a couple whose affinity went negative, and they never fall for each other again', () => {
    const out = settleNpcRomance(
      input({
        characters,
        relationships: standing(BREAKUP_BELOW - 1, ['m', 'w']),
        romance: coupled
      }),
      never
    )
    expect(out.romance.couples).toEqual({})
    expect(out.romance.exes[pairKeyOf('m', 'w')]).toEqual({ since: 1, ended: DAY })

    const later = settleNpcRomance(
      input({
        date: DAY,
        characters,
        relationships: standing(6, ['m', 'w']),
        romance: out.romance,
        groups: together('m', 'w')
      }),
      always
    )
    expect(later.romance.crushes).toEqual({})
  })

  it('keeps a couple at a positive affinity, and a fight only on the week’s end', () => {
    const calm = settleNpcRomance(
      input({ characters, relationships: standing(2, ['m', 'w']), romance: coupled }),
      always
    )
    expect(calm.romance.couples[pairKeyOf('m', 'w')]).toBeDefined()
    const fight = settleNpcRomance(
      input({
        characters,
        endsWeek: true,
        relationships: standing(2, ['m', 'w']),
        romance: coupled
      }),
      always
    )
    expect(fight.romance.couples).toEqual({})
    expect(fight.tally.fights).toBe(1)
  })

  it('ends a couple the moment one of them is the reader’s lover', () => {
    const out = settleNpcRomance(
      input({
        characters,
        relationships: standing(6, ['m', 'w']),
        romance: coupled,
        readerLovers: ['w']
      }),
      never
    )
    expect(out.romance.couples).toEqual({})
  })
})
