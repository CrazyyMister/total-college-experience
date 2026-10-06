import { describe, expect, it } from 'vitest'
import { breakthroughMeter, breakthroughMeterOf, METER_MAX } from '@shared/breakthrough'
import type { CharMemory, MemoryType, TimeSlot } from '@shared/types'

/**
 * The Breakthrough meter is worked out afresh from the memories every time it is read, so a wrong
 * weight, cap or boundary shows up on every contact's page and nowhere it can be seen coming.
 */

/** One memory on `date`'s half `time`; `time` left out is a memory filed before the halves were kept. */
function memory(
  type: MemoryType,
  date: number,
  time?: TimeSlot,
  desc = `${type} on ${date}`
): CharMemory {
  return { date, ...(time !== undefined ? { time } : {}), type, desc }
}

describe('breakthroughMeter', () => {
  it('weighs each verb', () => {
    expect(breakthroughMeter([memory('loved', 1, 0)])).toBe(20)
    expect(breakthroughMeter([memory('liked', 1, 0)])).toBe(10)
    expect(breakthroughMeter([memory('disliked', 1, 0)])).toBe(0)
    expect(breakthroughMeter([memory('loved', 1, 0), memory('hated', 2, 0)])).toBe(5)
  })

  it('keeps at most 20 from one half of a day however many memories it holds', () => {
    const crowd = [memory('loved', 1, 0), memory('loved', 1, 0, 'b'), memory('liked', 1, 0, 'c')]
    expect(breakthroughMeter(crowd)).toBe(20)
  })

  it('sums a half of a day before it caps it, so a hated one inside it takes away first', () => {
    const mixed = [memory('loved', 1, 0), memory('loved', 1, 0, 'b'), memory('hated', 1, 0, 'c')]
    // 20 + 20 - 15 = 25, capped to 20; capping each memory first would have left 5.
    expect(breakthroughMeter(mixed)).toBe(20)
  })

  it('counts the day and the night of one day as two halves', () => {
    expect(breakthroughMeter([memory('loved', 1, 0), memory('loved', 1, 1, 'b')])).toBe(40)
  })

  it('has no floor inside a half of a day and keeps the total at 0 between the halves', () => {
    expect(breakthroughMeter([memory('hated', 1, 0)])).toBe(0)
    // The first half cannot dig a hole the second has to fill.
    expect(breakthroughMeter([memory('hated', 1, 0), memory('liked', 2, 0)])).toBe(10)
  })

  it('stops at 100', () => {
    const many = Array.from({ length: 8 }, (_, at) => memory('loved', at + 1, 0))
    expect(breakthroughMeter(many)).toBe(METER_MAX)
    // And a later bad half takes away from the 100, not from what would have been.
    expect(breakthroughMeter([...many, memory('hated', 9, 0)])).toBe(METER_MAX - 15)
  })

  it('counts nothing for a memory with no half of a day', () => {
    expect(breakthroughMeter([memory('loved', 1)])).toBe(0)
    expect(breakthroughMeter([memory('loved', 1), memory('liked', 2, 0)])).toBe(10)
  })

  it('counts only what comes strictly after the last use', () => {
    const memories = [memory('loved', 3, 0), memory('liked', 3, 1), memory('loved', 4, 0)]
    expect(breakthroughMeter(memories, { date: 3, time: 0 })).toBe(30)
    // The half of a day the use was in is behind it, whatever else that half held.
    expect(breakthroughMeter(memories, { date: 3, time: 1 })).toBe(20)
    expect(breakthroughMeter(memories, { date: 4, time: 0 })).toBe(0)
  })
})

describe('breakthroughMeterOf', () => {
  it('reads every list she keeps memories in, each once', () => {
    const shared = memory('liked', 1, 0, 'she kept it twice')
    const info = {
      memories: [shared, memory('liked', 2, 0)],
      textMemory: memory('liked', 3, 0),
      jealousyMemories: [memory('hated', 4, 0)],
      giftMemories: [{ ...shared }, memory('loved', 5, 0)]
    }
    // 10 + 10 + 10, then the hated half takes 15 off, then the gift adds 20.
    expect(breakthroughMeterOf(info)).toBe(35)
  })

  it('is empty for somebody with no entry', () => {
    expect(breakthroughMeterOf(undefined)).toBe(0)
  })
})
