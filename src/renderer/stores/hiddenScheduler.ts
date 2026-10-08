import { classSlotForShift, jobDefOf, SHIFT_SLOTS } from '@shared/jobs'
import {
  GROCERY_LOCATION,
  isLocationOpen,
  locationCapacity,
  locationLabel,
  ROOM_LOCATION
} from '@shared/locations'
import { shuffle } from '@shared/shuffle'
import type {
  CharJob,
  Haunt,
  HiddenScheduleAssignment,
  LeftOutEntry,
  LeftOutReason,
  ShiftSlot
} from '@shared/types'

/** Deals every character's standing haunts into the week. */

/** What one character brings into the deal. */
export interface HiddenScheduleInput extends HiddenScheduleAssignment {
  /** Her class timetable, keyed by `ClassSlot` — the first ten shift slots. */
  schedule: Record<number, string>
  /** Her job, if she holds one; its shifts are hers and its place is taken. */
  job?: CharJob
}

/** Keyed by charId, each a sparse `ShiftSlot` → the haunt she keeps in it. */
export type HiddenScheduleResult = Record<string, Record<number, Haunt>>

/** A group's sessions, held for all its members before anybody's own haunts are dealt. */
export interface GroupReservation {
  location: string
  members: readonly string[]
  slots: readonly ShiftSlot[]
}

/** One deal: every character's week, and what each week could not place, both keyed by charId. */
export interface HiddenScheduleDeal {
  weeks: HiddenScheduleResult
  leftOut: Record<string, LeftOutEntry[]>
}

/** What the log and the F9 say of one thing the deal could not place. */
export function leftOutLine(entry: LeftOutEntry): string {
  if (entry.kind === 'week') return 'nothing placed in her whole week'
  const place = locationLabel(entry.place)
  switch (entry.reason) {
    case 'busy':
      return `${entry.kind} at ${place}: no free period left in her week`
    case 'closed':
      return `${entry.kind} at ${place}: shut in every period she was free`
    case 'full':
      return `${entry.kind} at ${place}: full in every period she was free`
    case 'no_shift':
      return `shifts at ${place}: none fit her classes and the closures`
    case 'short_shifts':
      return `shifts at ${place}: fewer fit than the profile asked for`
    default:
      return `${entry.kind} at ${place}`
  }
}

/**
 * One deal. `inputs` is keyed by charId; the order served is shuffled per pass. A place takes as
 * many characters in a slot as its capacity allows, and whatever a character's week could not
 * place comes back beside it with the reason. A group's sessions come first: the place is its
 * alone for the slot, and a member with a class or a shift then keeps that and misses the session.
 */
export function buildHiddenSchedules(
  inputs: Record<string, HiddenScheduleInput>,
  reservations: readonly GroupReservation[] = []
): HiddenScheduleDeal {
  const charIds = Object.keys(inputs)
  const result: HiddenScheduleResult = {}
  const leftOut: Record<string, LeftOutEntry[]> = {}
  for (const charId of charIds) {
    result[charId] = {}
    leftOut[charId] = []
  }

  /** How many characters are already spoken for at each location, per slot. Shifts go in first. */
  const occupancy = new Map<number, Map<string, number>>()
  const occupy = (slot: number, location: string): void => {
    const held = occupancy.get(slot) ?? new Map<string, number>()
    held.set(location, (held.get(location) ?? 0) + 1)
    occupancy.set(slot, held)
  }
  /** The places a group's session holds whole, as `slot:location`. */
  const reserved = new Set<string>()
  const isFree = (slot: number, location: string): boolean =>
    !reserved.has(`${slot}:${location}`) &&
    (occupancy.get(slot)?.get(location) ?? 0) < locationCapacity(location)

  for (const charId of charIds) {
    const job = inputs[charId].job
    const locationId = job ? jobDefOf(job.jobId)?.locationId : undefined
    if (!job || !locationId) continue
    for (const slot of job.shifts) occupy(slot, locationId)
  }

  /** Slots this character already owes to a class, a shift or an earlier pass. */
  const busySlots = (charId: string): Set<number> => {
    const input = inputs[charId]
    const busy = new Set<number>(Object.keys(result[charId]).map(Number))
    for (const slot of input.job?.shifts ?? []) busy.add(slot)
    for (const slot of SHIFT_SLOTS) {
      const classSlot = classSlotForShift(slot)
      if (classSlot !== null && input.schedule[classSlot]) busy.add(slot)
    }
    return busy
  }

  /**
   * Places one haunt on one character's week, or gives up on it and says why. `exclusive`
   * is off for a room, which has no limit.
   */
  const place = (charId: string, haunt: Haunt, exclusive = true): void => {
    const busy = busySlots(charId)
    const free = SHIFT_SLOTS.filter((slot) => !busy.has(slot))
    const open = free.filter((slot) => isLocationOpen(haunt.location, slot))
    const pool = open.filter((slot) => !exclusive || isFree(slot, haunt.location))
    if (pool.length === 0) {
      const reason: LeftOutReason =
        free.length === 0 ? 'busy' : open.length === 0 ? 'closed' : 'full'
      leftOut[charId].push({ kind: haunt.kind, place: haunt.location, reason })
      return
    }
    const slot = shuffle(pool)[0] as ShiftSlot
    result[charId][slot] = haunt
    if (exclusive) occupy(slot, haunt.location)
  }

  // A group's sessions before every individual haunt, so no member's own week can take the
  // period or the place. Whoever is in class or on shift then is not asked to come.
  for (const reservation of reservations) {
    for (const slot of reservation.slots) {
      reserved.add(`${slot}:${reservation.location}`)
      for (const charId of reservation.members) {
        if (!result[charId] || busySlots(charId).has(slot)) continue
        result[charId][slot] = { location: reservation.location, kind: 'team' }
      }
    }
  }

  // Passes in priority order: fun, study, activity, the meal out, groceries, then nights in
  // take what is left.
  for (const charId of shuffle(charIds)) {
    for (const location of inputs[charId].fun) place(charId, { location, kind: 'fun' })
  }
  for (const charId of shuffle(charIds)) {
    const study = inputs[charId].study
    if (study) place(charId, { location: study, kind: 'study' })
  }
  for (const charId of shuffle(charIds)) {
    const activity = inputs[charId].activity
    if (activity) {
      place(charId, { location: activity.location, kind: 'activity', doing: activity.doing })
    }
  }
  for (const charId of shuffle(charIds)) {
    const meal = inputs[charId].meal
    if (meal) place(charId, { location: meal, kind: 'meal' })
  }
  for (const charId of shuffle(charIds)) {
    place(charId, { location: GROCERY_LOCATION, kind: 'grocery' })
  }
  for (const charId of shuffle(charIds)) {
    for (let i = 0; i < inputs[charId].homeSlots; i++) {
      place(charId, { location: ROOM_LOCATION, kind: 'room' }, false)
    }
  }

  return { weeks: result, leftOut }
}
