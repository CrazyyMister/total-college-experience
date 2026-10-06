import { describe, expect, it } from 'vitest'
import {
  castWhoSawAll,
  encounterOf,
  encountersOf,
  historyLineOf
} from '@shared/encounters'
import type { Encounter, Encounters, IntimateAct } from '@shared/types'

function encounter(over: Partial<Encounter> = {}): Encounter {
  return { who: ['a'], saw: ['a'], summary: 'They talked.', ...over }
}

const kiss = (inPublic: boolean, ...charIds: string[]): IntimateAct => ({
  kind: 'kiss',
  inPublic,
  charIds
})

describe('historyLineOf', () => {
  // The history line stored before encounters existed was `[summary, ...stood].join(' ')`.
  it('rejoins a summary and its stood-up lines exactly as the history always read', () => {
    const summary = 'He stayed in.'
    const stood = [
      "The reader didn't show up for Dinner with Sarah.",
      "The reader didn't show up for Gym with Mina, Joy."
    ]
    for (const lines of [[], stood.slice(0, 1), stood]) {
      expect(historyLineOf(summary, lines.join(' '))).toBe([summary, ...lines].join(' '))
    }
  })
})

describe('castWhoSawAll', () => {
  const cast = ['a', 'b', 'c']

  it('takes out whoever left the scene', () => {
    expect(castWhoSawAll(cast, ['b'], [])).toEqual(['a', 'c'])
  })

  it('takes out whoever a private act went on without, and keeps those in it', () => {
    expect(castWhoSawAll(cast, [], [kiss(false, 'a', 'b')])).toEqual(['a', 'b'])
  })

  it('keeps everybody for a public act, whoever was in it', () => {
    expect(castWhoSawAll(cast, [], [kiss(true, 'a')])).toEqual(cast)
  })

  it('applies both rules together', () => {
    expect(castWhoSawAll(cast, ['a'], [kiss(false, 'a', 'b')])).toEqual(['b'])
  })
})

describe('encounterOf', () => {
  it('files nothing for a scene with nobody in it', () => {
    expect(encounterOf([], [], null, 'He walked.', '')).toBeNull()
  })

  it('keeps the whole cast, and as `saw` only those of it who saw', () => {
    expect(encounterOf(['a', 'b'], ['a', 'z'], 'library', 'S.', '')).toEqual({
      who: ['a', 'b'],
      saw: ['a'],
      where: 'library',
      summary: 'S.'
    })
  })

  it('leaves out an absent place and absent plans, as every optional is', () => {
    const filed = encounterOf(['a'], ['a'], null, 'S.', "The reader didn't show up.")
    expect(filed).toEqual({
      who: ['a'],
      saw: ['a'],
      summary: 'S.',
      absent: "The reader didn't show up."
    })
    expect('where' in (filed as Encounter)).toBe(false)
  })
})

describe('encountersOf', () => {
  const held: Encounters = {
    5: { 1: encounter({ summary: 'Five night.' }), 0: encounter({ summary: 'Five day.' }) },
    2: { 0: encounter({ who: ['a', 'b'], saw: ['a', 'b'], where: 'quad', summary: 'Two.' }) },
    4: { 0: encounter({ who: ['b'], saw: ['b'], summary: 'Not hers.' }) }
  }

  it('lists only hers, ordered by day and then slot whatever order they were filed in', () => {
    expect(encountersOf('a', held).map(({ date, time }) => [date, time])).toEqual([
      [2, 0],
      [5, 0],
      [5, 1]
    ])
  })

  it('names the others there and the place, and lists nothing for nobody', () => {
    expect(encountersOf('a', held)[0]).toEqual({
      date: 2,
      time: 0,
      where: 'quad',
      with: ['b'],
      text: 'Two.'
    })
    expect(encountersOf('nobody', held)).toEqual([])
    expect(encountersOf('a', undefined)).toEqual([])
  })

  it('keeps the latest `limit`, and the summary on the newest half of them rounded up', () => {
    const many: Encounters = {}
    for (let day = 0; day < 8; day++) many[day] = { 0: encounter({ summary: `Day ${day}.` }) }
    const listed = encountersOf('a', many, 5)
    expect(listed.map(({ date }) => date)).toEqual([3, 4, 5, 6, 7])
    expect(listed.map(({ text }) => text)).toEqual([null, null, 'Day 5.', 'Day 6.', 'Day 7.'])
  })

  it('gives no summary for a scene she did not see whole, in any position', () => {
    const mixed: Encounters = {
      0: { 0: encounter({ who: ['a', 'b'], saw: ['b'] }) },
      1: { 0: encounter({ who: ['a', 'b'], saw: ['b'] }) }
    }
    expect(encountersOf('a', mixed, 5).map(({ text }) => text)).toEqual([null, null])
  })

  it('is the same list for the same input', () => {
    expect(encountersOf('a', held, 3)).toEqual(encountersOf('a', structuredClone(held), 3))
  })
})
