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
import type { Gender, ShiftSlot } from './types'

/** Every group there is. Only the swim team exists so far. */
export type GroupId = 'swimming'

export const GROUP_IDS: readonly GroupId[] = ['swimming']

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
  /** The `LOCATIONS` id its sessions are held at. */
  location: string
  /** The gender of its members. */
  gender: Gender
  /** How many of the roster belong, at least and at most. */
  minMembers: number
  maxMembers: number
}

export const GROUPS: Readonly<Record<GroupId, GroupDef>> = {
  swimming: {
    id: 'swimming',
    name: 'the Venus Jackrabbits swim team',
    title: 'Swim team',
    nickname: 'the swim team',
    practice: 'swim practice',
    location: 'palaestra_pool',
    gender: 'woman',
    minMembers: 3,
    maxMembers: 5
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
 * with too few people to take returns nobody.
 */
export function drawMembers(
  def: GroupDef,
  eligible: readonly string[],
  choice: TeamChoice,
  taken: ReadonlySet<string>,
  seed: string
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
    const team = drawMembers(
      def,
      eligibleFor(def, input.roster),
      choice,
      taken,
      `${input.seed}:${id}:members`
    )
    if (team.length === 0) continue
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
