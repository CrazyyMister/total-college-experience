import { beforeEach, describe, expect, it, vi } from 'vitest'
import { globalSlotOf } from '@shared/jobs'
import { pairKeyOf } from '@shared/npcRelationships'
import { emptyNpcRomance, settleNpcRomance } from '@shared/npcRomance'
import type { LedgerResponse } from '@shared/types'
import { buildCharKeyToId, useGameStore } from '../src/renderer/stores/gameStore'
import { projectLedger } from '../src/renderer/stores/sceneSanitizer'
import { applyRumorPass, rollRumorPass } from '../src/renderer/stores/loop/rumors'
import { applyReaderLosses, rollNpcRelationshipSettle } from '../src/renderer/stores/loop/npc'
import { applyCrushSettle, rollCrushSettle } from '../src/renderer/stores/loop/crushes'
import { withReaderLosses, withRumorPass } from '../src/renderer/stores/loop/ledgerView'
import { emptyFlags } from '@shared/relationship'
import { pointsForTier } from '@shared/playerStats'
import { character, charactersById, charInfo } from './fixtures'

/**
 * The three settles the ending rolls. They roll before the
 * boundary writes anything, so each has to read the finished scene's projection
 * rather than the store, and write nothing itself — the boundary files it.
 */

const sarah = character({ charId: 'a', firstName: 'Sarah', lastName: 'Rose' })
const mina = character({ charId: 'b', firstName: 'Mina', lastName: 'Kwon' })
const eve = character({ charId: 'c', firstName: 'Eve', lastName: 'Lang' })
const roster = charactersById(sarah, mina, eve)

/** A public scene where he kissed Sarah, which is what the campus can pick up. */
const seenWithSarah: LedgerResponse = {
  memories: [],
  events: [],
  acts: [{ kind: 'kiss', inPublic: true, chars: ['sarah_rose'] }]
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  // The witness roll always lands, so what the pass produces is about the flags
  // it read rather than about the dice.
  vi.spyOn(Math, 'random').mockReturnValue(0)

  useGameStore.getState().reset()
  useGameStore.setState({
    date: 7,
    chars: ['a', 'b', 'c'],
    characters: roster,
    charKeyToId: buildCharKeyToId(roster),
    charInfo: { a: charInfo(), b: charInfo(), c: charInfo() }
  })
})

describe('rollRumorPass', () => {
  it('writes nothing — the boundary is still what files it', () => {
    // Eve is in the room and was not in the kiss, so she watches it happen.
    useGameStore.setState({ cast: ['a', 'c'] })
    const before = useGameStore.getState().charInfo
    const outcome = rollRumorPass(seenWithSarah)
    expect(outcome.sightings).toEqual([{ witness: 'c', subjects: ['a'] }])
    expect(outcome.suspicions.c).toEqual([{ subject: 'a', slot: globalSlotOf(7, 0) }])
    expect(useGameStore.getState().charInfo).toBe(before)
    expect(useGameStore.getState().charInfo.c.suspicions).toBeUndefined()
  })

  it('reads the projection it is handed rather than the store', () => {
    const ledger: LedgerResponse = {
      memories: [],
      // Tonight. Nothing has written it to the store yet.
      events: [{ charKey: 'mina_kwon', event: 'became_lovers' }],
      acts: [{ kind: 'kiss', inPublic: true, chars: ['sarah_rose'] }]
    }
    useGameStore.setState({ cast: ['a', 'b'] })

    // Off the store — the lag this seam exists to remove. Mina is nobody's girlfriend yet,
    // so what she watched is not cheating and costs him nothing.
    expect(rollRumorPass(ledger).memories).toEqual([])

    // Off the projection, which is what the ending actually passes.
    const projected = projectLedger(useGameStore.getState().charInfo, ledger, { date: 7, time: 0 })
    expect(rollRumorPass(ledger, projected.charInfo).memories).toEqual([
      {
        charId: 'b',
        memory: { date: 7, time: 0, type: 'hated', desc: 'she saw the reader cheating on her with Sarah' }
      }
    ])
  })

  it('answers an uneventful scene with an outcome rather than nothing', () => {
    // The caller banks what it is given: "nothing happened" is an answer the
    // boundary can apply, and an absent one means an older save.
    expect(rollRumorPass({ memories: [], events: [] })).toEqual({
      suspicions: {},
      memories: [],
      sightings: [],
      betrayed: []
    })
  })
})

describe('applyRumorPass', () => {
  it('reaches the same state on a replayed boundary, entry identity included', () => {
    useGameStore.setState({ cast: ['a', 'b'] })
    const ledger: LedgerResponse = {
      memories: [],
      events: [{ charKey: 'mina_kwon', event: 'became_lovers' }],
      acts: [{ kind: 'kiss', inPublic: true, chars: ['sarah_rose'] }]
    }
    const projected = projectLedger(useGameStore.getState().charInfo, ledger, { date: 7, time: 0 })
    const outcome = rollRumorPass(ledger, projected.charInfo)
    applyRumorPass(outcome)
    const once = useGameStore.getState().charInfo
    applyRumorPass(outcome)
    expect(useGameStore.getState().charInfo).toBe(once)
    expect(useGameStore.getState().charInfo.b).toBe(once.b)
  })

  it('files exactly what the ending rolled, so the narration is not contradicted', () => {
    useGameStore.setState({ cast: ['a', 'c'] })
    const outcome = rollRumorPass(seenWithSarah)
    applyRumorPass(outcome)
    expect(useGameStore.getState().charInfo.c.suspicions).toEqual(outcome.suspicions.c)
  })
})

describe('withRumorPass', () => {
  it('folds an outcome into the projection the opening is narrated off', () => {
    useGameStore.setState({ cast: ['a', 'c'] })
    const projection = useGameStore.getState().charInfo
    const outcome = rollRumorPass(seenWithSarah)
    const seen = withRumorPass(projection, outcome)
    expect(seen.c.suspicions).toEqual(outcome.suspicions.c)
    // By value: the map it was handed is the save's own and stays as it was.
    expect(projection.c.suspicions).toBeUndefined()
  })
})

describe('the reader’s losses', () => {
  const breakups = [{ charId: 'b', forCharId: 'a', reason: 'coldness' as const }]
  const lover = () =>
    useGameStore.setState({
      characters: charactersById(sarah, mina, character({ charId: 'c', gender: 'man' })),
      charInfo: {
        a: charInfo(),
        b: charInfo({ flags: { ...emptyFlags(), isLover: true } }),
        c: charInfo()
      }
    })

  it('projects the lover leaving and the rival’s grudge exactly as the boundary files them', () => {
    lover()
    const projected = withReaderLosses(useGameStore.getState().charInfo, breakups, ['c'])
    applyReaderLosses(breakups, ['c'])
    const filed = useGameStore.getState().charInfo
    expect(projected.b).toEqual(filed.b)
    expect(projected.c).toEqual(filed.c)
    expect(filed.b.flags.isLover).toBe(false)
    expect(filed.b.brokeUpOn).toBe(7)
  })

  it('is safe to replay: she is not broken up with twice and the rival keeps one memory', () => {
    lover()
    applyReaderLosses(breakups, ['c'])
    const once = useGameStore.getState().charInfo
    applyReaderLosses(breakups, ['c'])
    const again = useGameStore.getState().charInfo
    expect(again.b.flags.brokenUp).toBe(1)
    expect(again.b.memories).toHaveLength(once.b.memories.length)
    expect(again.c.jealousyMemories).toHaveLength(1)
  })

  it('files what his wingman actions left remembered once, however often the boundary replays', () => {
    lover()
    const memories = [
      { charId: 'a', memory: { date: 7, type: 'liked' as const, desc: 'the reader helped bring her and Eve together' } },
      { charId: 'c', memory: { date: 7, type: 'hated' as const, desc: 'the reader badmouthed him behind his back' } }
    ]
    const projected = withReaderLosses(useGameStore.getState().charInfo, [], [], memories)
    applyReaderLosses([], [], memories)
    applyReaderLosses([], [], memories)
    const filed = useGameStore.getState().charInfo
    expect(projected.a).toEqual(filed.a)
    expect(projected.c).toEqual(filed.c)
    expect(filed.a.jealousyMemories).toEqual([memories[0].memory])
    expect(filed.c.jealousyMemories).toEqual([memories[1].memory])
    expect(filed.a.memories).toEqual([])
  })

  describe('a badmouthing found out', () => {
    // Eve, away, badmouthed to whichever of her friends is in the scene that day.
    const foundOut = (date: number, listener: string) =>
      settleNpcRomance(
        {
          date,
          time: 0,
          endsWeek: false,
          relationships: { [pairKeyOf('c', listener)]: { affinity: 4 } },
          romance: emptyNpcRomance(),
          groups: [],
          cast: [listener],
          readerLovers: [],
          characters: roster,
          sceneEvents: [{ kind: 'talked_down', from: 'c', to: listener }]
        },
        () => 0.999
      ).readerMemories
    const oldFormat = { date: 3, type: 'hated' as const, desc: 'the reader badmouthed her to Mina behind her back' }

    it('keeps one memory per victim whoever heard it, dated the latest time, however often it replays', () => {
      applyReaderLosses([], [], foundOut(7, 'a'))
      const later = foundOut(9, 'b')
      applyReaderLosses([], [], later)
      applyReaderLosses([], [], later)
      expect(useGameStore.getState().charInfo.c.jealousyMemories).toEqual([
        { date: 9, time: 0, type: 'hated', desc: 'the reader badmouthed her behind her back' }
      ])
    })

    it('leaves a memory of the older, per-listener wording as it was beside the one it now files', () => {
      useGameStore.setState({ charInfo: { a: charInfo(), b: charInfo(), c: charInfo({ jealousyMemories: [oldFormat] }) } })
      const first = foundOut(7, 'a')
      const projected = withReaderLosses(useGameStore.getState().charInfo, [], [], first)
      applyReaderLosses([], [], first)
      expect(projected.c).toEqual(useGameStore.getState().charInfo.c)
      applyReaderLosses([], [], foundOut(9, 'b'))
      expect(useGameStore.getState().charInfo.c.jealousyMemories).toEqual([
        oldFormat,
        { date: 9, time: 0, type: 'hated', desc: 'the reader badmouthed her behind her back' }
      ])
    })
  })

  it('dates the day a lover learned of a betrayal, in the projection and in the store', () => {
    lover()
    const outcome = { suspicions: {}, memories: [], sightings: [], betrayed: ['b'] }
    expect(withRumorPass(useGameStore.getState().charInfo, outcome).b.betrayedOn).toBe(7)
    applyRumorPass(outcome)
    expect(useGameStore.getState().charInfo.b.betrayedOn).toBe(7)
  })
})

describe('rollNpcRelationshipSettle', () => {
  it('settles the encounter groups it is handed rather than rolling fresh ones', () => {
    // The ending rolls the hour once and hands it to both settles; a second roll
    // would deal the two passes different run-ins.
    const settled = rollNpcRelationshipSettle([], [
      { kind: 'class', ref: 'BIO101', members: ['a', 'c'] }
    ])
    expect(settled[pairKeyOf('a', 'c')].encounter?.ref).toBe('BIO101')
  })

  it('returns the settled map without writing it', () => {
    // Both were in the scene, which is the whole of the bonded claim: they were
    // in the same room and the ledger says each came out of it liking him.
    useGameStore.setState({
      cast: ['a', 'b'],
      npcRelationships: { [pairKeyOf('a', 'b')]: { affinity: 0 } }
    })
    const before = useGameStore.getState().npcRelationships
    const settled = rollNpcRelationshipSettle(['a', 'b'])
    // Two girls the ledger left liking him got on with each other — the scene's
    // own contribution, and the one part of this that is not a roll.
    expect(settled[pairKeyOf('a', 'b')].affinity).toBe(1)
    expect(useGameStore.getState().npcRelationships).toBe(before)
  })

  it('is an assignment, so the boundary can apply it twice', () => {
    const settled = rollNpcRelationshipSettle(['a', 'b'])
    useGameStore.getState().setNpcRelationships(settled)
    const once = useGameStore.getState().npcRelationships
    useGameStore.getState().setNpcRelationships(settled)
    expect(useGameStore.getState().npcRelationships).toEqual(once)
  })
})

describe('rollCrushSettle', () => {
  /** Godly in what every fixture girl goes for — the roll's ceiling, so only the gates decide. */
  const godly = { brain: 0, body: 0, heart: pointsForTier(5) }

  /** A scene that left Sarah something good, which is the whole of the roll's gate. */
  const likedSarah: LedgerResponse = {
    memories: [{ charKey: 'sarah_rose', type: 'liked', desc: 'you walked her home' }],
    events: []
  }

  it('writes nothing — the boundary is still what files it', () => {
    const before = useGameStore.getState().charInfo
    expect(rollCrushSettle(likedSarah, before, godly)).toEqual(['a'])
    expect(useGameStore.getState().charInfo).toBe(before)
  })

  it('rolls for nobody the scene left nothing good with', () => {
    expect(
      rollCrushSettle(
        { memories: [{ charKey: 'mina_kwon', type: 'disliked', desc: 'you were late' }], events: [] },
        useGameStore.getState().charInfo,
        godly
      )
    ).toEqual([])
  })

  it('skips a girl who already has one, and a lover who is past the stage', () => {
    useGameStore.setState({
      charInfo: {
        a: charInfo({ flags: { ...charInfo().flags, hasCrush: true } }),
        b: charInfo({ flags: { ...charInfo().flags, isLover: true } }),
        c: charInfo()
      }
    })
    const ledger: LedgerResponse = {
      memories: [
        { charKey: 'sarah_rose', type: 'loved', desc: 'you stayed' },
        { charKey: 'mina_kwon', type: 'loved', desc: 'you stayed' },
        { charKey: 'eve_lang', type: 'loved', desc: 'you stayed' }
      ],
      events: []
    }
    expect(rollCrushSettle(ledger, useGameStore.getState().charInfo, godly)).toEqual(['c'])
  })

  it('rolls nobody for the texting-only ledger the exam prefetch fires on', () => {
    // The prefetch runs before a single question is answered, so an empty pass
    // is what has to be banked — not an omitted field the boundary falls back on.
    expect(
      rollCrushSettle(
        { textMemories: [{ charKey: 'sarah_rose', type: 'loved', desc: 'you texted her first' }] },
        useGameStore.getState().charInfo,
        godly
      )
    ).toEqual([])
  })

  it('reads the charInfo it is handed rather than the store', () => {
    // The whole reason the ending can roll this before the boundary writes
    // anything: what it reads is the projection, not what is on the save.
    useGameStore.setState({
      charInfo: { ...useGameStore.getState().charInfo, a: charInfo({ flags: { ...charInfo().flags, hasCrush: true } }) }
    })
    expect(rollCrushSettle(likedSarah, useGameStore.getState().charInfo, godly)).toEqual([])
    expect(rollCrushSettle(likedSarah, { ...useGameStore.getState().charInfo, a: charInfo() }, godly)).toEqual(['a'])
  })

  it('counts what the rumor pass filed against her, which is why it rolls after it', () => {
    // `withRumorPass` is what puts the memory on the map this reads, and it — hated,
    // tonight — weighs ×4. Rolling above the pass would let her fall for him on an
    // affection blind to what she has just found out.
    const hurt = withRumorPass(useGameStore.getState().charInfo, {
      suspicions: {},
      memories: [
        { charId: 'a', memory: { date: 7, type: 'hated', desc: 'she saw you with Mina' } }
      ],
      sightings: []
    })
    expect(rollCrushSettle(likedSarah, hurt, godly)).toEqual([])
    expect(rollCrushSettle(likedSarah, useGameStore.getState().charInfo, godly)).toEqual(['a'])
  })
})

describe('applyCrushSettle', () => {
  it('reaches the same state on a replayed boundary, entry identity included', () => {
    applyCrushSettle(['a'])
    const once = useGameStore.getState().charInfo
    applyCrushSettle(['a'])
    expect(useGameStore.getState().charInfo).toBe(once)
    expect(once.a.flags.hasCrush).toBe(true)
  })

  it('invents nobody the save does not already hold', () => {
    const before = useGameStore.getState().charInfo
    applyCrushSettle(['nobody'])
    expect(useGameStore.getState().charInfo).toBe(before)
  })
})
