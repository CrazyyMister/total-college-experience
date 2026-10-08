/**
 * Groups: a team's members, its place and its weekly sessions. The table is code, the draw of
 * who belongs and when they meet is made once at New Game, and nothing here reads the clock or
 * the store.
 */

import { seededRand } from './hash'
import { SHIFT_SLOTS } from './jobs'
import { isLocationOpen, locationLabel } from './locations'
import { pronounsOf } from './pronouns'
import { shuffle } from './shuffle'
import type { Gender, Occasion, OutfitSet, ShiftSlot, TimeSlot } from './types'

/** Every group there is. The order is the order New Game draws their teams in. */
export type GroupId = 'swimming' | 'volleyball'

export const GROUP_IDS: readonly GroupId[] = ['swimming', 'volleyball']

/** A school the groups meet in the field. */
export type SchoolId = 'port_calder' | 'veridan_state'

export interface SchoolDef {
  id: SchoolId
  /** What the prompts call it in full. */
  name: string
  /** What its teams are called. */
  nickname: string
  /** What a button or a title calls it. */
  short: string
}

export const SCHOOLS: Readonly<Record<SchoolId, SchoolDef>> = {
  port_calder: {
    id: 'port_calder',
    name: 'Port Calder College',
    nickname: 'Seals',
    short: 'Port Calder'
  },
  veridan_state: {
    id: 'veridan_state',
    name: 'Veridan State University',
    nickname: 'Wardens',
    short: 'Veridan State'
  }
}

/** Whose campus the Copper Lantern is on display at this semester. Nothing in the game moves it. */
export const COPPER_LANTERN_HOLDER: SchoolId = 'veridan_state'

/** The half of the day a group's events are held in: the night. */
export const GROUP_EVENT_TIME: TimeSlot = 1

/** One event a group holds against a school, dated at New Game out of its candidate days. */
export interface GroupEventDef {
  id: string
  rival: SchoolId
  /** The day indices it may fall on, best first. */
  candidates: readonly number[]
}

/** One group's fixed facts. */
export interface GroupDef {
  id: GroupId
  /** What the prompts call it in full. */
  name: string
  /** What its card is titled on the New Game screen. */
  title: string
  /** What the prompts call it when it is already the subject. */
  nickname: string
  /** What its session is called in "at swim practice". */
  practice: string
  /** What its members do for it, in "the women of the roster who swim for …". */
  joins: string
  /** The set a member wears while her scene is at her session's place, when it is rendered. */
  sessionSet: OutfitSet
  /** The `LOCATIONS` id its sessions are held at. */
  location: string
  /** The gender of its members. */
  gender: Gender
  /** How many of the roster belong, at least and at most. */
  minMembers: number
  maxMembers: number
  /** What its event is called after the school, in the button and the title. */
  eventName: string
  /** What its event is called in the calendar's description of it. */
  eventKind: string
  /** How an event is scored: points shared out, or the sets of a match played to three. */
  scoring: { kind: 'points'; total: number } | { kind: 'sets'; toWin: number }
  events: readonly GroupEventDef[]
}

export const GROUPS: Readonly<Record<GroupId, GroupDef>> = {
  swimming: {
    id: 'swimming',
    name: 'the Venus Jackrabbits swim team',
    title: 'Swim team',
    nickname: 'the swim team',
    practice: 'swim practice',
    joins: 'swim for',
    sessionSet: 'swim',
    location: 'palaestra_pool',
    gender: 'woman',
    minMembers: 3,
    maxMembers: 5,
    eventName: 'swim meet',
    eventKind: 'dual meet',
    scoring: { kind: 'points', total: 300 },
    // Saturday nights: February 21 and April 11, then the nearest free Saturdays, then a Sunday
    // night. The first meet keeps February 7 before its Sunday, for a team too thin on the later
    // Saturdays; a team of three whose members work Saturday nights loses every Saturday.
    events: [
      { id: 'swimming-meet-1', rival: 'port_calder', candidates: [33, 40, 19, 27] },
      { id: 'swimming-meet-2', rival: 'port_calder', candidates: [82, 89, 75, 90] }
    ]
  },
  volleyball: {
    id: 'volleyball',
    name: 'the Venus Jackrabbits volleyball team',
    title: 'Volleyball team',
    nickname: 'the volleyball team',
    practice: 'volleyball practice',
    joins: 'play volleyball for',
    sessionSet: 'uniform',
    location: 'palaestra_court',
    gender: 'woman',
    minMembers: 3,
    maxMembers: 5,
    eventName: 'volleyball match',
    eventKind: 'match',
    scoring: { kind: 'sets', toWin: 3 },
    // Saturday nights from March 21 and April 25, then the nearest free ones, then a Sunday night.
    events: [
      { id: 'volleyball-match-1', rival: 'port_calder', candidates: [61, 68, 12, 20] },
      { id: 'volleyball-match-2', rival: 'port_calder', candidates: [96, 89, 75, 83] }
    ]
  }
}

/** How many sessions a team holds in a week. */
export const TEAM_SESSIONS_PER_WEEK = 2

/** The fewest members who must be free for a session to be held at all. */
export const MIN_SESSION_ATTENDEES = 2

/** The group an id names, or `undefined` for anything that is not one. */
export function groupDefOf(id: string): GroupDef | undefined {
  return (GROUPS as Readonly<Record<string, GroupDef | undefined>>)[id]
}

/** The group whose sessions are held at a place, or `undefined` for a place that is nobody's. */
export function groupAtPlace(location: string): GroupDef | undefined {
  return GROUP_IDS.map((id) => GROUPS[id]).find((def) => def.location === location)
}

/** What New Game asked for one team: how many, and who by name; the rest are drawn. */
export interface TeamChoice {
  count: number
  picked: string[]
}

/** New Game's whole answer on teams; a group with no entry has no team. */
export type TeamsChoice = Partial<Record<GroupId, TeamChoice>>

/** What a group does in the week once it has members: when it meets. */
export interface GroupAgenda {
  /** The `ShiftSlot`s of the week it meets in, ascending. */
  sessions: ShiftSlot[]
  /** How many sessions found no period with enough members free, when any did not. */
  leftOutSessions?: number
  /** The events no candidate day could hold, when any could not. */
  leftOutEvents?: LeftOutEvent[]
  /** Set on a team that was asked for and not formed: how many were asked, how many women were left. */
  unformed?: { asked: number; left: number }
}

/** Why an event found no day. */
export type LeftOutEventReason = 'no_date' | 'too_few_free'

export interface LeftOutEvent {
  id: string
  reason: LeftOutEventReason
}

/** How an event ended, as the side that hosts it (home) and the visitors (away) scored. */
export interface GroupResult {
  won: boolean
  home: number
  away: number
}

/** What a save keeps of the groups: how each decided event ended, keyed by event id. */
export interface GroupsSave {
  results: Record<string, GroupResult>
}

/** Every group's agenda in a playthrough, keyed by group id. */
export type GroupsRecord = Partial<Record<GroupId, GroupAgenda>>

/** Who of `roster` a group may take. */
export function eligibleFor(
  def: GroupDef,
  roster: readonly { charId: string; gender: Gender }[]
): string[] {
  return roster.filter((entry) => entry.gender === def.gender).map((entry) => entry.charId)
}

/**
 * The members of one team: whoever the player picked who is eligible and free of other teams,
 * then the rest drawn from the others, up to the count asked for (kept between the group's
 * least and most). Nobody belongs to two teams, and the same seed draws the same team. A group
 * with too few people to take returns nobody. Those in `reserved` are another team's picks: the
 * random fill never takes them.
 */
export function drawMembers(
  def: GroupDef,
  eligible: readonly string[],
  choice: TeamChoice,
  taken: ReadonlySet<string>,
  seed: string,
  reserved: ReadonlySet<string> = new Set()
): string[] {
  const pool = eligible.filter((charId) => !taken.has(charId))
  if (pool.length < def.minMembers) return []
  const want = Math.min(
    Math.max(Math.trunc(choice.count), def.minMembers),
    def.maxMembers,
    pool.length
  )
  const members = new Set<string>()
  for (const charId of choice.picked) {
    if (members.size >= want) break
    if (pool.includes(charId)) members.add(charId)
  }
  for (const charId of shuffle(pool, seededRand(seed))) {
    if (members.size >= want) break
    if (!reserved.has(charId)) members.add(charId)
  }
  // Never short of the least a team needs for want of the reserved: they are taken last.
  for (const charId of pool) {
    if (members.size >= def.minMembers) break
    members.add(charId)
  }
  return eligible.filter((charId) => members.has(charId))
}

/** What {@link groupSessionSlots} reads. */
export interface SessionInput {
  /** The `LOCATIONS` id the sessions are held at. */
  location: string
  members: readonly string[]
  /** The `ShiftSlot`s each member owes to a class or a shift, keyed by charId. */
  busy: Readonly<Record<string, ReadonlySet<number>>>
  /** The `ShiftSlot`s the reader has a class in, which are never a session. */
  playerClassSlots: ReadonlySet<number>
  /** How many sessions to place. */
  count: number
  seed: string
}

/**
 * The periods of the week a team meets in: those with the most members free, never one the
 * reader has a class in, never one the place is shut in, never one with fewer than
 * {@link MIN_SESSION_ATTENDEES} members free, and on different days where the week allows it.
 * `leftOut` is how many of the asked-for sessions found no period.
 */
export function groupSessionSlots(input: SessionInput): { slots: ShiftSlot[]; leftOut: number } {
  const { members, busy, count } = input
  const rand = seededRand(input.seed)
  const free = (slot: number): number =>
    members.filter((charId) => !busy[charId]?.has(slot)).length

  const ranked = shuffle(
    SHIFT_SLOTS.filter(
      (slot) =>
        isLocationOpen(input.location, slot) &&
        !input.playerClassSlots.has(slot) &&
        free(slot) >= MIN_SESSION_ATTENDEES
    ),
    rand
  ).sort((a, b) => free(b) - free(a))

  const chosen: ShiftSlot[] = []
  const dayOf = (slot: number): number => Math.floor(slot / 2)
  while (chosen.length < count) {
    const left = ranked.filter((slot) => !chosen.includes(slot))
    if (left.length === 0) break
    const otherDay = left.filter((slot) => !chosen.some((held) => dayOf(held) === dayOf(slot)))
    chosen.push((otherDay[0] ?? left[0]) as ShiftSlot)
  }
  return { slots: chosen.sort((a, b) => a - b), leftOut: count - chosen.length }
}

/** What {@link dealGroups} reads. */
export interface GroupDealInput {
  choice: TeamsChoice
  roster: readonly { charId: string; gender: Gender }[]
  busy: Readonly<Record<string, ReadonlySet<number>>>
  playerClassSlots: ReadonlySet<number>
  seed: string
}

/** What {@link dealGroups} settles: who is on each team, and when each team meets. */
export interface GroupDeal {
  members: Partial<Record<GroupId, string[]>>
  agendas: GroupsRecord
}

/** Settles every team New Game asked for, once. */
export function dealGroups(input: GroupDealInput): GroupDeal {
  const members: Partial<Record<GroupId, string[]>> = {}
  const agendas: GroupsRecord = {}
  const taken = new Set<string>()
  for (const id of GROUP_IDS) {
    const choice = input.choice[id]
    if (!choice || choice.count <= 0) continue
    const def = GROUPS[id]
    const eligible = eligibleFor(def, input.roster)
    // What the other teams were asked for by hand stays theirs, whichever is drawn first.
    const reserved = new Set(
      GROUP_IDS.filter((other) => other !== id).flatMap((other) => input.choice[other]?.picked ?? [])
    )
    const team = drawMembers(def, eligible, choice, taken, `${input.seed}:${id}:members`, reserved)
    if (team.length === 0) {
      agendas[id] = {
        sessions: [],
        unformed: { asked: choice.count, left: eligible.filter((charId) => !taken.has(charId)).length }
      }
      continue
    }
    for (const charId of team) taken.add(charId)
    members[id] = team
    const sessions = groupSessionSlots({
      location: def.location,
      members: team,
      busy: input.busy,
      playerClassSlots: input.playerClassSlots,
      count: TEAM_SESSIONS_PER_WEEK,
      seed: `${input.seed}:${id}:sessions`
    })
    agendas[id] = {
      sessions: sessions.slots,
      ...(sessions.leftOut > 0 ? { leftOutSessions: sessions.leftOut } : {})
    }
  }
  return { members, agendas }
}

/** The groups a character belongs to, from the ids her profile carries. */
export function groupsOfChar(ids: readonly string[] | undefined): GroupDef[] {
  return (ids ?? []).flatMap((id) => {
    const def = groupDefOf(id)
    return def ? [def] : []
  })
}

/** The fact that a character is on a team, one sentence for each of hers. */
function belongingSentences(ids: readonly string[] | undefined, gender: Gender): string[] {
  return groupsOfChar(ids).map(
    (def) =>
      `${pronounsOf(gender).Subject} is on ${def.name}, which practices at ${locationLabel(def.location)}.`
  )
}

/** The ` | She is on …` tail of a cast block's labeled facts line; nothing for a girl on no team. */
export function groupClause(ids: readonly string[] | undefined, gender: Gender): string {
  return belongingSentences(ids, gender)
    .map((sentence) => ` | ${sentence}`)
    .join('')
}

/** The same fact as lorebook prose. */
export function groupSentence(ids: readonly string[] | undefined, gender: Gender): string {
  return belongingSentences(ids, gender)
    .map((sentence) => ` ${sentence}`)
    .join('')
}

/** The odds of winning with nobody free, and what every member free adds to them. */
export const WIN_BASE = 0.4
export const WIN_PER_STRENGTH = 0.3

/** How many of the members are free to be there, from 0 to 1. */
export function eventStrength(
  members: readonly string[],
  isFree: (charId: string) => boolean
): number {
  if (members.length === 0) return 0
  return members.filter(isFree).length / members.length
}

/** The odds a group wins an event at this strength. */
export function winChance(strength: number): number {
  return WIN_BASE + WIN_PER_STRENGTH * Math.min(1, Math.max(0, strength))
}

/**
 * How an event ends: won by the odds and the seed, and scored out of the group's points with the
 * winner on 52% to 64% of them, or by the sets of a match played to three, the loser taking none,
 * one or two of them. The same group, strength and seed always end it the same way.
 */
export function gameResult(group: GroupDef, strength: number, seed: string): GroupResult {
  const rand = seededRand(seed)
  const won = rand() < winChance(strength)
  const { scoring } = group
  const winner =
    scoring.kind === 'sets' ? scoring.toWin : Math.round(scoring.total * (0.52 + rand() * 0.12))
  const loser =
    scoring.kind === 'sets' ? Math.floor(rand() * scoring.toWin) : scoring.total - winner
  return won ? { won, home: winner, away: loser } : { won, home: loser, away: winner }
}

/** The group, event and school an event id names, or `undefined` for an id that is not one. */
export function groupEventOf(
  eventId: string
): { group: GroupDef; event: GroupEventDef; school: SchoolDef } | undefined {
  for (const id of GROUP_IDS) {
    const group = GROUPS[id]
    const event = group.events.find((entry) => entry.id === eventId)
    if (event) return { group, event, school: SCHOOLS[event.rival] }
  }
  return undefined
}

/** The title of an event, as the calendar writes it. */
export function groupEventTitle(group: GroupDef, school: SchoolDef): string {
  const name = group.eventName
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} vs ${school.short}`
}

/** What the button for an event says. */
export function groupEventButton(group: GroupDef, school: SchoolDef): string {
  return `Go to the ${school.short} ${group.eventName}`
}

/** The occasion an event becomes once it has a day. */
function groupEventOccasion(group: GroupDef, event: GroupEventDef, date: number): Occasion {
  const school = SCHOOLS[event.rival]
  const team = `${group.name.charAt(0).toUpperCase()}${group.name.slice(1)}`
  return {
    id: event.id,
    title: groupEventTitle(group, school),
    description: `${team} hosts ${school.name}'s ${school.nickname} in a ${group.eventKind} at ${locationLabel(group.location)}.`,
    startDate: date,
    endDate: date,
    time: GROUP_EVENT_TIME,
    cancelsClasses: false,
    kind: 'campus',
    group: group.id,
    where: group.location
  }
}

/** Whether an occasion holds the half-day. */
function occupies(occasion: Occasion, date: number, time: TimeSlot): boolean {
  return (
    date >= occasion.startDate &&
    date <= occasion.endDate &&
    (occasion.time === null || occasion.time === time)
  )
}

/** What {@link placeGroupEvents} reads. */
export interface EventPlacementInput {
  /** Each group that has a team, with its members. */
  members: Partial<Record<GroupId, readonly string[]>>
  /** Every fixed and generated occasion the semester has. */
  occasions: readonly Occasion[]
  /** The weeks no event may fall in: the exam weeks and spring break. */
  avoid: readonly { startDate: number; endDate: number }[]
  /** How many of `members` are free at a half-day. */
  freeCount: (members: readonly string[], date: number, time: TimeSlot) => number
}

/**
 * Gives every event of every group with a team its day: the first candidate whose half-day no
 * occasion and no other event holds, outside the weeks to avoid, with at least
 * {@link MIN_SESSION_ATTENDEES} members free. An event no candidate can hold is returned with
 * the reason and never dropped; the same input always places the same days.
 */
export function placeGroupEvents(input: EventPlacementInput): {
  placed: Occasion[]
  leftOut: Partial<Record<GroupId, LeftOutEvent[]>>
} {
  const placed: Occasion[] = []
  const leftOut: Partial<Record<GroupId, LeftOutEvent[]>> = {}
  for (const id of GROUP_IDS) {
    const members = input.members[id]
    if (!members || members.length === 0) continue
    for (const event of GROUPS[id].events) {
      const open = event.candidates.filter(
        (date) =>
          !input.avoid.some((range) => date >= range.startDate && date <= range.endDate) &&
          ![...input.occasions, ...placed].some((occasion) =>
            occupies(occasion, date, GROUP_EVENT_TIME)
          )
      )
      const day = open.find(
        (date) => input.freeCount(members, date, GROUP_EVENT_TIME) >= MIN_SESSION_ATTENDEES
      )
      if (day !== undefined) {
        placed.push(groupEventOccasion(GROUPS[id], event, day))
        continue
      }
      leftOut[id] = [
        ...(leftOut[id] ?? []),
        { id: event.id, reason: open.length === 0 ? 'no_date' : 'too_few_free' }
      ]
    }
  }
  return { placed, leftOut }
}
