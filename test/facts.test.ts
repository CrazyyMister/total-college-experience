import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkFacts,
  FACT_CAP,
  factIdOf,
  factsKnownBy,
  withFactsFiled,
  type FactsCheckInput
} from '@shared/facts'
import type { Fact, FactsReply, GameSave } from '@shared/types'
import { useGameStore } from '../src/renderer/stores/gameStore'
import { playthroughRecord } from './fixtures'

/**
 * The facts a scene proposes are held to the scene before the player is asked, and filed once.
 * A fact let through wrongly is a wrong thing every character then says for the rest of the game.
 */

const KEYS: Record<string, string> = { ann_aa: 'a', bea_bb: 'b', cara_cc: 'c', dee_dd: 'd' }
const FIRST: Record<string, string> = { a: 'Ann', b: 'Bea', c: 'Cara', d: 'Dee', z: 'Zed' }

function fact(over: Partial<Fact> = {}): Fact {
  return {
    id: 'd1t0n0',
    about: 'a',
    category: 'family',
    text: 'has a sister, Joy',
    kind: 'happened',
    knownBy: ['a'],
    date: 1,
    time: 0,
    ...over
  }
}

function input(over: Partial<FactsCheckInput> = {}): FactsCheckInput {
  return {
    date: 3,
    time: 1,
    // Dee is in the scene but the reader has not learned her name; Zed was never there.
    cast: ['a', 'b', 'd'],
    charIdOf: (charKey) => KEYS[charKey] ?? (charKey === 'zed_zz' ? 'z' : undefined),
    nameKnown: (charId) => charId !== 'd',
    firstNameOf: (charId) => FIRST[charId],
    existing: [],
    saw: ['a', 'b'],
    ...over
  }
}

function row(over: Partial<NonNullable<FactsReply['facts']>[number]> = {}) {
  return {
    about: 'ann_aa',
    category: 'family' as const,
    text: 'has an older sister, Joy',
    said: false,
    heardBy: [],
    ...over
  }
}

describe('checkFacts holds the reply to the scene', () => {
  it('keeps a good fact, filed under the slot with an id of its place in the list', () => {
    const { facts } = checkFacts({ facts: [row()] }, input())
    expect(facts).toEqual([
      {
        id: factIdOf(3, 1, 0),
        about: 'a',
        category: 'family',
        text: 'has an older sister, Joy',
        kind: 'happened',
        knownBy: ['a'],
        date: 3,
        time: 1
      }
    ])
  })

  it('drops a category off the list, an unknown subject, one out of the scene and one with no words', () => {
    const warn = vi.fn()
    const { facts } = checkFacts(
      {
        facts: [
          row({ category: 'gossip' as never }),
          row({ about: 'nobody_here' }),
          row({ about: 'zed_zz' }),
          row({ text: '  .  ' }),
          row({ text: 'is from Ohio', category: 'past' })
        ]
      },
      input({ warn })
    )
    expect(facts.map((one) => one.text)).toEqual(['is from Ohio'])
    expect(warn).toHaveBeenCalledTimes(4)
  })

  it('drops a fact about somebody whose name the reader does not know', () => {
    const warn = vi.fn()
    expect(checkFacts({ facts: [row({ about: 'dee_dd' })] }, input({ warn })).facts).toEqual([])
    expect(warn).toHaveBeenCalledOnce()
  })

  it('files what is not plainly marked as having happened as only said', () => {
    const { facts } = checkFacts(
      { facts: [row({ said: undefined as never }), row({ text: 'has a cat', said: true })] },
      input()
    )
    expect(facts.map((one) => one.kind)).toEqual(['said', 'said'])
  })

  it('puts a fact in the reader\'s voice with no subject in front and no full stop behind', () => {
    const { facts } = checkFacts(
      { facts: [row({ text: 'Ann has a brother who calls you every week.' })] },
      input()
    )
    expect(facts[0].text).toBe('has a brother who calls the reader every week')
  })

  it('drops one that repeats a fact already filed, or one earlier in the reply', () => {
    const existing = [fact({ id: 'd0t0n0', text: 'has an older sister, Joy' })]
    const warn = vi.fn()
    const { facts } = checkFacts(
      {
        facts: [
          row(),
          row({ text: 'Has an older sister Joy.' }),
          row({ text: 'likes tea', category: 'tastes_habits' }),
          row({ text: 'likes tea', category: 'tastes_habits' })
        ]
      },
      input({ existing, warn })
    )
    expect(facts.map((one) => one.text)).toEqual(['likes tea'])
    expect(warn).toHaveBeenCalledTimes(3)
  })

  it('does not take a fact the scene filed for a repeat of itself when the boundary replays', () => {
    const first = checkFacts({ facts: [row()] }, input()).facts
    const replay = checkFacts({ facts: [row()] }, input({ existing: first }))
    expect(replay.facts).toEqual(first)
  })

  describe('who knows', () => {
    it('is the person it is about and whoever the reply named who was in the scene', () => {
      const { facts } = checkFacts(
        { facts: [row({ heardBy: ['bea_bb', 'zed_zz', 'dee_dd'] })] },
        input()
      )
      expect(facts[0].knownBy).toEqual(['a', 'b', 'd'])
    })

    it('is only the person it is about when nobody is named', () => {
      expect(checkFacts({ facts: [row()] }, input()).facts[0].knownBy).toEqual(['a'])
      expect(
        checkFacts({ facts: [row({ heardBy: ['zed_zz'] })] }, input()).facts[0].knownBy
      ).toEqual(['a'])
    })

    it('is who took in the summary for a fact about the reader that names nobody', () => {
      const none = checkFacts(
        { facts: [row({ about: 'reader', category: 'about_reader', text: 'plays the cello' })] },
        input({ saw: ['b', 'd'] })
      )
      expect(none.facts[0].knownBy).toEqual(['b', 'd'])
      const named = checkFacts(
        {
          facts: [
            row({ about: 'reader', category: 'about_reader', text: 'plays the cello', heardBy: ['ann_aa'] })
          ]
        },
        input({ saw: ['b', 'd'] })
      )
      expect(named.facts[0].knownBy).toEqual(['a'])
    })
  })

  it(`keeps ${FACT_CAP} new facts, the first ones, and drops the rest with a warning`, () => {
    const warn = vi.fn()
    const rows = Array.from({ length: FACT_CAP + 2 }, (_, at) => row({ text: `fact number ${at}` }))
    const { facts } = checkFacts({ facts: rows }, input({ warn }))
    expect(facts.map((one) => one.text)).toEqual(
      Array.from({ length: FACT_CAP }, (_, at) => `fact number ${at}`)
    )
    expect(facts.map((one) => one.id)).toEqual(
      Array.from({ length: FACT_CAP }, (_, at) => factIdOf(3, 1, at))
    )
    expect(warn).toHaveBeenCalledOnce()
  })

  it('reads a reply that is missing its lists, or is nothing, as no facts', () => {
    expect(checkFacts({}, input())).toEqual({ facts: [], learned: [] })
    expect(checkFacts(null, input())).toEqual({ facts: [], learned: [] })
    expect(checkFacts({ facts: 'no' as never, learned: 3 as never }, input())).toEqual({
      facts: [],
      learned: []
    })
  })

  describe('who came to know a fact already filed', () => {
    const existing = [fact({ knownBy: ['a'] })]

    it('keeps somebody in the scene who did not know it, told by somebody who did', () => {
      const { learned } = checkFacts(
        { learned: [{ fact: 'd1t0n0', charKey: 'bea_bb' }] },
        input({ existing })
      )
      expect(learned).toEqual([{ factId: 'd1t0n0', charId: 'b' }])
    })

    it('drops a fact that is not on the save, and somebody who is not in the scene', () => {
      const warn = vi.fn()
      const { learned } = checkFacts(
        {
          learned: [
            { fact: 'd9t9n9', charKey: 'bea_bb' },
            { fact: 'd1t0n0', charKey: 'zed_zz' },
            { fact: 'd1t0n0', charKey: 'nobody_here' }
          ]
        },
        input({ existing, warn })
      )
      expect(learned).toEqual([])
      expect(warn).toHaveBeenCalledTimes(3)
    })

    it('drops somebody who already knew it, and a repeated row', () => {
      const { learned } = checkFacts(
        {
          learned: [
            { fact: 'd1t0n0', charKey: 'ann_aa' },
            { fact: 'd1t0n0', charKey: 'bea_bb' },
            { fact: 'd1t0n0', charKey: 'bea_bb' }
          ]
        },
        input({ existing })
      )
      expect(learned).toEqual([{ factId: 'd1t0n0', charId: 'b' }])
    })

    it('drops a fact nobody in the scene knew to tell, so nothing spreads from outside it', () => {
      const outside = [fact({ knownBy: ['c'] })]
      const warn = vi.fn()
      expect(
        checkFacts({ learned: [{ fact: 'd1t0n0', charKey: 'bea_bb' }] }, input({ existing: outside, warn }))
          .learned
      ).toEqual([])
      expect(warn).toHaveBeenCalledOnce()
    })
  })
})

describe('factsKnownBy', () => {
  const all = [
    fact({ id: 'd2t0n0', date: 2, knownBy: ['a', 'b'] }),
    fact({ id: 'd1t1n0', date: 1, time: 1, knownBy: ['a'] }),
    fact({ id: 'd1t0n0', date: 1, time: 0, knownBy: ['b'] }),
    fact({ id: 'd1t1n1', date: 1, time: 1, knownBy: ['a'] })
  ]

  it('gives only the ones she knows', () => {
    expect(factsKnownBy('b', all).map((one) => one.id)).toEqual(['d1t0n0', 'd2t0n0'])
    expect(factsKnownBy('z', all)).toEqual([])
    expect(factsKnownBy('a', undefined)).toEqual([])
  })

  it('orders them by the slot they were filed in and then as they were kept, whatever order they come in', () => {
    const ids = (list: Fact[]): string[] => factsKnownBy('a', list).map((one) => one.id)
    expect(ids(all)).toEqual(['d1t1n0', 'd1t1n1', 'd2t0n0'])
    expect(ids([...all].reverse())).toEqual(['d1t1n1', 'd1t1n0', 'd2t0n0'])
    expect(ids(all)).toEqual(ids(all))
  })

  it('keeps the newest of them under a limit', () => {
    expect(factsKnownBy('a', all, 2).map((one) => one.id)).toEqual(['d1t1n1', 'd2t0n0'])
  })

  it('does not change the list it is given', () => {
    const before = JSON.stringify(all)
    factsKnownBy('a', all, 1)
    expect(JSON.stringify(all)).toBe(before)
  })
})

describe('withFactsFiled', () => {
  it('files a fact once however often the boundary runs', () => {
    const once = withFactsFiled([], [fact()], [])
    expect(once).toEqual([fact()])
    expect(withFactsFiled(once ?? [], [fact()], [])).toBeNull()
  })

  it('replaces a fact filed under the same id rather than adding a second', () => {
    const next = withFactsFiled([fact()], [fact({ text: 'has a brother' })], [])
    expect(next).toEqual([fact({ text: 'has a brother' })])
  })

  it('adds who learned a fact once, and only to a fact that is there', () => {
    const next = withFactsFiled([fact()], [], [{ factId: 'd1t0n0', charId: 'b' }])
    expect(next?.[0].knownBy).toEqual(['a', 'b'])
    expect(withFactsFiled(next ?? [], [], [{ factId: 'd1t0n0', charId: 'b' }])).toBeNull()
    expect(withFactsFiled(next ?? [], [], [{ factId: 'gone', charId: 'b' }])).toBeNull()
  })
})

describe('facts on the save', () => {
  beforeEach(() => {
    useGameStore.getState().reset()
  })

  it('fileFacts files once on a replayed boundary', () => {
    const { fileFacts } = useGameStore.getState()
    fileFacts([fact()], [])
    fileFacts([fact()], [])
    expect(useGameStore.getState().facts).toEqual([fact()])
  })

  it('writes them to the save, and omits the field while there are none', () => {
    expect('facts' in useGameStore.getState().toGameSave()).toBe(false)
    useGameStore.getState().fileFacts([fact()], [])
    const save = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave
    expect(save.facts).toEqual([fact()])

    useGameStore.getState().reset()
    useGameStore.getState().loadSave(save, playthroughRecord(), {})
    expect(useGameStore.getState().facts).toEqual([fact()])
  })

  it('loads a save from before facts with none', () => {
    useGameStore.getState().fileFacts([fact()], [])
    const save = JSON.parse(JSON.stringify(useGameStore.getState().toGameSave())) as GameSave
    delete save.facts

    useGameStore.getState().reset()
    useGameStore.getState().loadSave(save, playthroughRecord(), {})
    expect(useGameStore.getState().facts).toEqual([])
  })
})
