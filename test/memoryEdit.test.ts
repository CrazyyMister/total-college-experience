import { describe, expect, it } from 'vitest'
import type { CharMemory, MemoryMoment, MemoryType } from '@shared/types'
import {
  memoryEditRows,
  memoryEditsOf,
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
