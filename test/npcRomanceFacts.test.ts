import { describe, expect, it } from 'vitest'
import { pairKeyOf } from '@shared/npcRelationships'
import {
  directedKeyOf,
  emptyNpcRomance,
  REJECTION_COOLDOWN_DAYS,
  type NpcRomanceMap
} from '@shared/npcRomance'
import { npcRomanceFactsOf } from '../src/renderer/prompts/npcRelationship'

/**
 * The romance a prompt carries is picked before it is worded: a secret crush that reaches a prompt
 * for somebody who could not know it lets the writer spill it, and a couple left out lets it write
 * one of them single. Pins which facts are picked, never how they read.
 */

const TODAY = 40

const map: NpcRomanceMap = {
  ...emptyNpcRomance(),
  couples: { [pairKeyOf('a', 'b')]: { since: 10 } },
  exes: { [pairKeyOf('c', 'd')]: { since: 2, ended: 20 } },
  crushes: { e: { to: 'lover', since: 30 }, f: { to: 'a', since: 31 } },
  rejections: {
    [directedKeyOf('g', 'h')]: { date: TODAY - 1 },
    [directedKeyOf('h', 'e')]: { date: TODAY - REJECTION_COOLDOWN_DAYS },
    [directedKeyOf('x', 'y')]: { date: TODAY - 1 }
  }
}

describe('what the romance section picks', () => {
  it('carries every couple and every ex, whoever is present', () => {
    const facts = npcRomanceFactsOf(map, [], [], TODAY)
    expect(facts.couples).toEqual([{ a: 'a', b: 'b', since: 10 }])
    expect(facts.exes).toEqual([{ a: 'c', b: 'd', since: 2, ended: 20 }])
  })

  it('carries a crush only when its holder is present, never when its object alone is', () => {
    expect(npcRomanceFactsOf(map, ['a', 'lover'], [], TODAY).crushes).toEqual([])
    expect(npcRomanceFactsOf(map, ['f'], [], TODAY).crushes).toEqual([
      { from: 'f', to: 'a', since: 31 }
    ])
  })

  it('carries a turn-down inside the wait, with either of the two present', () => {
    expect(npcRomanceFactsOf(map, ['g'], [], TODAY).rejections).toEqual([
      { from: 'g', to: 'h', date: TODAY - 1 }
    ])
    expect(npcRomanceFactsOf(map, ['h'], [], TODAY).rejections).toEqual([
      { from: 'g', to: 'h', date: TODAY - 1 }
    ])
    // The wait is over for h's declaration to e, and neither x nor y is present.
    expect(npcRomanceFactsOf(map, ['e'], [], TODAY).rejections).toEqual([])
  })

  it('warns of a present crush on the reader’s lover, and of no other', () => {
    expect(npcRomanceFactsOf(map, ['e', 'f'], ['lover'], TODAY).jealous).toEqual([
      { from: 'e', lover: 'lover' }
    ])
    expect(npcRomanceFactsOf(map, ['e', 'f'], [], TODAY).jealous).toEqual([])
    expect(npcRomanceFactsOf(map, ['f'], ['lover'], TODAY).jealous).toEqual([])
  })

  it('carries nothing from a save without the map', () => {
    expect(npcRomanceFactsOf(undefined, ['a'], [], TODAY)).toEqual({
      couples: [],
      exes: [],
      crushes: [],
      rejections: [],
      jealous: [],
      drifting: [],
      rivals: []
    })
  })
})
