import { describe, expect, it } from 'vitest'
import {
  isMoodHomebound,
  isMoodLustful,
  MOOD_CYCLE_LENGTH,
  moodIndexOf
} from '../src/renderer/prompts/moods'

/**
 * The mood table is a hand-written thirty-day list every character is indexed
 * into by a date and an offset, so a bad wrap is wrong silently.
 */

describe('moodIndexOf', () => {
  it('stays in range for a date before the offset', () => {
    // Floored modulo: a plain % would index backwards off the array.
    expect(moodIndexOf(-1, 0)).toBe(29)
    expect(moodIndexOf(-40, 0)).toBe(20)
  })
})

describe('isMoodHomebound', () => {
  it('keeps her in for the first three days of the cycle and the last one', () => {
    for (const index of [0, 1, 2, MOOD_CYCLE_LENGTH - 1]) {
      expect(isMoodHomebound(index, 0, 'woman')).toBe(true)
    }
  })

  it('lets her out on the days either side of those', () => {
    expect(isMoodHomebound(3, 0, 'woman')).toBe(false)
    expect(isMoodHomebound(MOOD_CYCLE_LENGTH - 2, 0, 'woman')).toBe(false)
  })

  it('reads the offset the same way the line does', () => {
    // Offset 7 puts date 23 on index 0, the worst day of the cycle.
    expect(moodIndexOf(23, 7)).toBe(0)
    expect(isMoodHomebound(23, 7, 'woman')).toBe(true)
    expect(isMoodHomebound(23, 0, 'woman')).toBe(false)
  })
})

describe('isMoodLustful', () => {
  it('holds for the normal column\'s two days and stops just outside them', () => {
    expect(isMoodLustful(13, 0, false, 'woman')).toBe(true)
    expect(isMoodLustful(14, 0, false, 'woman')).toBe(true)
    expect(isMoodLustful(12, 0, false, 'woman')).toBe(false)
    expect(isMoodLustful(15, 0, false, 'woman')).toBe(false)
  })

  it('holds for the wider moodSwings run and stops just outside it', () => {
    expect(isMoodLustful(12, 0, true, 'woman')).toBe(true)
    expect(isMoodLustful(15, 0, true, 'woman')).toBe(true)
    expect(isMoodLustful(11, 0, true, 'woman')).toBe(false)
    expect(isMoodLustful(16, 0, true, 'woman')).toBe(false)
  })

  it('reads the offset the same way moodIndexOf does', () => {
    // Offset 7 puts date 6 on index 13, the first lustful day.
    expect(moodIndexOf(6, 7)).toBe(13)
    expect(isMoodLustful(6, 7, false, 'woman')).toBe(true)
    expect(isMoodLustful(6, 0, false, 'woman')).toBe(false)
  })
})

/** A man has no cycle: were one read for him, he would stay in and turn lustful on its days. */
describe('a man', () => {
  it('is never kept in nor lustful by the cycle', () => {
    for (let date = 0; date < MOOD_CYCLE_LENGTH; date++) {
      expect(isMoodHomebound(date, 0, 'man')).toBe(false)
      expect(isMoodLustful(date, 0, true, 'man')).toBe(false)
    }
  })
})
