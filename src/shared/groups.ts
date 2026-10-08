/**
 * Groups: a team's members, its place and its weekly sessions. The table is code, the draw of
 * who belongs and when they meet is made once at New Game, and nothing here reads the clock or
 * the store.
 */

import { LAST_CLASS_DATE } from './classes'
import { seededRand } from './hash'
import { MAX_STRIKES, SHIFT_SLOTS, shiftSlotFullLabel } from './jobs'
import { isLocationOpen, locationLabel } from './locations'
import { tierOf, type ShiftGain } from './playerStats'
import { pronounsOf } from './pronouns'
import { shuffle } from './shuffle'
import type { Gender, Occasion, OutfitSet, ShiftSlot, TimeSlot } from './types'

/** Every group there is. The order is the order New Game draws their teams in. */
export type GroupId = 'swimming' | 'volleyball' | 'basketball' | 'football'

export const GROUP_IDS: readonly GroupId[] = ['swimming', 'volleyball', 'basketball', 'football']

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
  /** How an event is scored: points shared out, or the sets of a match played to three. */
  scoring: { kind: 'points'; total: number } | { kind: 'sets'; toWin: number }
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
    scoring: { kind: 'points', total: 160 },
    events: [],
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
    scoring: { kind: 'points', total: 60 },
    events: [],
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
    attendedSlots: saved.attendedSlots ?? []
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
} {
  const placed: Occasion[] = []
  const leftOut: Partial<Record<GroupId, LeftOutEvent[]>> = {}

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
  for (const id of GROUP_IDS) {
    const members = input.members[id]
    if (!members || members.length === 0) continue
    for (const event of GROUPS[id].events) {
      const { day, reason } = dayFor(
        event.candidates,
        GROUP_EVENT_TIME,
        members,
        MIN_SESSION_ATTENDEES,
        false
      )
      if (day !== undefined) placed.push(groupEventOccasion(GROUPS[id], event, day))
      else leave(id, event.id, reason)
    }
  }
  return { placed, leftOut }
}

// ─── The reader's practices ────────────────────────────────────────────────────

/** What a practice pays the reader: one point of Body, a fixed rule of the code like a shift's. */
export const PRACTICE_GAIN: ShiftGain = {
  stats: ['body'],
  text: 'Running drills until your legs shook was a real workout.'
}

/** What the game knows about a slot that decides whether a practice is held in it. */
export interface PracticeContext {
  /** The weekly period a global slot id falls in. */
  shiftSlotAt: (slotId: number) => ShiftSlot
  /** Whether the university is shut that day: a holiday, spring break or any day without classes. */
  closedOn: (date: number) => boolean
  /** Whether an event of his own team holds the slot. */
  eventAt: (slotId: number) => boolean
  /** Whether a class or a shift of his holds the slot, which outranks the practice. */
  otherCommitmentAt: (slotId: number) => boolean
}

/**
 * Whether his team practices in a slot: it is one of the team's sessions, he is on the team
 * by then, classes still meet, the university is open, and neither his own team's event nor a
 * class or a shift of his holds it. The one rule the clock's commitments and the strikes both ask.
 */
export function practiceHeld(
  team: Pick<GroupTeam, 'since'>,
  sessions: readonly ShiftSlot[],
  slotId: number,
  context: PracticeContext
): boolean {
  const date = Math.floor(slotId / 2)
  return (
    slotId >= team.since &&
    date <= LAST_CLASS_DATE &&
    sessions.includes(context.shiftSlotAt(slotId)) &&
    !context.closedOn(date) &&
    !context.eventAt(slotId) &&
    !context.otherCommitmentAt(slotId)
  )
}

/** The coach's text for a missed practice, by how many he has missed. */
export type StrikeKind = 'missed' | 'missed2' | 'expelled'

/** What {@link settleSessions} concluded, as data the caller applies. */
export interface SessionSettle {
  /** The practices missed, each with the text its strike calls for. */
  strikes: Array<{ slotId: number; kind: StrikeKind }>
  /** His strikes after the pass. */
  total: number
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
  team: GroupTeam,
  throughSlot: number,
  held: (slotId: number) => boolean
): SessionSettle {
  const strikes: SessionSettle['strikes'] = []
  let total = team.strikes
  let settledThrough = team.settledThrough
  let expelled = false

  for (let slotId = team.settledThrough + 1; slotId <= throughSlot; slotId++) {
    settledThrough = slotId
    if (!held(slotId) || team.attendedSlots.includes(slotId)) continue
    total += 1
    expelled = total >= MAX_STRIKES
    strikes.push({ slotId, kind: expelled ? 'expelled' : total === 1 ? 'missed' : 'missed2' })
    if (expelled) break
  }
  return { strikes, total, settledThrough, expelled }
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
  const values: Record<string, number | string> = {
    hours: sessions.map(shiftSlotFullLabel).join(' and '),
    place: locationLabel(group.location),
    limit: MAX_STRIKES,
    strike: strikes,
    left: Math.max(0, MAX_STRIKES - strikes)
  }
  return template.replace(/\{(\w+)\}/g, (whole, token: string) => {
    const key = `${token.charAt(0).toLowerCase()}${token.slice(1)}`
    const value = values[key]
    if (value === undefined) return whole
    return typeof value === 'number' ? countWord(value, token !== key) : value
  })
}

/** The Bunnyboard conversation key for a team's coach, one per team. */
export function coachChatIdOf(id: GroupId): string {
  return `team:${id}`
}

/** The group behind a coach's conversation key, or `undefined` for a key that is not one. */
export function groupOfCoachChat(chatId: string): GroupDef | undefined {
  return chatId.startsWith('team:') ? groupDefOf(chatId.slice('team:'.length)) : undefined
}
