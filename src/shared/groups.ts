/**
 * Groups: a team's members, its place and its weekly sessions. The table is code, the draw of
 * who belongs and when they meet is made once at New Game, and nothing here reads the clock or
 * the store.
 */

import { LAST_CLASS_DATE } from './classes'
import { seededRand } from './hash'
import { MAX_STRIKES, SHIFT_SLOTS, shiftSlotFullLabel, shiftSlotOf } from './jobs'
import { isLocationOpen, locationLabel } from './locations'
import {
  HOUSE_IDS,
  HOUSES,
  isHouse,
  houseNights,
  mixerHost,
  mixerEventId,
  mixerOccasion,
  partyEventId,
  partyHost,
  partyOccasion,
  RUSH_EVENTS,
  rushCandidates,
  rushEventOf,
  rushOccasion,
  type DroppedHouse,
  type HouseId,
  type HouseMembers,
  type RushSave,
  type SavedHouseStanding
} from './houses'
import { MAX_TIER, tierOf, type ShiftGain } from './playerStats'
import { pronounsOf } from './pronouns'
import { shuffle } from './shuffle'
import type { Gender, Occasion, OutfitSet, ShiftSlot, TimeSlot } from './types'

/** Every group there is. The order is the order New Game draws their teams in. */
export type GroupId = 'swimming' | 'volleyball' | 'basketball' | 'football'

export const GROUP_IDS: readonly GroupId[] = ['swimming', 'volleyball', 'basketball', 'football']

/** A school the groups meet in the field. */
export type SchoolId = 'port_calder' | 'veridan_state' | 'ashgrove' | 'redmere'

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
  },
  ashgrove: {
    id: 'ashgrove',
    name: 'Ashgrove University',
    nickname: 'Owls',
    short: 'Ashgrove'
  },
  redmere: {
    id: 'redmere',
    name: 'Redmere Institute of Technology',
    nickname: 'Rivets',
    short: 'Redmere'
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

/** The tryout the reader can go to for a team that takes him. */
export interface TryoutDef {
  /** The id of the occasion it becomes. */
  id: string
  /** What the button and the title call it, lower case. */
  label: string
  /** The day indices it may fall on, best first: the first week, then the second as a reserve. */
  candidates: readonly number[]
}

/** The half of the day a tryout is held in: the day. */
export const TRYOUT_TIME: TimeSlot = 0

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
  /**
   * How an event is scored: points shared out, the sets of a match played to three, a college
   * basketball score, or a football score made of touchdowns and field goals.
   */
  scoring:
    | { kind: 'points'; total: number }
    | { kind: 'sets'; toWin: number }
    | { kind: 'hoops' }
    | { kind: 'gridiron' }
  events: readonly GroupEventDef[]
  /**
   * Whether the reader can try out for it. Such a team exists whoever of the roster is on it,
   * since the reader and the unnamed make a team of their own.
   */
  readerPlays: boolean
  tryout?: TryoutDef
  /** Who texts the reader about his place on the team; set on the teams he can try out for. */
  coach?: CoachDef
}

/** The texts a coach sends, which kinds there are of them, and the tokens each may carry. */
export type CoachKind = 'intro' | 'missed' | 'missed2' | 'expelled' | 'quit'

/**
 * A team's coach as a contact: no name, only what he coaches. A text may hold `{hours}` (the
 * practice periods), `{place}`, `{limit}` (the misses that end it), `{strike}` (the count so far)
 * and `{left}` (the misses still allowed), each a word, capitalized when the token is.
 */
export interface CoachDef {
  name: string
  icon: string
  texts: Readonly<Record<CoachKind, string>>
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
    ],
    readerPlays: false
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
    ],
    readerPlays: false
  },
  basketball: {
    id: 'basketball',
    name: 'the Venus Jackrabbits basketball team',
    title: 'Basketball team',
    nickname: 'the basketball team',
    practice: 'basketball practice',
    joins: 'play basketball for',
    sessionSet: 'pe',
    location: 'palaestra_court',
    gender: 'man',
    minMembers: 1,
    maxMembers: 3,
    eventName: 'basketball game',
    eventKind: 'game',
    scoring: { kind: 'hoops' },
    // Saturday nights from February 7 and April 4, then the nearest free ones, then a Sunday night.
    events: [
      { id: 'basketball-game-1', rival: 'ashgrove', candidates: [26, 19, 33, 40, 27, 20, 34, 41] },
      {
        id: 'basketball-game-2',
        rival: 'ashgrove',
        candidates: [75, 68, 82, 89, 96, 103, 76, 69, 83, 90, 97, 104]
      }
    ],
    readerPlays: true,
    // A Saturday first, then the other days of the first week, then the second week.
    tryout: {
      id: 'basketball-tryout',
      label: 'basketball tryout',
      candidates: [5, 2, 4, 1, 3, 6, 12, 9, 11, 8, 10, 7, 13]
    },
    coach: {
      name: 'Basketball coach',
      icon: '🏀',
      texts: {
        intro: "Coach here. You're on the roster. Practice is {hours} at {place}. Be there, every time.",
        missed: "You weren't at practice. That's {strike}. {Limit} misses and you're off the team.",
        missed2: "That's {strike}. {Left} more and you're done here.",
        expelled: "That's {strike}. You're off the team. Clear out your locker.",
        quit: "Understood. Your spot goes to someone else. Good luck."
      }
    }
  },
  football: {
    id: 'football',
    name: 'the Venus Jackrabbits football team',
    title: 'Football team',
    nickname: 'the football team',
    practice: 'football practice',
    joins: 'play football for',
    sessionSet: 'pe',
    location: 'palaestra_field',
    gender: 'man',
    minMembers: 1,
    maxMembers: 3,
    eventName: 'football game',
    eventKind: 'game',
    scoring: { kind: 'gridiron' },
    // Saturday nights from February 28 and April 18, then the nearest free ones, then a Sunday night.
    events: [
      { id: 'football-game-1', rival: 'redmere', candidates: [40, 33, 26, 19, 41, 34, 27, 20] },
      {
        id: 'football-game-2',
        rival: 'redmere',
        candidates: [89, 96, 82, 75, 103, 90, 97, 83, 76, 104]
      }
    ],
    readerPlays: true,
    tryout: {
      id: 'football-tryout',
      label: 'football tryout',
      candidates: [6, 3, 1, 4, 2, 5, 13, 10, 8, 11, 9, 12, 7]
    },
    coach: {
      name: 'Football coach',
      icon: '🏈',
      texts: {
        intro: "Coach here. You made the roster. Practice is {hours} at {place}. Show up, every time.",
        missed: "You weren't at practice. That's {strike}. {Limit} misses and you're off the team.",
        missed2: "{Strike}. {Left} more and you're done here.",
        expelled: "{Strike}. You're off the team. Turn in your gear.",
        quit: "Understood. Your spot goes to someone else. Good luck."
      }
    }
  }
}

/** How many sessions a team holds in a week. */
export const TEAM_SESSIONS_PER_WEEK = 2

/** How many meetings a fraternity holds in a week. */
export const PLEDGE_SESSIONS_PER_WEEK = 2

/** The last day of a pledge: the end of the fifth week. It runs from the slot after his answer. */
export const PLEDGE_LAST_DAY = 41

/** The fewest members who must be free for a session to be held at all. */
export const MIN_SESSION_ATTENDEES = 2

/** The group an id names, or `undefined` for anything that is not one. */
export function groupDefOf(id: string): GroupDef | undefined {
  return (GROUPS as Readonly<Record<string, GroupDef | undefined>>)[id]
}

/** The groups whose sessions are held at a place; none for a place that is nobody's. */
export function groupsAtPlace(location: string): GroupDef[] {
  return GROUP_IDS.map((id) => GROUPS[id]).filter((def) => def.location === location)
}

/** What New Game asked for one team: how many, and who by name; the rest are drawn. */
export interface TeamChoice {
  count: number
  picked: string[]
}

/**
 * New Game's whole answer on teams. A team the reader cannot try out for and has no entry for
 * does not exist; one he can try out for and has no entry for is drawn, from one to its most.
 */
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

/** How a tryout the reader went to ended, and the Body tier it was judged on. */
export interface TryoutResult {
  made: boolean
  tier: number
}

/** The team the reader is on: which, the slot id he joined from, and how his practices stand. */
export interface GroupTeam {
  id: GroupId
  since: number
  /** The practices he has missed. */
  strikes: number
  /** The last slot id judged; a practice at or before it is never judged again. */
  settledThrough: number
  /** The slot ids of practices he went to that are still to be judged. */
  attendedSlots: number[]
  /** The practices his team has held since he joined, judged. */
  held: number
  /** Of those, the ones he went to. */
  attended: number
}

/** A team as a save keeps it: the fields a save from before practices counted are absent. */
export type SavedTeam = Pick<GroupTeam, 'id' | 'since'> & Partial<GroupTeam>

/**
 * The team a save describes, whole. A save from before practices counted has no strikes and has
 * judged nothing yet, so its first judgement is the slot the save stands on: he is not charged
 * for the practices nobody asked him to go to.
 */
export function teamOfSave(saved: SavedTeam, standingSlot: number): GroupTeam {
  return {
    id: saved.id,
    since: saved.since,
    strikes: saved.strikes ?? 0,
    settledThrough: saved.settledThrough ?? standingSlot - 1,
    attendedSlots: saved.attendedSlots ?? [],
    held: saved.held ?? 0,
    attended: saved.attended ?? 0
  }
}
/**
 * What a save keeps of the groups: how each decided event ended, keyed by event id, how each
 * tryout the reader went to ended, and the team he is on.
 */
export interface GroupsSave {
  results: Record<string, GroupResult>
  tryouts?: Record<string, TryoutResult>
  team?: SavedTeam
  /** The rush events he went to and the bid they led to. */
  rush?: RushSave
  /** The house he has said yes to. */
  house?: SavedHouseStanding
  /** The house that put him out of its pledge, kept so that its scenes and its people know. */
  dropped?: DroppedHouse
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
  /** The `ShiftSlot`s another group already holds the place in, which are never a session. */
  taken?: ReadonlySet<number>
  /**
   * A team of the unnamed always meets its full count: a period with too few members free is
   * the last choice rather than no choice.
   */
  lenient?: boolean
  seed: string
}

/**
 * The periods of the week a team meets in: those with the most members free, never one the
 * reader has a class in, never one the place is shut in or another team holds it in, never one
 * with fewer than {@link MIN_SESSION_ATTENDEES} members free (fewer when the team has fewer;
 * a lenient team takes such a period only after every other), and on different days where the
 * week allows it.
 * `leftOut` is how many of the asked-for sessions found no period.
 */
export function groupSessionSlots(input: SessionInput): { slots: ShiftSlot[]; leftOut: number } {
  const { members, busy, count } = input
  const rand = seededRand(input.seed)
  // A team of one or none holds its sessions with whoever it has.
  const least = Math.min(MIN_SESSION_ATTENDEES, members.length)
  const free = (slot: number): number =>
    members.filter((charId) => !busy[charId]?.has(slot)).length

  const open = SHIFT_SLOTS.filter(
    (slot) =>
      isLocationOpen(input.location, slot) &&
      !input.playerClassSlots.has(slot) &&
      !input.taken?.has(slot)
  )
  const enough = open.filter((slot) => free(slot) >= least)
  const byFree = (a: number, b: number): number => free(b) - free(a)
  const ranked = input.lenient
    ? [
        ...shuffle(enough, rand).sort(byFree),
        ...shuffle(
          open.filter((slot) => free(slot) < least),
          rand
        ).sort(byFree)
      ]
    : shuffle(enough, rand).sort(byFree)

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

/**
 * The members of a team the reader can try out for. A choice of none (count 0) is nobody from
 * the roster; no choice at all is drawn, from one up to the most the team can take. `reserve` is
 * how many later teams still need one of the same people, kept back from the draw, so that with
 * two or more people on the roster no team is left with nobody. The same seed draws the same
 * team.
 */
function drawReaderTeam(
  def: GroupDef,
  eligible: readonly string[],
  choice: TeamChoice | undefined,
  taken: ReadonlySet<string>,
  reserved: ReadonlySet<string>,
  reserve: number,
  seed: string
): string[] {
  if (choice && choice.count <= 0) return []
  const pool = eligible.filter((charId) => !taken.has(charId))
  const picks = (choice?.picked ?? []).filter((charId) => pool.includes(charId))
  const rand = seededRand(seed)
  const free = shuffle(
    pool.filter((charId) => !picks.includes(charId) && !reserved.has(charId)),
    rand
  )
  const held = eligible.length >= 2 ? reserve : 0
  const room = Math.min(def.maxMembers, Math.max(picks.length, picks.length + free.length - held))
  if (room <= 0) return []
  const want = choice
    ? Math.min(Math.max(Math.trunc(choice.count), picks.length, def.minMembers), room)
    : 1 + Math.floor(rand() * room)
  const members = new Set([...picks, ...free].slice(0, want))
  return eligible.filter((charId) => members.has(charId))
}

/** The order New Game deals the teams in: the women's as listed, then the men's in a drawn order. */
function dealOrder(seed: string): GroupId[] {
  const readers = shuffle(
    GROUP_IDS.filter((id) => GROUPS[id].readerPlays),
    seededRand(`${seed}:order`)
  )
  return [...GROUP_IDS.filter((id) => !GROUPS[id].readerPlays), ...readers]
}

/** Settles every team New Game asked for, and every team the reader can try out for, once. */
export function dealGroups(input: GroupDealInput): GroupDeal {
  const members: Partial<Record<GroupId, string[]>> = {}
  const agendas: GroupsRecord = {}
  const taken = new Set<string>()
  /** The periods each place is already held in, so that two teams never share one. */
  const held = new Map<string, Set<number>>()
  const order = dealOrder(input.seed)
  for (const [at, id] of order.entries()) {
    const choice = input.choice[id]
    const def = GROUPS[id]
    if (!def.readerPlays && (!choice || choice.count <= 0)) continue
    const eligible = eligibleFor(def, input.roster)
    // What the other teams were asked for by hand stays theirs, whichever is drawn first.
    const reserved = new Set(
      GROUP_IDS.filter((other) => other !== id).flatMap((other) => input.choice[other]?.picked ?? [])
    )
    let team: string[]
    if (def.readerPlays) {
      // The later teams of the reader's that still want somebody and picked nobody themselves.
      const reserve = order
        .slice(at + 1)
        .filter((other) => {
          const wanted = input.choice[other]
          return (
            GROUPS[other].readerPlays &&
            GROUPS[other].gender === def.gender &&
            (wanted === undefined || wanted.count > 0) &&
            (wanted?.picked.length ?? 0) === 0
          )
        }).length
      team = drawReaderTeam(def, eligible, choice, taken, reserved, reserve, `${input.seed}:${id}:members`)
    } else {
      team = drawMembers(
        def,
        eligible,
        choice as TeamChoice,
        taken,
        `${input.seed}:${id}:members`,
        reserved
      )
      if (team.length === 0) {
        agendas[id] = {
          sessions: [],
          unformed: {
            asked: (choice as TeamChoice).count,
            left: eligible.filter((charId) => !taken.has(charId)).length
          }
        }
        continue
      }
    }
    for (const charId of team) taken.add(charId)
    if (team.length > 0) members[id] = team
    const sessions = groupSessionSlots({
      location: def.location,
      members: team,
      busy: input.busy,
      playerClassSlots: input.playerClassSlots,
      count: TEAM_SESSIONS_PER_WEEK,
      taken: held.get(def.location),
      lenient: def.readerPlays,
      seed: `${input.seed}:${id}:sessions`
    })
    held.set(def.location, new Set([...(held.get(def.location) ?? []), ...sessions.slots]))
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

/** The same for a men's team, whose reader can play: the base is higher and he adds his own. */
export const MEN_WIN_BASE = 0.45
export const MEN_WIN_PER_STRENGTH = 0.15
export const MEN_WIN_PER_READER = 0.3
export const MEN_WIN_CAP = 0.9

/** How many of the members are free to be there, from 0 to 1. */
export function eventStrength(
  members: readonly string[],
  isFree: (charId: string) => boolean
): number {
  if (members.length === 0) return 0
  return members.filter(isFree).length / members.length
}

/**
 * A team's strength on a night. A men's team with nobody of the roster on it is all unnamed
 * teammates, who are always there.
 */
export function teamStrength(
  group: GroupDef,
  members: readonly string[],
  isFree: (charId: string) => boolean
): number {
  if (members.length === 0 && group.readerPlays) return 1
  return eventStrength(members, isFree)
}

/** What the reader brings to a game he plays: his Body tier and the share of practices he went to. */
export interface ReaderPlay {
  tier: number
  /** From 0 to 1; 1 for a team that has not practiced yet. */
  practiceShare: number
}

/** The share of his team's practices he went to; a team that has not practiced counts as all. */
export function practiceShareOf(team: Pick<GroupTeam, 'held' | 'attended'>): number {
  return team.held > 0 ? Math.min(1, team.attended / team.held) : 1
}

/** The odds a group wins an event at this strength. */
export function winChance(strength: number): number {
  return WIN_BASE + WIN_PER_STRENGTH * Math.min(1, Math.max(0, strength))
}

/**
 * The odds a men's team wins a game at this strength, with the reader's part when he plays: his
 * Body tier (0 at the first, 1 at the last) times the share of practices he went to.
 */
export function menWinChance(strength: number, reader?: ReaderPlay): number {
  const team = MEN_WIN_BASE + MEN_WIN_PER_STRENGTH * Math.min(1, Math.max(0, strength))
  const body = reader ? (reader.tier - 1) / (MAX_TIER - 1) : 0
  const part = reader ? MEN_WIN_PER_READER * body * Math.min(1, Math.max(0, reader.practiceShare)) : 0
  return Math.min(MEN_WIN_CAP, team + part)
}

/** A football team's points: touchdowns of seven and field goals of three. */
function gridironPoints(rand: () => number, touchdowns: number, spanTd: number): number {
  return 7 * (touchdowns + Math.floor(rand() * spanTd)) + 3 * Math.floor(rand() * 3)
}

/** The winner's and the loser's points of a football game: 24–17, never a score the sport cannot make. */
function gridironScore(rand: () => number): [number, number] {
  for (let tries = 0; tries < 40; tries++) {
    const winner = gridironPoints(rand, 2, 4)
    const loser = gridironPoints(rand, 0, 4)
    if (winner > loser) return [winner, loser]
  }
  return [24, 17]
}

/** The winner's and the loser's points of a college basketball game: 64 to 95, by a few to twenty-four. */
function hoopsScore(rand: () => number): [number, number] {
  const winner = 64 + Math.floor(rand() * 32)
  const margin = 1 + Math.floor(rand() * rand() * 24)
  return [winner, winner - margin]
}

/**
 * How an event ends: won by the odds and the seed, and scored by the sport: the winner on 52% to
 * 64% of a share of points, the sets of a match played to three (the loser taking none, one or
 * two of them), a college basketball score, or a football score of threes and sevens. The same
 * group, strength, reader and seed always end it the same way.
 */
export function gameResult(
  group: GroupDef,
  strength: number,
  seed: string,
  reader?: ReaderPlay
): GroupResult {
  const rand = seededRand(seed)
  const chance = group.readerPlays ? menWinChance(strength, reader) : winChance(strength)
  const won = rand() < chance
  const { scoring } = group
  let winner: number
  let loser: number
  if (scoring.kind === 'gridiron') [winner, loser] = gridironScore(rand)
  else if (scoring.kind === 'hoops') [winner, loser] = hoopsScore(rand)
  else if (scoring.kind === 'sets') {
    winner = scoring.toWin
    loser = Math.floor(rand() * scoring.toWin)
  } else {
    winner = Math.round(scoring.total * (0.52 + rand() * 0.12))
    loser = scoring.total - winner
  }
  return won ? { won, home: winner, away: loser } : { won, home: loser, away: winner }
}

/** The odds of making a team by the reader's Body tier, tier 1 first. */
export const TRYOUT_CHANCES: readonly number[] = [0.15, 0.35, 0.55, 0.75, 0.9]

/**
 * How a tryout ends: made when the seed's roll falls under the odds of the Body tier his points
 * buy. Going is the whole of his presence; luck is the roll. The same points and seed always end
 * it the same way.
 */
export function tryoutVerdict(bodyPoints: number, seed: string): TryoutResult {
  const tier = tierOf(bodyPoints)
  return { made: seededRand(seed)() < TRYOUT_CHANCES[tier - 1], tier }
}

/** The group a tryout id names, or `undefined` for an id that is not one. */
export function tryoutOf(eventId: string): { group: GroupDef; tryout: TryoutDef } | undefined {
  for (const id of GROUP_IDS) {
    const tryout = GROUPS[id].tryout
    if (tryout?.id === eventId) return { group: GROUPS[id], tryout }
  }
  return undefined
}

/** What the button for a tryout says. */
export function tryoutButton(tryout: TryoutDef): string {
  return `Go to the ${tryout.label}`
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

/** The occasion a tryout becomes once it has a day. */
function tryoutOccasion(group: GroupDef, tryout: TryoutDef, date: number): Occasion {
  const title = `${tryout.label.charAt(0).toUpperCase()}${tryout.label.slice(1)}`
  return {
    id: tryout.id,
    title,
    description: `Open tryouts for ${group.name} at ${locationLabel(group.location)}: anybody may try out, and the coach picks who makes the team.`,
    startDate: date,
    endDate: date,
    time: TRYOUT_TIME,
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
  /** Whether the reader has a class in a half-day, which no tryout is held in. */
  readerBusy?: (date: number, time: TimeSlot) => boolean
  /**
   * The weekly periods a men's team practices in. A rush event keeps off them where the week
   * allows, since a practice he misses is a strike.
   */
  practiceSlots?: ReadonlySet<number>
  /**
   * The days no party or mixer may fall on: the exam weeks and the whole of spring break, from
   * the day those who travel leave to the day they are back. Defaults to `avoid`.
   */
  partyAvoid?: readonly { startDate: number; endDate: number }[]
}

/**
 * Gives every tryout and every event of every group with a team its day: the first candidate
 * whose half-day no occasion and no other event holds, outside the weeks to avoid, with at least
 * {@link MIN_SESSION_ATTENDEES} members free (a tryout asks for nobody, and none is held in a
 * period the reader has a class in). Tryouts come first. An event no candidate can hold is
 * returned with the reason and never dropped; the same input always places the same days.
 */
export function placeGroupEvents(input: EventPlacementInput): {
  placed: Occasion[]
  leftOut: Partial<Record<GroupId, LeftOutEvent[]>>
  /** The rush events no half-day could hold, by house. */
  houseLeftOut: Partial<Record<HouseId, LeftOutEvent[]>>
} {
  const placed: Occasion[] = []
  const leftOut: Partial<Record<GroupId, LeftOutEvent[]>> = {}
  const houseLeftOut: Partial<Record<HouseId, LeftOutEvent[]>> = {}

  const dayFor = (
    candidates: readonly number[],
    time: TimeSlot,
    members: readonly string[],
    least: number,
    readerFree: boolean
  ): { day?: number; reason: LeftOutEventReason } => {
    const open = candidates.filter(
      (date) =>
        !input.avoid.some((range) => date >= range.startDate && date <= range.endDate) &&
        !(readerFree && input.readerBusy?.(date, time)) &&
        ![...input.occasions, ...placed].some((occasion) => occupies(occasion, date, time))
    )
    const day = open.find((date) => least === 0 || input.freeCount(members, date, time) >= least)
    return { day, reason: open.length === 0 ? 'no_date' : 'too_few_free' }
  }
  const leave = (id: GroupId, eventId: string, reason: LeftOutEventReason): void => {
    leftOut[id] = [...(leftOut[id] ?? []), { id: eventId, reason }]
  }

  for (const id of GROUP_IDS) {
    const tryout = GROUPS[id].tryout
    if (!tryout || !GROUPS[id].readerPlays) continue
    const { day, reason } = dayFor(tryout.candidates, TRYOUT_TIME, [], 0, true)
    if (day !== undefined) placed.push(tryoutOccasion(GROUPS[id], tryout, day))
    else leave(id, tryout.id, reason)
  }
  // The rush comes second: it has the fewest half-days to choose from, and nothing else of the
  // first two weeks competes with it for them.
  for (const event of RUSH_EVENTS) {
    const free = (half: { date: number; time: TimeSlot }): boolean =>
      !input.avoid.some((range) => half.date >= range.startDate && half.date <= range.endDate) &&
      ![...input.occasions, ...placed].some((occasion) => occupies(occasion, half.date, half.time))
    const practicing = (half: { date: number; time: TimeSlot }): boolean =>
      input.practiceSlots?.has(shiftSlotOf(half.date % 7, half.time)) === true
    const options = rushCandidates(event)
    const half = options.find((entry) => free(entry) && !practicing(entry)) ?? options.find(free)
    if (half) placed.push(rushOccasion(event, half))
    else {
      houseLeftOut[event.house] = [
        ...(houseLeftOut[event.house] ?? []),
        { id: event.id, reason: 'no_date' }
      ]
    }
  }
  for (const id of GROUP_IDS) {
    const members = input.members[id] ?? []
    const reads = GROUPS[id].readerPlays
    // A team the reader can join plays whoever of the roster is on it, so it is never skipped.
    if (members.length === 0 && !reads) continue
    for (const event of GROUPS[id].events) {
      const least = reads ? Math.min(MIN_SESSION_ATTENDEES, members.length) : MIN_SESSION_ATTENDEES
      let found = dayFor(event.candidates, GROUP_EVENT_TIME, members, least, false)
      // A men's game with nobody named free is the last choice, not none: the unnamed play it.
      if (found.day === undefined && reads) {
        found = dayFor(event.candidates, GROUP_EVENT_TIME, members, 0, false)
      }
      if (found.day !== undefined) placed.push(groupEventOccasion(GROUPS[id], event, found.day))
      else leave(id, event.id, found.reason)
    }
  }
  // The parties and the mixers come last: there are many of them, and losing one is the least harm.
  const nights = placeHouseNights(input, placed)
  placed.push(...nights.placed)
  for (const [house, left] of Object.entries(nights.leftOut)) {
    houseLeftOut[house as HouseId] = [...(houseLeftOut[house as HouseId] ?? []), ...(left ?? [])]
  }
  return { placed, leftOut, houseLeftOut }
}

/**
 * Gives every party and every mixer its night: the first of its candidates that is outside the
 * weeks to avoid and that nothing else holds and, where the week allows, that no men's team
 * practices in (as rush does), parties first and each in the order of the dates.
 * The fraternities take the parties in turn, and the two houses of a pair take its mixers in turn,
 * over the ones that found a night, so that a lost weekend moves nobody's turn. What no night can
 * hold is returned under the house whose turn it would have been, and a mixer's under its pair's
 * fraternity, and never dropped.
 */
function placeHouseNights(
  input: EventPlacementInput,
  before: readonly Occasion[]
): { placed: Occasion[]; leftOut: Partial<Record<HouseId, LeftOutEvent[]>> } {
  const placed: Occasion[] = []
  const leftOut: Partial<Record<HouseId, LeftOutEvent[]>> = {}
  const avoid = input.partyAvoid ?? input.avoid
  const free = (day: number): boolean =>
    !avoid.some((range) => day >= range.startDate && day <= range.endDate) &&
    ![...input.occasions, ...before, ...placed].some((occasion) => occupies(occasion, day, 1))
  const practicing = (day: number): boolean =>
    input.practiceSlots?.has(shiftSlotOf(day % 7, 1)) === true
  const nightFor = (candidates: readonly number[]): number | undefined =>
    candidates.find((day) => free(day) && !practicing(day)) ?? candidates.find(free)
  const nights = houseNights()
  let parties = 0
  for (const night of nights.filter((entry) => entry.kind === 'party')) {
    const day = nightFor(night.candidates)
    const host = partyHost(parties)
    if (day === undefined) {
      leftOut[host] = [...(leftOut[host] ?? []), { id: partyEventId(host, night.week), reason: 'no_date' }]
      continue
    }
    placed.push(partyOccasion(host, night.week, day))
    parties++
  }
  const mixers: Partial<Record<HouseId, number>> = {}
  for (const night of nights.filter((entry) => entry.kind === 'mixer')) {
    const pair = night.pair as HouseId
    const host = mixerHost(pair, mixers[pair] ?? 0)
    const day = nightFor(night.candidates)
    if (day === undefined) {
      leftOut[pair] = [...(leftOut[pair] ?? []), { id: mixerEventId(host, night.week), reason: 'no_date' }]
      continue
    }
    placed.push(mixerOccasion(host, night.week, day))
    mixers[pair] = (mixers[pair] ?? 0) + 1
  }
  return { placed, leftOut }
}

// ─── The fraternities' meetings and the bid ───────────────────────────────────

/** What {@link dealHouseSessions} reads. */
export interface HouseSessionInput {
  members: HouseMembers
  /** The `ShiftSlot`s each person of the roster owes to a class or a shift, keyed by charId. */
  busy: Readonly<Record<string, ReadonlySet<number>>>
  /** The `ShiftSlot`s the reader has a class in, which are never a meeting. */
  playerClassSlots: ReadonlySet<number>
  /** The periods the men's teams practice in, which a meeting keeps off where the week allows. */
  practiceSlots: ReadonlySet<number>
  seed: string
}

/** The houses the reader can join: the fraternities. */
export const BID_HOUSES: readonly HouseId[] = HOUSE_IDS.filter(
  (id) => HOUSES[id].kind === 'fraternity'
)

/**
 * When each fraternity meets: {@link PLEDGE_SESSIONS_PER_WEEK} periods a week, none in a class of
 * the reader's and, where the week has room, none in a period a men's team practices in. A house
 * always finds its meetings: the periods with the most of its roster free come first, and one
 * with too few free is the last choice rather than none.
 */
export function dealHouseSessions(
  input: HouseSessionInput
): Partial<Record<HouseId, GroupAgenda>> {
  const agendas: Partial<Record<HouseId, GroupAgenda>> = {}
  for (const house of BID_HOUSES) {
    const base = {
      location: house,
      members: input.members[house] ?? [],
      busy: input.busy,
      playerClassSlots: input.playerClassSlots,
      count: PLEDGE_SESSIONS_PER_WEEK,
      lenient: true,
      seed: `${input.seed}:${house}:sessions`
    }
    const slots = [...groupSessionSlots({ ...base, taken: input.practiceSlots }).slots]
    if (slots.length < PLEDGE_SESSIONS_PER_WEEK) {
      slots.push(
        ...groupSessionSlots({
          ...base,
          count: PLEDGE_SESSIONS_PER_WEEK - slots.length,
          taken: new Set(slots)
        }).slots
      )
    }
    slots.sort((a, b) => a - b)
    agendas[house] = {
      sessions: slots,
      ...(slots.length < PLEDGE_SESSIONS_PER_WEEK
        ? { leftOutSessions: PLEDGE_SESSIONS_PER_WEEK - slots.length }
        : {})
    }
  }
  return agendas
}

/** The day the bid is decided: the Sunday that ends the second week. */
export const BID_DAY = 13

/** What each part of a fraternity's score is worth. */
export const BID_WEIGHT_EVENTS = 0.5
export const BID_WEIGHT_LIKING = 0.3
export const BID_WEIGHT_STAT = 0.2

/** How many of its events he must have gone to for that part of the score to be full. */
export const BID_EVENTS_FOR_FULL = 3

/** The affection at which a member of the house likes him as much as the score counts. */
export const BID_AFFECTION_FULL = 30

/** The score a house needs to bid, with somebody of the roster in it and with nobody. */
export const BID_THRESHOLD_CAST = 0.4
export const BID_THRESHOLD_UNNAMED = 0.5

/** What the bid reads about one fraternity. */
export interface BidHouseInput {
  house: HouseId
  /** How many of the house's rush events he went to. */
  events: number
  /** What each member of the roster living in it feels for him, as an affection score. */
  affections: readonly number[]
  /** His tier in the stat the house values. */
  tier: number
  /** The periods the house meets in. */
  sessions: readonly ShiftSlot[]
}

/** Who bids on him, who would have but for the clash, and what each house scored. */
export interface BidVerdict {
  invited: HouseId[]
  clashed: HouseId[]
  scores: Partial<Record<HouseId, number>>
}

/** How much a member likes him, from −1 (she hates him) to 1 (she is as fond as the score counts). */
function likingOf(affection: number): number {
  return Math.max(-1, Math.min(affection / BID_AFFECTION_FULL, 1))
}

/**
 * A fraternity's score: half for the events he went to (full at three), three tenths for how much
 * its members of the roster like him on average (none, where it has nobody of the roster), and
 * two tenths for his tier in the stat it values.
 */
export function bidScore(input: BidHouseInput): number {
  const liking =
    input.affections.length === 0
      ? 0
      : input.affections.reduce((sum, value) => sum + likingOf(value), 0) / input.affections.length
  const score =
    BID_WEIGHT_EVENTS * Math.min(input.events / BID_EVENTS_FOR_FULL, 1) +
    BID_WEIGHT_LIKING * liking +
    BID_WEIGHT_STAT * ((input.tier - 1) / (MAX_TIER - 1))
  // To two places, so that a score on the line itself is on it however the sum was reached.
  return Math.round(score * 100) / 100
}

/**
 * Which fraternities bid on the reader: those that score past their threshold, which is higher
 * where the house has nobody of the roster, and never for one whose events he went to none of. A
 * house that would bid but meets in a period his team practices in does not, and is named apart.
 * `teamSessions` is the periods of the team he is on, or none. The same input gives the same
 * answer.
 */
export function bidVerdict(
  houses: readonly BidHouseInput[],
  teamSessions: readonly ShiftSlot[]
): BidVerdict {
  const verdict: BidVerdict = { invited: [], clashed: [], scores: {} }
  for (const input of houses) {
    const score = bidScore(input)
    verdict.scores[input.house] = score
    const needed = input.affections.length === 0 ? BID_THRESHOLD_UNNAMED : BID_THRESHOLD_CAST
    if (input.events < 1 || score < needed) continue
    if (input.sessions.some((slot) => teamSessions.includes(slot))) verdict.clashed.push(input.house)
    else verdict.invited.push(input.house)
  }
  return verdict
}

/** How many of a house's rush events he went to. */
export function rushEventsAttended(attended: readonly string[], house: HouseId): number {
  return attended.filter((id) => rushEventOf(id)?.house === house).length
}

// ─── The reader's practices ────────────────────────────────────────────────────

/** What a practice pays the reader: one point of Body, a fixed rule of the code like a shift's. */
export const PRACTICE_GAIN: ShiftGain = {
  stats: ['body'],
  text: 'Running drills until your legs shook was a real workout.'
}

/** What a game he plays pays the reader: one point of Body, fixed by the code like a practice. */
export const GAME_GAIN: ShiftGain = {
  stats: ['body'],
  text: 'Playing a real game, with a crowd watching, took everything you had.'
}

/** What the game knows about a slot that decides whether a practice is held in it. */
export interface PracticeContext {
  /** The weekly period a global slot id falls in. */
  shiftSlotAt: (slotId: number) => ShiftSlot
  /** Whether the university is shut that day: a holiday, spring break or any day without classes. */
  closedOn: (date: number) => boolean
  /** Whether a group's event at his team's place holds the slot, his own team's or another's. */
  eventAt: (slotId: number) => boolean
  /** Whether a class or a shift of his holds the slot, which outranks the practice. */
  otherCommitmentAt: (slotId: number) => boolean
}

/**
 * Whether his team practices in a slot: it is one of the team's sessions, he is on the team
 * by then, classes still meet, the university is open, and neither a group's event at his
 * team's place nor a class or a shift of his holds it. The one rule the clock's commitments and the strikes both ask.
 * A house's pledge meeting is asked the same, from the slot after he said yes to `lastDate`.
 */
export function practiceHeld(
  team: Pick<GroupTeam, 'since'>,
  sessions: readonly ShiftSlot[],
  slotId: number,
  context: PracticeContext,
  lastDate: number = LAST_CLASS_DATE
): boolean {
  const date = Math.floor(slotId / 2)
  return (
    slotId >= team.since &&
    date <= lastDate &&
    sessions.includes(context.shiftSlotAt(slotId)) &&
    !context.closedOn(date) &&
    !context.eventAt(slotId) &&
    !context.otherCommitmentAt(slotId)
  )
}

/** The coach's text for a missed practice, by how many he has missed. */
export type StrikeKind = 'missed' | 'missed2' | 'expelled'

/** What {@link settleSessions} reads of a team or a pledge: how its sessions stand. */
export type SessionStanding = Pick<
  GroupTeam,
  'strikes' | 'settledThrough' | 'attendedSlots' | 'held' | 'attended'
>

/** What {@link settleSessions} concluded, as data the caller applies. */
export interface SessionSettle {
  /** The practices missed, each with the text its strike calls for. */
  strikes: Array<{ slotId: number; kind: StrikeKind }>
  /** His strikes after the pass. */
  total: number
  /** The practices held in the slots judged, and how many of them he went to. */
  held: number
  attended: number
  /** The last slot judged: the one asked for, or the slot he was put out in. */
  settledThrough: number
  /** The pass took him to the most misses a team allows. */
  expelled: boolean
}

/**
 * Judges every slot from `team.settledThrough + 1` through `throughSlot`: a practice held in a
 * slot he did not go to is a strike, and the last allowed puts him out. The same pass asked
 * again from the same team gives the same answer, and a team that has judged a slot never
 * judges it again.
 */
export function settleSessions(
  team: SessionStanding,
  throughSlot: number,
  held: (slotId: number) => boolean
): SessionSettle {
  const strikes: SessionSettle['strikes'] = []
  let total = team.strikes
  let settledThrough = team.settledThrough
  let expelled = false
  let heldCount = 0
  let attended = 0

  for (let slotId = team.settledThrough + 1; slotId <= throughSlot; slotId++) {
    settledThrough = slotId
    if (!held(slotId)) continue
    heldCount += 1
    if (team.attendedSlots.includes(slotId)) {
      attended += 1
      continue
    }
    total += 1
    expelled = total >= MAX_STRIKES
    strikes.push({ slotId, kind: expelled ? 'expelled' : total === 1 ? 'missed' : 'missed2' })
    if (expelled) break
  }
  return { strikes, total, held: heldCount, attended, settledThrough, expelled }
}

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

/** A small count in words, capitalized when asked. */
function countWord(count: number, capital: boolean): string {
  const word = COUNT_WORDS[count] ?? String(count)
  return capital ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word
}

/**
 * The text his coach sends: the team's own words for the kind, with the practice periods, the
 * place and the counts written in. \`strikes\` is how many he has missed once this text is sent.
 */
export function coachText(
  group: GroupDef,
  kind: CoachKind,
  sessions: readonly ShiftSlot[],
  strikes = 0
): string | null {
  const template = group.coach?.texts[kind]
  if (!template) return null
  return fillTemplate(template, {
    hours: sessions.map(shiftSlotFullLabel).join(' and '),
    place: locationLabel(group.location),
    limit: MAX_STRIKES,
    strike: strikes,
    left: Math.max(0, MAX_STRIKES - strikes)
  })
}

/** Writes the values into a text's `{token}`s; a capitalized token capitalizes a count. */
function fillTemplate(template: string, values: Record<string, number | string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, token: string) => {
    const key = `${token.charAt(0).toLowerCase()}${token.slice(1)}`
    const value = values[key]
    if (value === undefined) return whole
    return typeof value === 'number' ? countWord(value, token !== key) : value
  })
}

/** The kinds of text a house sends its pledge. */
export type PledgeKind =
  | 'intro'
  | 'missed'
  | 'missed2'
  | 'expelled'
  | 'initiation'
  | 'initiationTonight'
  | 'reminder'
  | 'member'
  | 'noShow'

/** What a house says to its pledge, in the game's own fixed words. */
const PLEDGE_TEXTS: Record<PledgeKind, string> = {
  intro: "Welcome to {house}. You're a pledge now. We meet {hours} at the house. Be there, every time.",
  missed: "You weren't at the meeting. That's {strike}. {Limit} misses and your pledge is over.",
  missed2: "That's {strike}. {Left} more and your pledge is over.",
  expelled: "That's {strike}. Your pledge is over. You're not one of us.",
  initiation: 'The meetings are over. Your initiation is {when}, at the house. Be there.',
  initiationTonight: 'The meetings are over. Your initiation is tonight, at the house. Be there.',
  reminder: "Tonight is your initiation, at the house. Don't be late.",
  member: "Welcome to {house}. You're one of us now. Your room is ready.",
  noShow: "You didn't show. Your pledge is over. You're not one of us."
}

/** The house's text to its pledge, with the meeting periods and the count written in. */
export function pledgeText(
  house: HouseId,
  kind: PledgeKind,
  sessions: readonly ShiftSlot[],
  strikes = 0,
  when = ''
): string {
  return fillTemplate(PLEDGE_TEXTS[kind], {
    house: HOUSES[house].nickname,
    hours: sessions.map(shiftSlotFullLabel).join(' and '),
    limit: MAX_STRIKES,
    strike: strikes,
    left: Math.max(0, MAX_STRIKES - strikes),
    when
  })
}

// ─── The initiation ────────────────────────────────────────────────────────────

/** The nights of the seventh week an initiation may fall on, the latest first: Friday to Monday. */
const INITIATION_NIGHTS: readonly number[] = [46, 45, 44, 43, 42]

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** The night slot of a day. */
function nightOf(day: number): number {
  return day * 2 + 1
}

/** What a day of the week is called. */
function dayName(day: number): string {
  return DAY_NAMES[((day % 7) + 7) % 7]
}

/** The night a slot id is, as the house words it: `Friday night`. */
export function initiationNightName(slotId: number): string {
  return `${dayName(Math.floor(slotId / 2))} night`
}

/** What {@link initiationSlot} reads. */
export interface InitiationInput {
  /** The slot about to begin, which is the first the initiation may be set on. */
  fromSlot: number
  /** What holds the reader's slot, in words ("a class", "a shift", "his practice"), or null if nothing. */
  busyAt: (slotId: number) => string | null
  /** The days the university is shut, which no night is set in. */
  closed?: readonly { startDate: number; endDate: number }[]
}

/** The night chosen, why, and whether it is the last resort or a late pick. */
export interface InitiationPick {
  slot: number
  why: string
  /** The Sunday of the last day of the pledge, or the first Sunday a late pick falls back on. */
  lastResort: boolean
}

/**
 * The night of the initiation: the latest night of the seventh week that nothing of his holds,
 * from the Friday back to the Monday, and the Sunday that ends the pledge only when no night of
 * the week is free. A pick made late, after some nights are gone, takes the latest free night
 * that is left, and past the week the first free night that is not in a break; with none, the
 * first Sunday, which has no class. Nothing here reads the clock or the store.
 */
export function initiationSlot(input: InitiationInput): InitiationPick {
  const day = Math.floor(input.fromSlot / 2)
  const shut = (date: number): boolean =>
    (input.closed ?? []).some((range) => date >= range.startDate && date <= range.endDate)
  const busy: string[] = []
  const tried = (date: number): { free: boolean } => {
    const reason = input.busyAt(nightOf(date))
    if (reason !== null) busy.push(`${dayName(date)} night has ${reason}`)
    return { free: reason === null }
  }

  if (day <= PLEDGE_LAST_DAY) {
    for (const date of INITIATION_NIGHTS) {
      if (shut(date)) continue
      if (tried(date).free) {
        return {
          slot: nightOf(date),
          why: busy.length === 0 ? `${dayName(date)} night free` : `${busy.join(', ')}, ${dayName(date)} free`,
          lastResort: false
        }
      }
    }
    return { slot: nightOf(PLEDGE_LAST_DAY), why: 'no night of week 7 free', lastResort: true }
  }

  const left = INITIATION_NIGHTS.filter((date) => date >= day && nightOf(date) >= input.fromSlot)
  for (const date of left) {
    if (shut(date)) continue
    if (tried(date).free) {
      return {
        slot: nightOf(date),
        why: `late, ${busy.length === 0 ? `${dayName(date)} night free` : `${busy.join(', ')}, ${dayName(date)} free`}`,
        lastResort: false
      }
    }
  }
  let sunday: number | null = null
  for (let date = Math.max(day, INITIATION_NIGHTS[0] + 1); date <= LAST_CLASS_DATE; date++) {
    if (nightOf(date) < input.fromSlot || shut(date)) continue
    if (date % 7 === 6 && sunday === null) sunday = date
    if (input.busyAt(nightOf(date)) === null) {
      return { slot: nightOf(date), why: `late, past week 7: ${dayName(date)} night free`, lastResort: false }
    }
  }
  const fallback = sunday ?? Math.max(day, INITIATION_NIGHTS[0] + 1)
  return { slot: nightOf(fallback), why: 'late, no free night left', lastResort: true }
}

/** The Bunnyboard conversation key for a house's texts to its pledge, one per house. */
export function houseChatIdOf(id: HouseId): string {
  return `house:${id}`
}

/** The house behind a conversation key, or `undefined` for a key that is not one. */
export function houseOfChatId(chatId: string): HouseId | undefined {
  if (!chatId.startsWith('house:')) return undefined
  const id = chatId.slice('house:'.length)
  return isHouse(id) ? id : undefined
}

/** The Bunnyboard conversation key for a team's coach, one per team. */
export function coachChatIdOf(id: GroupId): string {
  return `team:${id}`
}

/** The group behind a coach's conversation key, or `undefined` for a key that is not one. */
export function groupOfCoachChat(chatId: string): GroupDef | undefined {
  return chatId.startsWith('team:') ? groupDefOf(chatId.slice('team:'.length)) : undefined
}
