import { describe, expect, it } from 'vitest'
import { pairKeyOf, type NpcEncounterGroup, type NpcRelationshipMap } from '@shared/npcRelationships'
import {
  BETRAYAL_OPENS_AT,
  BETRAYAL_WINDOW_DAYS,
  BREAKUP_BELOW,
  DECLARE_AFTER_DAYS,
  HELD_CRUSH_FADES_DAYS,
  DRIFT_FORGIVEN_ABOVE,
  DRIFT_HOLDS_ABOVE,
  DRIFT_MIN_DAYS,
  DRIFT_OPENS_AT,
  MAX_COUPLES,
  REJECTION_AFFINITY_DROP,
  REJECTION_COOLDOWN_DAYS,
  directedKeyOf,
  emptyNpcRomance,
  rivalMemoryOf,
  settleNpcRomance,
  type NpcRomanceInput,
  type NpcRomanceMap,
  type ReaderLoverState
} from '@shared/npcRomance'
import { upsertJealousyMemory } from '@shared/rumors'
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

  it('keeps a crush on the reader’s lover to itself instead of declaring it', () => {
    const out = settleNpcRomance(
      input({
        characters: charactersById(man('m'), woman('w')),
        relationships: standing(6, ['m', 'w']),
        romance: romance({ crushes: { m: { to: 'w', since: DAY - DECLARE_AFTER_DAYS } } }),
        groups: together('m', 'w'),
        readerLovers: ['w']
      }),
      always
    )
    expect(out.romance.couples).toEqual({})
    expect(out.romance.rejections).toEqual({})
    expect(out.romance.crushes.m?.to).toBe('w')
    expect(out.tally.declarations).toBe(0)
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

describe('what a scene showed', () => {
  const characters = charactersById(man('m'), woman('w'), woman('x'), man('n'))
  const scene = (over: Partial<NpcRomanceInput>): NpcRomanceInput =>
    input({ characters, relationships: standing(3, ['m', 'w']), cast: ['m', 'w'], ...over })

  it('makes a couple of an accepted declaration and drops both crushes', () => {
    const out = settleNpcRomance(
      scene({
        romance: romance({ crushes: { m: { to: 'w', since: 1 }, w: { to: 'm', since: 2 } } }),
        sceneEvents: [{ kind: 'declared', from: 'm', to: 'w', accepted: true }]
      }),
      never
    )
    expect(out.romance.couples[pairKeyOf('m', 'w')]).toEqual({ since: DAY })
    expect(out.romance.crushes).toEqual({})
  })

  it('files a turned-down declaration with its cost and its wait', () => {
    const out = settleNpcRomance(
      scene({ sceneEvents: [{ kind: 'declared', from: 'm', to: 'w', accepted: false }] }),
      never
    )
    expect(out.romance.couples).toEqual({})
    expect(out.romance.rejections[directedKeyOf('m', 'w')]).toEqual({ date: DAY })
    expect(out.relationships[pairKeyOf('m', 'w')].affinity).toBe(3 - REJECTION_AFFINITY_DROP)
  })

  it('discards a declaration the rules cannot take', () => {
    const declare = { kind: 'declared', from: 'm', to: 'w', accepted: true } as const
    const cases: Partial<NpcRomanceInput>[] = [
      // Not both in the scene.
      { cast: ['m'] },
      // The reader's lover, on either side.
      { readerLovers: ['w'] },
      // The declarer is dating somebody else.
      { romance: romance({ couples: { [pairKeyOf('m', 'x')]: { since: 1 } } }) },
      // Exes.
      { romance: romance({ exes: { [pairKeyOf('m', 'w')]: { since: 1, ended: 5 } } }) },
      // Inside the wait after the same declaration was turned down.
      { romance: romance({ rejections: { [directedKeyOf('m', 'w')]: { date: DAY - 1 } } }) },
      // The couples at the cap.
      {
        romance: romance({
          couples: Object.fromEntries(
            Array.from({ length: MAX_COUPLES }, (_, i) => [pairKeyOf(`a${i}`, `b${i}`), { since: 1 }])
          )
        })
      }
    ]
    for (const over of cases) {
      const before = over.romance ?? emptyNpcRomance()
      const out = settleNpcRomance(scene({ ...over, sceneEvents: [declare] }), never)
      expect(out.romance.couples).toEqual(before.couples)
      expect(out.romance.rejections).toEqual(before.rejections)
      expect(out.log.some((entry) => entry.kind === 'discarded')).toBe(true)
    }
  })

  it('takes only a no from somebody not attracted back or already dating', () => {
    const notDrawn = charactersById(man('m'), woman('w', { attractedTo: 'woman' }))
    const yes = settleNpcRomance(
      scene({
        characters: notDrawn,
        sceneEvents: [{ kind: 'declared', from: 'm', to: 'w', accepted: true }]
      }),
      never
    )
    expect(yes.romance.couples).toEqual({})
    const no = settleNpcRomance(
      scene({
        romance: romance({ couples: { [pairKeyOf('w', 'n')]: { since: 1 } } }),
        sceneEvents: [{ kind: 'declared', from: 'm', to: 'w', accepted: false }]
      }),
      never
    )
    expect(no.romance.rejections[directedKeyOf('m', 'w')]).toEqual({ date: DAY })
  })

  it('breaks up a couple only when it is one and one of the two is in the scene', () => {
    const coupled = romance({ couples: { [pairKeyOf('m', 'w')]: { since: 1 } } })
    const out = settleNpcRomance(
      scene({ romance: coupled, cast: ['m'], sceneEvents: [{ kind: 'broke_up', from: 'm', to: 'w' }] }),
      never
    )
    expect(out.romance.couples).toEqual({})
    expect(out.romance.exes[pairKeyOf('m', 'w')]).toEqual({ since: 1, ended: DAY })

    const absent = settleNpcRomance(
      scene({ romance: coupled, cast: ['x'], sceneEvents: [{ kind: 'broke_up', from: 'm', to: 'w' }] }),
      never
    )
    expect(absent.romance.couples).toEqual(coupled.couples)
  })

  it('records a discovery of a crush that exists, and forgets it once the crush is gone', () => {
    const crushing = romance({ crushes: { m: { to: 'w', since: 1 } } })
    const out = settleNpcRomance(
      scene({
        romance: crushing,
        cast: ['m'],
        sceneEvents: [
          { kind: 'discovered', from: 'm', to: 'w' },
          { kind: 'discovered', from: 'm', to: 'x' }
        ]
      }),
      never
    )
    expect(out.romance.discovered).toEqual({ m: { to: 'w', date: DAY } })

    const faded = settleNpcRomance(
      scene({ romance: out.romance, relationships: standing(-1, ['m', 'w']), cast: [] }),
      never
    )
    expect(faded.romance.discovered).toEqual({})
  })

  it('stamps a couple’s fight with its date', () => {
    const out = settleNpcRomance(
      input({
        characters,
        endsWeek: true,
        relationships: standing(6, ['m', 'w']),
        romance: romance({ couples: { [pairKeyOf('m', 'w')]: { since: 1 } } })
      }),
      always
    )
    expect(out.romance.couples[pairKeyOf('m', 'w')]).toEqual({ since: 1, lastFight: DAY })
  })
})

describe('the reader’s lover drifting away', () => {
  const characters = charactersById(man('m'), woman('w'), woman('x'))
  const cold: ReaderLoverState = { affection: DRIFT_OPENS_AT, harem: false }
  const crushOn = { m: { to: 'w', since: 1 } }
  const running = { w: { to: 'm', since: DAY - 2, signs: 0 } }
  const ripe = { w: { to: 'm', since: DAY - DRIFT_MIN_DAYS, signs: 2, lastSign: DAY - 3 } }
  const settle = (over: Partial<NpcRomanceInput>) =>
    settleNpcRomance(
      input({
        characters,
        relationships: standing(6, ['m', 'w']),
        romance: romance({ crushes: crushOn }),
        readerLovers: ['w'],
        loverStates: { w: cold },
        ...over
      }),
      never
    )

  it('opens on a cold lover whose suitor could declare, and on nobody else', () => {
    expect(settle({}).romance.drifts?.w).toEqual({ to: 'm', since: DAY, signs: 0 })
    const warmer = { w: { affection: DRIFT_OPENS_AT + 1, harem: false } }
    expect(settle({ loverStates: warmer }).romance.drifts).toBeUndefined()
    expect(settle({ loverStates: { w: { ...cold, harem: true } } }).romance.drifts).toBeUndefined()

    // The suitor is dating somebody, is inside a wait, or the couples are at the cap.
    const dating = romance({ crushes: crushOn, couples: { [pairKeyOf('m', 'x')]: { since: 1 } } })
    expect(settle({ romance: dating }).romance.drifts).toBeUndefined()
    const waiting = romance({
      crushes: crushOn,
      rejections: { [directedKeyOf('m', 'w')]: { date: DAY - 1 } }
    })
    expect(settle({ romance: waiting }).romance.drifts).toBeUndefined()
    const capped = romance({
      crushes: crushOn,
      couples: Object.fromEntries(
        Array.from({ length: MAX_COUPLES }, (_, i) => [pairKeyOf(`a${i}`, `b${i}`), { since: 1 }])
      )
    })
    expect(settle({ romance: capped }).romance.drifts).toBeUndefined()
  })

  it('opens at one bar and ends at a higher one', () => {
    const at = (affection: number) =>
      settle({
        romance: romance({ crushes: crushOn, drifts: running }),
        loverStates: { w: { affection, harem: false } }
      })
    expect(at(DRIFT_HOLDS_ABOVE).romance.drifts?.w).toBeDefined()
    expect(at(DRIFT_HOLDS_ABOVE + 1).romance.drifts).toBeUndefined()
  })

  it('holds a drift over a recent betrayal while she has not forgiven it, and lets go once it is old', () => {
    const hurt = (affection: number, betrayedOn: number) => ({
      w: { affection, harem: false, betrayedOn }
    })
    const state = romance({ crushes: crushOn, drifts: running })
    const recent = DAY - BETRAYAL_WINDOW_DAYS + 1
    expect(settle({ romance: state, loverStates: hurt(DRIFT_FORGIVEN_ABOVE, recent) }).romance.drifts?.w).toBeDefined()
    const old = settle({ romance: state, loverStates: hurt(-4, DAY - BETRAYAL_WINDOW_DAYS) })
    expect(old.romance.drifts).toBeUndefined()
  })

  it('opens over a betrayal only at the low bar and forgives above the high one', () => {
    const hurt = (affection: number) => ({ w: { affection, harem: false, betrayedOn: DAY - 1 } })
    expect(settle({ loverStates: hurt(BETRAYAL_OPENS_AT) }).romance.drifts?.w).toBeDefined()
    // Warmer than the low bar, a betrayal alone opens nothing, even inside the gap.
    expect(settle({ loverStates: hurt(BETRAYAL_OPENS_AT + 1) }).romance.drifts).toBeUndefined()
    const state = romance({ crushes: crushOn, drifts: running })
    // Inside the gap a drift already standing stays; above it she has forgiven him.
    const between = settle({ romance: state, loverStates: hurt(DRIFT_FORGIVEN_ABOVE) })
    expect(between.romance.drifts?.w).toBeDefined()
    const forgiven = settle({ romance: state, loverStates: hurt(DRIFT_FORGIVEN_ABOVE + 1) })
    expect(forgiven.romance.drifts).toBeUndefined()
    // The same betrayal does not reopen it while she stays that warm.
    const again = settle({ romance: forgiven.romance, loverStates: hurt(DRIFT_FORGIVEN_ABOVE + 1) })
    expect(again.romance.drifts).toBeUndefined()
  })

  it('leaves the cold drift as it was: opens at -15, ends above -10', () => {
    const at = (affection: number, drifts?: NpcRomanceMap['drifts']) =>
      settle({
        romance: romance({ crushes: crushOn, ...(drifts ? { drifts } : {}) }),
        loverStates: { w: { affection, harem: false } }
      }).romance.drifts?.w
    expect(at(DRIFT_OPENS_AT)).toBeDefined()
    expect(at(DRIFT_OPENS_AT + 1)).toBeUndefined()
    expect(at(DRIFT_HOLDS_ABOVE, running)).toBeDefined()
    expect(at(DRIFT_HOLDS_ABOVE + 1, running)).toBeUndefined()
  })

  it('counts at most one sign a day, and only where the drift was already on the map', () => {
    const fresh = romance({
      crushes: crushOn,
      drifts: { w: { to: 'm', since: DAY - 1, signs: 1, lastSign: DAY - 1 } }
    })
    expect(settle({ romance: fresh, signed: ['w'] }).romance.drifts?.w.signs).toBe(2)
    expect(settle({ romance: fresh }).romance.drifts?.w.signs).toBe(1)
    const today = romance({
      crushes: crushOn,
      drifts: { w: { to: 'm', since: DAY - 1, signs: 1, lastSign: DAY } }
    })
    expect(settle({ romance: today, signed: ['w'] }).romance.drifts?.w.signs).toBe(1)
    // A drift opened this very settle has shown nothing yet.
    expect(settle({ signed: ['w'] }).romance.drifts?.w.signs).toBe(0)
  })

  it('has her leave only after the days and the signs, and says why', () => {
    const young = { w: { ...ripe.w, since: DAY - DRIFT_MIN_DAYS + 1, signs: 5 } }
    expect(settle({ romance: romance({ crushes: crushOn, drifts: young }) }).readerBreakups).toEqual([])
    const unseen = { w: { ...ripe.w, signs: 1 } }
    expect(settle({ romance: romance({ crushes: crushOn, drifts: unseen }) }).readerBreakups).toEqual([])

    const left = settle({ romance: romance({ crushes: crushOn, drifts: ripe }) })
    expect(left.readerBreakups).toEqual([{ charId: 'w', forCharId: 'm', reason: 'coldness' }])
    expect(left.romance.drifts).toBeUndefined()
    const betrayed = settle({
      romance: romance({ crushes: crushOn, drifts: ripe }),
      loverStates: { w: { ...cold, betrayedOn: DAY - 1 } }
    })
    expect(betrayed.readerBreakups[0].reason).toBe('betrayal')
  })

  it('drops a drift when the suitor stops standing or she is no longer his lover', () => {
    const gone = settle({ romance: romance({ drifts: ripe }) })
    expect(gone.romance.drifts).toBeUndefined()
    expect(gone.readerBreakups).toEqual([])
    const free = settle({
      romance: romance({ crushes: crushOn, drifts: ripe }),
      readerLovers: [],
      loverStates: {}
    })
    expect(free.romance.drifts).toBeUndefined()
    expect(free.readerBreakups).toEqual([])
  })
})

describe('a crush kept on the reader’s lover', () => {
  const characters = charactersById(man('m'), woman('w'))
  const warm: Record<string, ReaderLoverState> = { w: { affection: 30, harem: false } }
  const settle = (over: Partial<NpcRomanceInput>) =>
    settleNpcRomance(
      input({
        characters,
        relationships: standing(6, ['m', 'w']),
        readerLovers: ['w'],
        loverStates: warm,
        ...over
      }),
      never
    )
  const held = (heldSince: number, over: Partial<NpcRomanceMap> = {}) =>
    romance({ crushes: { m: { to: 'w', since: 1, heldSince } }, ...over })

  it('starts counting the first time it is seen, from the later of the crush and the dating', () => {
    const fresh = settle({ romance: romance({ crushes: { m: { to: 'w', since: 1 } } }) })
    expect(fresh.romance.crushes.m.heldSince).toBe(1)
    const dated = settle({
      romance: romance({ crushes: { m: { to: 'w', since: 1 } } }),
      loverStates: { w: { ...warm.w, datingSince: DAY - 4 } }
    })
    expect(dated.romance.crushes.m.heldSince).toBe(DAY - 4)
    // Not on the reader’s lover: no clock at all.
    const free = settle({ romance: held(3), readerLovers: [], loverStates: {} })
    expect(free.romance.crushes.m.heldSince).toBeUndefined()
  })

  it('fades unsaid after the days, with no cost, no memory of a declaration and the same wait', () => {
    const before = standing(6, ['m', 'w'])
    const kept = settle({ romance: held(DAY - HELD_CRUSH_FADES_DAYS + 1) })
    expect(kept.romance.crushes.m).toBeDefined()

    const out = settle({ romance: held(DAY - HELD_CRUSH_FADES_DAYS), relationships: before })
    expect(out.romance.crushes).toEqual({})
    expect(out.romance.rejections[directedKeyOf('m', 'w')]).toEqual({ date: DAY, quiet: true })
    expect(out.relationships[pairKeyOf('m', 'w')].affinity).toBe(6)
    expect(out.tally).toEqual({
      crushes: 0,
      declarations: 0,
      accepted: 0,
      rejected: 0,
      fights: 0,
      breakups: 0
    })
    // The wait bars the same crush from forming again until it is over.
    const later = (date: number) =>
      settleNpcRomance(
        input({
          date,
          characters,
          relationships: {
            [pairKeyOf('m', 'w')]: {
              affinity: 6,
              encounter: { date, kind: 'hangout', ref: 'cafe', positive: true }
            }
          },
          romance: out.romance,
          groups: together('m', 'w')
        }),
        always
      )
    expect(later(DAY + REJECTION_COOLDOWN_DAYS - 1).romance.crushes.m).toBeUndefined()
    expect(later(DAY + REJECTION_COOLDOWN_DAYS).romance.crushes.m?.to).toBe('w')
  })

  it('stops its clock while a drift stands and picks it up where it left off', () => {
    const drift = { w: { to: 'm', since: DAY - 8, signs: 0 } }
    const cold: Record<string, ReaderLoverState> = { w: { affection: DRIFT_OPENS_AT, harem: false } }
    // A drift open: past the days, and still there.
    const paused = settle({
      romance: held(DAY - HELD_CRUSH_FADES_DAYS - 5, { drifts: drift }),
      loverStates: cold
    })
    expect(paused.romance.crushes.m).toBeDefined()
    // The drift cancels: its eight days are not counted, so the clock resumes from the day it opened.
    const resumed = settle({
      romance: held(DAY - 20, { drifts: drift }),
      loverStates: warm
    })
    expect(resumed.romance.drifts).toBeUndefined()
    expect(resumed.romance.crushes.m.heldSince).toBe(DAY - 20 + 8)
  })
})

describe('the man the reader displaced', () => {
  const characters = charactersById(man('m'), woman('w'))
  const coupled = romance({ couples: { [pairKeyOf('m', 'w')]: { since: 1 } } })

  it('is named on the ex record only when the reader’s lover ended it', () => {
    const byReader = settleNpcRomance(
      input({
        characters,
        relationships: standing(6, ['m', 'w']),
        romance: coupled,
        readerLovers: ['w']
      }),
      never
    )
    expect(byReader.romance.exes[pairKeyOf('m', 'w')].displaced).toBe('m')
    expect(byReader.rivals).toEqual(['m'])

    const sour = settleNpcRomance(
      input({
        characters,
        relationships: standing(BREAKUP_BELOW - 1, ['m', 'w']),
        romance: coupled
      }),
      never
    )
    expect(sour.romance.exes[pairKeyOf('m', 'w')].displaced).toBeUndefined()
    expect(sour.rivals).toEqual([])
  })

  it('files one grudge memory however often it is filed', () => {
    const once = upsertJealousyMemory(undefined, rivalMemoryOf(characters.m, 30))
    const twice = upsertJealousyMemory(once, rivalMemoryOf(characters.m, 31))
    expect(twice).toHaveLength(1)
    expect(twice[0].type).toBe('hated')
  })
})
