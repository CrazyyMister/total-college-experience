import { globalSlotOf } from './jobs'
import { dedupedMemoriesFor } from './relationship'
import type { CharInfo, CharMemory, MemoryMoment, MemoryType } from './types'

/** The Breakthrough meter: what a character's memories since the reader's last push add up to. */

/** What one memory adds to its half of a day; hated takes away. */
const WEIGHTS: Record<MemoryType, number> = { loved: 20, liked: 10, disliked: 0, hated: -15 }

/** The most one half of a day adds, however many memories it holds. */
const PERIOD_CAP = 20

/** The meter's ceiling; it never goes below 0. */
export const METER_MAX = 100

/**
 * The meter off a list of memories. Each half of a day adds up its memories' weights and keeps at
 * most {@link PERIOD_CAP} of them, with no floor; the halves are summed oldest first, kept between
 * 0 and {@link METER_MAX} after each. A memory with no half counts for nothing, and only the ones
 * filed strictly after `lastUse` count at all.
 */
export function breakthroughMeter(
  memories: readonly CharMemory[],
  lastUse?: MemoryMoment
): number {
  const after = lastUse ? globalSlotOf(lastUse.date, lastUse.time) : -Infinity
  const periods = new Map<number, number>()
  for (const memory of memories) {
    if (memory.time === undefined) continue
    const slot = globalSlotOf(memory.date, memory.time)
    if (slot <= after) continue
    periods.set(slot, (periods.get(slot) ?? 0) + (WEIGHTS[memory.type] ?? 0))
  }
  let total = 0
  for (const slot of [...periods.keys()].sort((a, b) => a - b)) {
    const added = Math.min(PERIOD_CAP, periods.get(slot) ?? 0)
    total = Math.min(METER_MAX, Math.max(0, total + added))
  }
  return total
}

/** {@link breakthroughMeter} over every list a character keeps memories in, folded as every reader reads them. */
export function breakthroughMeterOf(
  info: Pick<CharInfo, 'memories' | 'textMemory' | 'jealousyMemories' | 'giftMemories'> | undefined,
  lastUse?: MemoryMoment
): number {
  return breakthroughMeter(dedupedMemoriesFor(info), lastUse)
}
