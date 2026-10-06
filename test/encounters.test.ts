import { describe, expect, it } from 'vitest'
import {
  castWhoSawAll,
  encounterOf,
  encounterEntriesOf,
  encountersOf,
  historyLineOf,
  withEncounterSummary,
  withoutFromEncounter
} from '@shared/encounters'
import type { Encounter, Encounters, GameHistory, IntimateAct } from '@shared/types'

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

describe('editing an encounter from her page', () => {
  const absent = "The reader didn't show up for Dinner with Sarah."
  const held: Encounters = {
    3: { 1: encounter({ who: ['a', 'b'], saw: ['a'], summary: 'They talked.', absent }) }
  }
  const history: GameHistory = { 3: { 0: 'Day.', 1: historyLineOf('They talked.', absent) } }

  it('lists her scenes newest first, whole', () => {
    const many: Encounters = {
      1: { 0: encounter() },
      4: { 0: encounter({ who: ['b'] }), 1: encounter() },
      2: { 1: encounter() }
    }
    expect(encounterEntriesOf('a', many).map(({ date, time }) => [date, time])).toEqual([
      [4, 1],
      [2, 1],
      [1, 0]
    ])
  })

  it('rewrites the summary and recomposes the history line with the stood-up lines kept', () => {
    const edited = withEncounterSummary(held, history, 3, 1, 'They argued.')
    expect(edited?.encounters[3]?.[1]).toEqual({ ...held[3][1], summary: 'They argued.' })
    // What the calendar and the slot opening read.
    expect(edited?.history[3]?.[1]).toBe(`They argued. ${absent}`)
    expect(edited?.history[3]?.[0]).toBe('Day.')
  })

  it('changes nothing for words that are the same, an empty text or a scene never filed', () => {
    expect(withEncounterSummary(held, history, 3, 1, 'They talked.')).toBeNull()
    expect(withEncounterSummary(held, history, 3, 1, '   ')).toBeNull()
    expect(withEncounterSummary(held, history, 3, 0, 'Nothing.')).toBeNull()
    expect(withEncounterSummary(undefined, history, 3, 1, 'Nothing.')).toBeNull()
  })

  it('opens and saves a recap longer than a thousand characters without losing any of it', () => {
    const long = `${'The reader and Ann walked the quad. '.repeat(40)}End.`
    expect(long.length).toBeGreaterThan(1000)
    const filed: Encounters = { 3: { 1: encounter({ summary: long }) } }
    // Saved as it stood, nothing is written.
    expect(withEncounterSummary(filed, { 3: { 1: long } }, 3, 1, long)).toBeNull()
    // And an edit past the old length is kept whole.
    const longer = `${long} More.`
    const edited = withEncounterSummary(filed, { 3: { 1: long } }, 3, 1, longer)
    expect(edited?.encounters[3]?.[1]?.summary).toBe(longer)
    expect(edited?.history[3]?.[1]).toBe(longer)
  })

  it('takes her out of who and saw and keeps the text for the rest', () => {
    const left = withoutFromEncounter(held, 3, 1, 'a')
    expect(left?.[3]?.[1]).toEqual({ ...held[3][1], who: ['b'], saw: [] })
    expect(encounterEntriesOf('a', left ?? undefined)).toEqual([])
    expect(encountersOf('b', left ?? undefined)[0]?.with).toEqual([])
  })

  it('drops the entry, and its day, when nobody is left, and does nothing for somebody who was not there', () => {
    const alone: Encounters = { 3: { 1: encounter({ who: ['a'], saw: ['a'] }) } }
    expect(withoutFromEncounter(alone, 3, 1, 'a')).toEqual({})
    expect(withoutFromEncounter(held, 3, 1, 'z')).toBeNull()
    expect(withoutFromEncounter(held, 3, 0, 'a')).toBeNull()
    const two: Encounters = { 3: { 0: encounter(), 1: encounter() } }
    expect(Object.keys(withoutFromEncounter(two, 3, 0, 'a')?.[3] ?? {})).toEqual(['1'])
  })
})
