import type { Haunt, Occasion, ShiftSlot, TimeSlot } from '@shared/types'
import { LAST_CLASS_DATE } from '@shared/classes'
import type { NpcGroup } from '@shared/npcRelationships'
import {
  GROUPS,
  groupsOfChar,
  PLEDGE_LAST_DAY,
  practiceHeld,
  type GroupDef,
  type GroupId,
  type PracticeContext
} from '@shared/groups'
import { homeOf, type HomeId } from '@shared/homes'
import { greekWeekEventOf } from '@shared/greekWeek'
import { occasionHouses, type HouseId } from '@shared/houses'
import { globalSlotOf, shiftSlotOf, slotFromId } from '@shared/jobs'
import { ROOM_LOCATION } from '@shared/locations'
import { classSlotOf, closureOn, hauntClosedOn, jobClosedOn } from '../prompts/occasions'
import type { PracticeWeek } from '../prompts/scenePrompt'
import { charJobAt, formatGameDate, shiftWeekdayOf } from '../prompts/gameDate'
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
 * Whether a group's event holds the half-day at his team's place: his own team's, or another's
 * that shares the place, as the volleyball match shares the courts with basketball.
 */
function eventAtTeamPlace(groupId: GroupId, slotId: number): boolean {
  const { date, time } = slotFromId(slotId)
  return useGameStore
    .getState()
    .occasions.some(
      (occasion) =>
        ((occasion.group !== undefined &&
          (occasion.group === groupId || occasion.where === GROUPS[groupId].location)) ||
          (greekWeekEventOf(occasion.id) !== undefined &&
            occasion.where === GROUPS[groupId].location)) &&
        date >= occasion.startDate &&
        date <= occasion.endDate &&
        (occasion.time === null || occasion.time === time)
    )
}

/**
 * Whether the night of his initiation is this global slot, before and after he is a member: the
 * initiation outranks a shift, his team's practice, a pledge meeting and an event of his own
 * house, and costs him no strike for any of them, however often the boundary is replayed.
 */
export function initiationAt(slotId: number): boolean {
  return useGameStore.getState().groupHouse?.initiation?.slot === slotId
}

/**
 * What decides whether his team practices in a slot, read off the store: the one context the
 * clock's commitments and the strikes both judge a practice by.
 */
function practiceContext(): PracticeContext {
  const game = useGameStore.getState()
  const team = game.groupTeam
  return {
    shiftSlotAt: (slotId) => {
      const { date, time } = slotFromId(slotId)
      return shiftSlotOf(shiftWeekdayOf(date), time)
    },
    closedOn: (date) =>
      team ? hauntClosedOn(GROUPS[team.id].location, 'team', date, game.occasions) : true,
    eventAt: (slotId) => (team ? eventAtTeamPlace(team.id, slotId) : false),
    otherCommitmentAt: (slotId) => {
      const { date, time } = slotFromId(slotId)
      return playerClassNow(date, time) !== null || shiftNow(date, time) !== null || initiationAt(slotId)
    }
  }
}

/** Whether his team practices in a global slot. */
export function practiceHeldAt(slotId: number): boolean {
  const game = useGameStore.getState()
  const team = game.groupTeam
  if (!team) return false
  const sessions = game.groups[team.id]?.sessions ?? []
  return practiceHeld(team, sessions, slotId, practiceContext())
}

/** The label of a pledge meeting, in the calendar, the week the writer reads and the actions. */
const PLEDGE_MEETING_LABEL = 'pledge meeting'

/**
 * What decides whether his house meets in a slot, read off the store: a slot the university is
 * shut in, one that an event of his house or a game of his team holds, and one a class, a shift
 * or his team's practice holds. A pledge meeting is outranked by all of them and costs no strike.
 */
function meetingContext(): PracticeContext {
  const game = useGameStore.getState()
  const house = game.groupHouse?.id
  const team = game.groupTeam?.id
  return {
    shiftSlotAt: (slotId) => {
      const { date, time } = slotFromId(slotId)
      return shiftSlotOf(shiftWeekdayOf(date), time)
    },
    closedOn: (date) => closureOn(date, game.occasions) !== null,
    eventAt: (slotId) => {
      const { date, time } = slotFromId(slotId)
      return game.occasions.some(
        (occasion) =>
          date >= occasion.startDate &&
          date <= occasion.endDate &&
          (occasion.time === null || occasion.time === time) &&
          ((house !== undefined &&
            occasion.house !== undefined &&
            occasionHouses(occasion).includes(house)) ||
            (team !== undefined && occasion.group === team))
      )
    },
    otherCommitmentAt: (slotId) => {
      const { date, time } = slotFromId(slotId)
      return (
        playerClassNow(date, time) !== null ||
        shiftNow(date, time) !== null ||
        practiceHeldAt(slotId) ||
        initiationAt(slotId)
      )
    }
  }
}

/** Whether his house holds a pledge meeting in a global slot. */
export function houseMeetingHeldAt(slotId: number): boolean {
  const game = useGameStore.getState()
  const house = game.groupHouse
  // A member has no meetings; they are the pledge's.
  if (!house || house.stage !== 'pledge') return false
  const sessions = game.houseAgendas[house.id]?.sessions ?? []
  return practiceHeld(
    { since: house.since + 1 },
    sessions,
    slotId,
    meetingContext(),
    PLEDGE_LAST_DAY
  )
}

/** The label of his initiation, in the same three places. */
const INITIATION_LABEL = 'initiation'

/**
 * A commitment of the reader's to a group: his team's practice, his house's pledge meeting or
 * the night of his initiation.
 */
export interface PlayerGroupSlot {
  kind: 'team' | 'house' | 'initiation'
  /** The team, for a practice. */
  group?: GroupDef
  /** The house, for a pledge meeting or his initiation. */
  house?: HouseId
  /** The period of the week it falls in. */
  slot: ShiftSlot
  /** What it is called: "basketball practice", "pledge meeting". */
  label: string
  /** The place it is held at. */
  location: string
}

/**
 * The group commitment the reader has in a slot, defaulting to now, or null: his team practices
 * then, or his house holds a pledge meeting. The sibling of {@link shiftNow} for everything that
 * asks whether his time is spoken for.
 */
export function playerGroupNow(date?: number, time?: TimeSlot): PlayerGroupSlot | null {
  const game = useGameStore.getState()
  const on = date ?? game.date
  const half = time ?? game.time
  const slotId = globalSlotOf(on, half)
  const slot = shiftSlotOf(shiftWeekdayOf(on), half)
  const house = game.groupHouse
  if (house && initiationAt(slotId)) {
    return { kind: 'initiation', house: house.id, slot, label: INITIATION_LABEL, location: house.id }
  }
  const team = game.groupTeam
  if (team && practiceHeldAt(slotId)) {
    const group = GROUPS[team.id]
    return { kind: 'team', group, slot, label: group.practice, location: group.location }
  }
  if (house && houseMeetingHeldAt(slotId)) {
    return { kind: 'house', house: house.id, slot, label: PLEDGE_MEETING_LABEL, location: house.id }
  }
  return null
}

/**
 * His team's practice periods and his house's pledge meetings, for the lines that tell the writer
 * his week: the practices stop once classes are over and the meetings with the pledge, and
 * nothing is said of a team or a house he has none of.
 */
export function playerPracticeWeek(): PracticeWeek[] {
  const game = useGameStore.getState()
  const weeks: PracticeWeek[] = []
  const team = game.groupTeam
  if (team && game.date <= LAST_CLASS_DATE) {
    const slots = game.groups[team.id]?.sessions ?? []
    if (slots.length > 0) weeks.push({ label: GROUPS[team.id].practice, slots: [...slots] })
  }
  const house = game.groupHouse
  if (house?.stage === 'pledge' && game.date <= PLEDGE_LAST_DAY) {
    const slots = game.houseAgendas[house.id]?.sessions ?? []
    if (slots.length > 0) weeks.push({ label: PLEDGE_MEETING_LABEL, slots: [...slots] })
  }
  if (house?.stage === 'pledge' && house.initiation) {
    const { slot } = house.initiation
    const on = Math.floor(slot / 2)
    if (slot >= globalSlotOf(game.date, game.time)) {
      weeks.push({
        label: `${INITIATION_LABEL} (once, ${formatGameDate(on)})`,
        slots: [shiftSlotOf(shiftWeekdayOf(on), 1)]
      })
    }
  }
  return weeks
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
        (occasion.group !== undefined ||
          occasion.house !== undefined ||
          greekWeekEventOf(occasion.id) !== undefined) &&
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
  const inTeamEvent =
    event?.group !== undefined &&
    event.where !== undefined &&
    game.charInfo[charId]?.groups?.includes(event.group) === true
  // A house's event: whoever lives in the house is at it, as the week would have her elsewhere.
  const houseOfChar = game.charInfo[charId]?.house
  const inHouseEvent =
    event?.house !== undefined &&
    event.where !== undefined &&
    houseOfChar !== undefined &&
    occasionHouses(event).includes(houseOfChar)
  // A night of Greek Week: whoever lives in any of the four houses is at it.
  const inGreekWeek =
    event !== undefined &&
    greekWeekEventOf(event.id) !== undefined &&
    event.where !== undefined &&
    houseOfChar !== undefined
  // His pledge meeting or his initiation: whoever lives in the house he pledges is at it while it is held.
  const slotId = globalSlotOf(date, time)
  const inMeeting =
    game.groupHouse !== null && houseOfChar === game.groupHouse.id && houseMeetingHeldAt(slotId)
  const inInitiation =
    game.groupHouse !== null && houseOfChar === game.groupHouse.id && initiationAt(slotId)
  const inEvent = inTeamEvent || inHouseEvent || inGreekWeek || inInitiation
  const haunt: Haunt | undefined = inInitiation
    ? { location: game.groupHouse?.id as string, kind: 'event', doing: 'at the initiation' }
    : inHouseEvent || inGreekWeek
    ? { location: event?.where as string, kind: 'event', doing: `at the ${event?.title}` }
    : inTeamEvent
      ? { location: event.where as string, kind: 'team' }
      : inMeeting
        ? { location: game.groupHouse?.id as string, kind: 'event', doing: 'at the pledge meeting' }
        : game.charInfo[charId]?.hiddenSchedule?.[shiftSlotOf(shiftWeekdayOf(date), time)]
  if (!haunt) return null
  // A group's event takes its place over: another team's session there that half-day is not held.
  if (!inEvent && event?.where !== undefined && haunt.kind === 'team' && haunt.location === event.where) {
    return null
  }
  // A class or a shift outranks a haunt: a save whose timetable moved under it (add/drop).
  if (charBusyNow(charId, date, time)) return null
  if (hauntClosedOn(haunt.location, haunt.kind, date, game.occasions)) return null
  return haunt
}

/**
 * The team whose session `charId` is in right now, or null: her standing haunt this slot is a
 * team's, and she is at it. The meet's night counts, since the event's place is a team haunt of
 * its own. Read off her own record, since two teams may share a place.
 */
export function charTeamSessionNow(charId: string, date?: number, time?: TimeSlot): GroupDef | null {
  const haunt = charStandingHauntNow(charId, date, time)
  if (haunt?.kind !== 'team') return null
  const groups = useGameStore.getState().charInfo[charId]?.groups
  return groupsOfChar(groups).find((def) => def.location === haunt.location) ?? null
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
