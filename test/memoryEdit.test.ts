import { describe, expect, it } from 'vitest'
import type { CharMemory, Fact, MemoryMoment, MemoryType } from '@shared/types'
import {
  factsOfAnswers,
  learnedOfAnswers,
  memoryEditRows,
  memoryEditsOf,
  type FactAnswer,
  type MemoryAnswer,
  type MemoryEditRow
} from '../src/renderer/stores/loop/memoryEdit'

/**
 * The boundary's memory question: a row standing for the wrong memory, or an answer read as the
 * wrong edit, rewrites or forgets a memory the player never touched, and the save keeps it.
 */

const WHEN: MemoryMoment = { date: 9, time: 1 }

describe('memoryEditRows lines up one row per memory the ledger filed', () => {
  it('keeps cast order and gives a girl the ledger said nothing about a blank row', () => {
    const rows = memoryEditRows(
      ['a', 'b', 'c'],
      [
        { charId: 'c', type: 'liked', desc: 'the reader was kind' },
        { charId: 'a', type: 'hated', desc: 'the reader was late' },
        { charId: 'a', type: 'liked', desc: 'the reader apologised' }
      ],
      WHEN
    )
    expect(rows).toEqual([
      { charId: 'a', applied: { date: 9, time: 1, type: 'hated', desc: 'the reader was late' } },
      { charId: 'a', applied: { date: 9, time: 1, type: 'liked', desc: 'the reader apologised' } },
      { charId: 'b', applied: null },
      { charId: 'c', applied: { date: 9, time: 1, type: 'liked', desc: 'the reader was kind' } }
    ])
  })

  it('folds a memory filed twice into one row', () => {
    const filed = { charId: 'a', type: 'liked' as const, desc: 'the reader was kind' }
    expect(memoryEditRows(['a'], [filed, { ...filed }], WHEN)).toHaveLength(1)
  })

  it('appends a girl the ledger filed for who is not in the cast', () => {
    const rows = memoryEditRows(['a'], [{ charId: 'z', type: 'liked', desc: 'x' }], WHEN)
    expect(rows.map((row) => row.charId)).toEqual(['a', 'z'])
  })
})

describe('memoryEditsOf reads each answer as the edit it makes', () => {
  const filed: CharMemory = { date: 4, time: 0, type: 'liked', desc: 'the reader was kind' }
  const rows: MemoryEditRow[] = [
    { charId: 'a', applied: filed },
    { charId: 'b', applied: null }
  ]
  const answer = (type: MemoryType, desc: string): MemoryAnswer => ({ type, desc })

  it('makes no edit for an answer left as it was filed', () => {
    const answers = [answer('liked', 'the reader was kind'), answer('liked', '')]
    expect(memoryEditsOf(rows, answers, WHEN)).toEqual([])
  })

  it('rewrites a memory whose verb alone changed, keeping its day and half of the day', () => {
    const answers = [answer('loved', 'the reader was kind'), answer('liked', ' ')]
    expect(memoryEditsOf(rows, answers, WHEN)).toEqual([
      {
        charId: 'a',
        match: filed,
        next: { date: 4, time: 0, type: 'loved', desc: 'the reader was kind' }
      }
    ])
  })

  it('forgets a memory whose words were blanked', () => {
    const answers = [answer('liked', '  '), answer('liked', '')]
    expect(memoryEditsOf(rows, answers, WHEN)).toEqual([{ charId: 'a', match: filed, next: null }])
  })

  it('records a filled blank row on the boundary’s slot, typed words in the reader’s voice', () => {
    const answers = [answer('liked', 'the reader was kind'), answer('disliked', 'you were late')]
    expect(memoryEditsOf(rows, answers, WHEN)).toEqual([
      {
        charId: 'b',
        match: null,
        next: { date: 9, time: 1, type: 'disliked', desc: 'the reader was late' }
      }
    ])
  })
})

describe('factsOfAnswers reads each answer as the fact it leaves', () => {
  const fact = (about: string, knownBy: string[]): Fact => ({
    id: `d9t1n${about}`,
    about,
    category: 'family',
    text: 'has a sister',
    kind: 'happened',
    knownBy,
    date: 9,
    time: 1
  })
  const answer = (over: Partial<FactAnswer> = {}): FactAnswer => ({
    text: 'has a sister',
    category: 'family',
    kind: 'happened',
    knownBy: ['a'],
    ...over
  })
  const cast = ['a', 'b', 'c']

  it('drops a fact whose words were cleared and keeps the others', () => {
    const rows = [fact('a', ['a']), fact('b', ['b'])]
    const kept = factsOfAnswers(rows, [answer({ text: '   ' }), answer({ knownBy: ['b'] })], cast)
    expect(kept.map((one) => one.id)).toEqual(['d9t1nb'])
  })

  it('takes the corrected words, category and kind, in the voice of "the reader"', () => {
    const [kept] = factsOfAnswers(
      [fact('a', ['a'])],
      [answer({ text: 'is afraid of you', category: 'secrets', kind: 'said' })],
      cast
    )
    expect(kept).toMatchObject({ text: 'is afraid of the reader', category: 'secrets', kind: 'said' })
  })

  it('knows it to whoever of the scene is ticked and always to the person it is about', () => {
    const [kept] = factsOfAnswers([fact('a', ['a'])], [answer({ knownBy: ['c', 'zed'] })], cast)
    expect(kept.knownBy).toEqual(['a', 'c'])
  })

  it('leaves a fact about the reader to exactly whoever is ticked', () => {
    const [kept] = factsOfAnswers(
      [fact('reader', ['b'])],
      [answer({ knownBy: ['c'] })],
      cast
    )
    expect(kept.knownBy).toEqual(['c'])
  })
})

describe('learnedOfAnswers', () => {
  it('keeps the rows left ticked, and every row without an answer', () => {
    const rows = [
      { factId: 'f1', charId: 'a' },
      { factId: 'f2', charId: 'b' },
      { factId: 'f3', charId: 'c' }
    ]
    expect(learnedOfAnswers(rows, [true, false])).toEqual([rows[0], rows[2]])
  })
})
