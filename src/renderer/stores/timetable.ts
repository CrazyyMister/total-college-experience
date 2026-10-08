import type { Haunt, Occasion, ShiftSlot, TimeSlot } from '@shared/types'
import type { NpcGroup } from '@shared/npcRelationships'
import { homeOf, type HomeId } from '@shared/homes'
import { shiftSlotOf } from '@shared/jobs'
import { ROOM_LOCATION } from '@shared/locations'
import { classSlotOf, hauntClosedOn, jobClosedOn } from '../prompts/occasions'
import { charJobAt, shiftWeekdayOf } from '../prompts/gameDate'
import { isMoodHomebound } from '../prompts/moods'
import { isAwayForSpringBreak } from '../prompts/springBreak'
import { useGameStore } from './gameStore'

/**
 * The loops' shared timetable lookups: what is meeting right now, and who is sitting in
 * it.
 */

/**
 * The `ClassSlot` for a game slot, or null when nothing meets — the one bridge to the timetable.
 * Defaults to the clock; the scene-ending prefetch passes the *next* slot.
 */
export function currentSlot(date?: number, time?: TimeSlot): number | null {
  const game = useGameStore.getState()
  return classSlotOf(date ?? game.date, time ?? game.time, game.occasions)
}

/**
 * The class code `charId` is sitting in for a slot, defaulting to now, or null
 * — the roster's sibling of {@link playerClassNow}.
 */
export function charClassNow(charId: string, date?: number, time?: TimeSlot): string | null {
  const slot = currentSlot(date, time)
  if (slot === null) return null
  return useGameStore.getState().charInfo[charId]?.schedule?.[slot] ?? null
}

/** The class code the *player* is enrolled in for a slot, defaulting to now. */
export function playerClassNow(date?: number, time?: TimeSlot): string | null {
  const slot = currentSlot(date, time)
  if (slot === null) return null
  return useGameStore.getState().playerSchedule?.[slot] ?? null
}

/** The shift the reader is rostered for in a slot, defaulting to now, or null. */
export function shiftNow(date?: number, time?: TimeSlot): ShiftSlot | null {
  const game = useGameStore.getState()
  if (!game.job) return null
  const on = date ?? game.date
  if (jobClosedOn(game.job.jobId, on, game.occasions)) return null
  const slot = shiftSlotOf(shiftWeekdayOf(on), time ?? game.time)
  return game.job.shifts.includes(slot) ? slot : null
}

/**
 * The employer `charId` is working for in a slot, defaulting to now, or null — the
 * roster's half of {@link shiftNow} above.
 */
export function charJobNow(charId: string, date?: number, time?: TimeSlot): string | null {
  const game = useGameStore.getState()
  const on = date ?? game.date
  // Nobody works a shift from another country.
  if (charAwayNow(charId, on)) return null
  const jobId = charJobAt(game.charInfo[charId]?.job, on, time ?? game.time)
  return jobClosedOn(jobId, on, game.occasions) ? null : jobId
}

/** True while `charId` is off campus for spring break. */
export function charAwayNow(charId: string, date?: number): boolean {
  const game = useGameStore.getState()
  return isAwayForSpringBreak(game.springBreakAway, charId, date ?? game.date)
}

/** True when `charId` is somewhere she has to be — a class or a shift. */
export function charBusyNow(charId: string, date?: number, time?: TimeSlot): boolean {
  return charClassNow(charId, date, time) !== null || charJobNow(charId, date, time) !== null
}

/** True when `charId` cannot be in a scene at all — busy above, or off campus. */
export function charUnavailableNow(charId: string, date?: number, time?: TimeSlot): boolean {
  return charBusyNow(charId, date, time) || charAwayNow(charId, date)
}

/** The group event held on a half-day, or undefined for a half-day none is held on. */
export function groupEventAt(date: number, time: TimeSlot): Occasion | undefined {
  return useGameStore
    .getState()
    .occasions.find(
      (occasion) =>
        occasion.group !== undefined &&
        occasion.where !== undefined &&
        date >= occasion.startDate &&
        date <= occasion.endDate &&
        (occasion.time === null || occasion.time === time)
    )
}

/**
 * Her **standing** haunt this slot, before anything the slot itself did to it, or null for a
 * slot her week says nothing about. On the night of her group's event that is the event's place,
 * ahead of whatever her week holds.
 */
export function charStandingHauntAt(charId: string, date: number, time: TimeSlot): Haunt | null {
  const game = useGameStore.getState()
  const event = groupEventAt(date, time)
  const inEvent =
    event?.group !== undefined &&
    event.where !== undefined &&
    game.charInfo[charId]?.groups?.includes(event.group) === true
  const haunt = inEvent
    ? { location: event.where as string, kind: 'team' as const }
    : game.charInfo[charId]?.hiddenSchedule?.[shiftSlotOf(shiftWeekdayOf(date), time)]
  if (!haunt) return null
  // A class or a shift outranks a haunt: a save whose timetable moved under it (add/drop).
  if (charBusyNow(charId, date, time)) return null
  if (hauntClosedOn(haunt.location, haunt.kind, date, game.occasions)) return null
  return haunt
}

/**
 * The group `charId` is spending a slot in, or null. An overlay stamped for a different
 * slot answers nothing.
 */
export function charOverlayGroupNow(
  charId: string,
  date?: number,
  time?: TimeSlot
): NpcGroup | null {
  const game = useGameStore.getState()
  const overlay = game.npcOverlay
  if (!overlay) return null
  if (overlay.date !== (date ?? game.date) || overlay.time !== (time ?? game.time)) return null
  return overlay.groups.find((group) => group.members.includes(charId)) ?? null
}

/**
 * The home of the room `charId` is spending this slot in: the host's, when an overlay group
 * pulled her into somebody else's room, otherwise her own. Only meaningful on a slot whose
 * hidden location is `'room'`.
 */
export function charRoomHomeNow(
  charId: string,
  date?: number,
  time?: TimeSlot
): HomeId | undefined {
  const group = charOverlayGroupNow(charId, date, time)
  const host = group?.location === ROOM_LOCATION && group.host ? group.host : charId
  return homeOf(useGameStore.getState(), host)
}

/**
 * Where `charId` actually is this slot — a location id, `'room'`, or null for a slot nothing
 * places her in.
 */
export function charHiddenLocationNow(
  charId: string,
  date?: number,
  time?: TimeSlot
): string | null {
  const game = useGameStore.getState()
  const on = date ?? game.date
  const half = time ?? game.time
  if (charBusyNow(charId, on, half)) return null
  // Before the homebound branch, load-bearing: a girl abroad is not in her dorm room.
  if (charAwayNow(charId, on)) return null
  const gender = game.characters[charId]?.gender ?? 'woman'
  if (isMoodHomebound(on, game.charInfo[charId]?.moodCycleOffset ?? 0, gender)) return ROOM_LOCATION
  return (
    charOverlayGroupNow(charId, on, half)?.location ??
    charStandingHauntAt(charId, on, half)?.location ??
    null
  )
}

/**
 * Her standing haunt only while she is actually at it — a host still studying where she pulled
 * her friends, never a homebound girl or one pulled somewhere else — or null.
 */
export function charStandingHauntNow(charId: string, date?: number, time?: TimeSlot): Haunt | null {
  const game = useGameStore.getState()
  const on = date ?? game.date
  const half = time ?? game.time
  const haunt = charStandingHauntAt(charId, on, half)
  const location = charHiddenLocationNow(charId, on, half)
  return haunt && location === haunt.location ? haunt : null
}
