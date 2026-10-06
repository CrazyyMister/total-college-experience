import { globalSlotOf } from './jobs'
import { dedupedMemoriesFor } from './relationship'
import type {
  BreakthroughUse,
  CharInfo,
  CharMemory,
  MemoryMoment,
  MemoryType,
  SceneBreakthrough
} from './types'

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

/** The latest of the uses filed on a character, or undefined where she has none. */
export function lastBreakthroughUse(
  uses: readonly BreakthroughUse[] | undefined
): MemoryMoment | undefined {
  let last: BreakthroughUse | undefined
  for (const use of uses ?? []) {
    if (!last || globalSlotOf(use.date, use.time) > globalSlotOf(last.date, last.time)) last = use
  }
  return last && { date: last.date, time: last.time }
}

/**
 * Her meter as it stands in the scene under way: a use made in it counts as the latest, so
 * nothing filed up to this half of the day is left to count even before the boundary files it.
 */
export function breakthroughMeterNow(
  info: Pick<CharInfo, 'memories' | 'textMemory' | 'jealousyMemories' | 'giftMemories' | 'breakthroughUses'> | undefined,
  charId: string,
  sceneUses: readonly SceneBreakthrough[],
  now: MemoryMoment
): number {
  const filed = lastBreakthroughUse(info?.breakthroughUses)
  const inScene = sceneUses.some((use) => use.charId === charId)
  const last =
    inScene && (!filed || globalSlotOf(now.date, now.time) > globalSlotOf(filed.date, filed.time))
      ? now
      : filed
  return breakthroughMeterOf(info, last)
}

/** Whether the reader may use her Breakthrough: his to know, full, and not yet used in this scene. */
export function breakthroughReady(
  info:
    | Pick<
        CharInfo,
        'memories' | 'textMemory' | 'jealousyMemories' | 'giftMemories' | 'breakthroughUses' | 'nameKnown'
      >
    | undefined,
  charId: string,
  sceneUses: readonly SceneBreakthrough[],
  now: MemoryMoment
): boolean {
  if (info?.nameKnown !== true) return false
  if (sceneUses.some((use) => use.charId === charId)) return false
  return breakthroughMeterNow(info, charId, sceneUses, now) >= METER_MAX
}

/** The scene's uses with one more, or null where she already has one in this scene. */
export function withSceneBreakthrough(
  uses: readonly SceneBreakthrough[],
  entry: SceneBreakthrough
): SceneBreakthrough[] | null {
  if (uses.some((use) => use.charId === entry.charId)) return null
  return [...uses, entry]
}

/**
 * The uses left once the transcript is cut to `length`, or null when every use survives: a use
 * stands only while the action that made it does.
 */
export function breakthroughsWithin(
  uses: readonly SceneBreakthrough[],
  length: number
): SceneBreakthrough[] | null {
  const kept = uses.filter((use) => use.at < length)
  return kept.length === uses.length ? null : kept
}

/** The uses made by the action that is the transcript's last line: the ones this turn's prompt carries. */
export function breakthroughsOfTurn(
  uses: readonly SceneBreakthrough[],
  transcriptLength: number
): SceneBreakthrough[] {
  return uses.filter((use) => use.at === transcriptLength - 1)
}

/**
 * The uses filed on her with the scene's use added, or null when one at that half of the day is
 * already there, so a boundary run twice files it once.
 */
export function withBreakthroughUse(
  uses: readonly BreakthroughUse[] | undefined,
  use: BreakthroughUse
): BreakthroughUse[] | null {
  const filed = uses ?? []
  if (filed.some((entry) => entry.date === use.date && entry.time === use.time)) return null
  return [...filed, use]
}
