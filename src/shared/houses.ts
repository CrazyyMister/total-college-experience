/**
 * The four Greek houses on Laurel Row: who they are, who of the roster lives in each, and the
 * backgrounds that show their insides. A member lives in the house from the first day, in a room
 * of their own, and {@link homeOf} answers it; the house is a home, not a team.
 */

import { seededRand } from './hash'
import type { StatKey } from './playerStats'
import { pronounsOf } from './pronouns'
import { shuffle } from './shuffle'
import type { Gender, Occasion, TimeSlot } from './types'

export const HOUSE_IDS = ['kappa_row', 'xi_delt', 'sig_lam', 'pi_theta'] as const

/** A house, which is also the id of its place on the map and in the lorebook. */
export type HouseId = (typeof HOUSE_IDS)[number]

export function isHouse(value: string): value is HouseId {
  return (HOUSE_IDS as readonly string[]).includes(value)
}

export interface HouseDef {
  id: HouseId
  /** What the prompts call it in full. */
  name: string
  /** What everyone calls it. */
  nickname: string
  kind: 'fraternity' | 'sorority'
  /** Whom it takes. */
  gender: Gender
  /** The stat it prizes. */
  values: StatKey
  /** The house it holds its mixer with. */
  mixer: HouseId
  /** The fewest and the most of the roster it can hold. */
  minMembers: number
  maxMembers: number
  /** The outside every scene at the house may use. */
  frontBg: string
  /** The shared insides, which a scene may use only where the house lets the reader in. */
  insideBgs: readonly string[]
  /** A member's room, which is the reader's to see only in the house he lives in. */
  roomBg?: string
}

export const HOUSES: Readonly<Record<HouseId, HouseDef>> = {
  kappa_row: {
    id: 'kappa_row',
    name: 'Kappa Rho Omega',
    nickname: 'Kappa Row',
    kind: 'fraternity',
    gender: 'man',
    values: 'body',
    mixer: 'sig_lam',
    minMembers: 1,
    maxMembers: 3,
    frontBg: 'kappa_row_front',
    insideBgs: ['kappa_row_common', 'kappa_row_party'],
    roomBg: 'kappa_row_room'
  },
  xi_delt: {
    id: 'xi_delt',
    name: 'Xi Delta Phi',
    nickname: 'Xi Delt',
    kind: 'fraternity',
    gender: 'man',
    values: 'brain',
    mixer: 'pi_theta',
    minMembers: 1,
    maxMembers: 3,
    frontBg: 'xi_delt_front',
    insideBgs: ['xi_delt_common', 'xi_delt_party'],
    roomBg: 'xi_delt_room'
  },
  sig_lam: {
    id: 'sig_lam',
    name: 'Sigma Lambda Iota',
    nickname: 'Sig Lam',
    kind: 'sorority',
    gender: 'woman',
    values: 'heart',
    mixer: 'kappa_row',
    minMembers: 2,
    maxMembers: 4,
    frontBg: 'sig_lam_front',
    insideBgs: ['sorority_common']
  },
  pi_theta: {
    id: 'pi_theta',
    name: 'Pi Theta Eta',
    nickname: 'Pi Theta',
    kind: 'sorority',
    gender: 'woman',
    values: 'brain',
    mixer: 'xi_delt',
    minMembers: 2,
    maxMembers: 4,
    frontBg: 'pi_theta_front',
    insideBgs: ['sorority_common']
  }
}

/** Every background that shows the inside of a house, once each. */
export const HOUSE_INSIDE_BGS: readonly string[] = [
  ...new Set(
    HOUSE_IDS.flatMap((id) => [
      ...HOUSES[id].insideBgs,
      ...(HOUSES[id].roomBg ? [HOUSES[id].roomBg] : [])
    ])
  )
]

/** Whether the reader is let in a house, or kept at its door. */
export type HouseAccess = 'door' | 'inside'

/** What the answer to "how far does he get" depends on: the event the scene is, if it is one. */
export interface HouseDoor {
  event?: string | null
}

/**
 * How far the reader gets in a house: the front is always his, and the inside is for the house
 * whose own event the scene is. The one answer the scene's line and the backgrounds it may use
 * both ask, so that opening the inside for another reason is changing this function and nothing
 * else.
 */
export function houseAccess(house: HouseId, door: HouseDoor = {}): HouseAccess {
  return houseEventOf(door.event)?.host === house ? 'inside' : 'door'
}

/**
 * `bgs` without the insides of the Greek houses: a scene may use the living room and the party
 * space of a house that lets the reader in. A member's room is never among them until the house
 * is his.
 */
export function withoutClosedHouseBgs(bgs: readonly string[], door: HouseDoor = {}): string[] {
  const open = new Set(
    HOUSE_IDS.filter((id) => houseAccess(id, door) === 'inside').flatMap((id) => HOUSES[id].insideBgs)
  )
  return bgs.filter((bg) => !HOUSE_INSIDE_BGS.includes(bg) || open.has(bg))
}

// ─── Rush ──────────────────────────────────────────────────────────────────────

/** One half of one day. */
export interface HalfDay {
  date: number
  time: TimeSlot
}

/** One rush event a fraternity holds, dated at New Game out of its candidates. */
export interface RushEventDef {
  id: string
  house: HouseId
  /** What the event is called after the house's name. */
  title: string
  /** What the calendar's card says it is. */
  description: string
  /** The night it is held on if nothing else holds it. */
  first: HalfDay
}

/** The Thursday, Friday and Saturday nights of the first two weeks, in the order they fall. */
const RUSH_NIGHTS: readonly number[] = [3, 4, 5, 10, 11, 12]

/** The fraternities that rush, in the order their events alternate. */
const RUSH_HOUSES: readonly HouseId[] = ['kappa_row', 'xi_delt']

const RUSH_TITLES: readonly string[] = ['Open House', 'Meet the Brothers', 'Rush Social']

const RUSH_BLURBS: readonly string[] = [
  '{house} opens its doors to anybody curious about pledging, with food and music going and the brothers talking to whoever comes in.',
  '{house} holds an evening for anybody curious about pledging, where the brothers take turns introducing themselves and the house is open to meet them in.',
  '{house} throws a social for anybody curious about pledging, a relaxed one where the brothers look over who comes and who comes looking.'
]

/** Every rush event there is, alternating between the two fraternities. */
export const RUSH_EVENTS: readonly RushEventDef[] = RUSH_NIGHTS.map((date, at) => {
  const house = RUSH_HOUSES[at % RUSH_HOUSES.length]
  const nth = Math.floor(at / RUSH_HOUSES.length)
  return {
    id: `rush-${house}-${nth + 1}`,
    house,
    title: `${HOUSES[house].nickname} ${RUSH_TITLES[nth]}`,
    description: RUSH_BLURBS[nth].replace('{house}', HOUSES[house].nickname),
    first: { date, time: 1 as TimeSlot }
  }
})

/** The rush event an occasion id names, or `undefined` for any other id. */
export function rushEventOf(eventId: string | null | undefined): RushEventDef | undefined {
  return eventId ? RUSH_EVENTS.find((event) => event.id === eventId) : undefined
}

/** The rush events one house holds. */
export function rushEventsOf(house: HouseId): RushEventDef[] {
  return RUSH_EVENTS.filter((event) => event.house === house)
}

/** The weekend half-days a rush event falls back on when no night can hold it, in order. */
const RUSH_FALLBACKS: readonly HalfDay[] = [
  { date: 5, time: 0 },
  { date: 12, time: 0 },
  { date: 6, time: 0 },
  { date: 13, time: 0 },
  { date: 6, time: 1 }
]

/**
 * The half-days a rush event may be held on, best first: its own night, then the other nights
 * nearest to it, then the weekend's days. Never the night the bid is decided on.
 */
export function rushCandidates(event: RushEventDef): HalfDay[] {
  const nights: HalfDay[] = RUSH_NIGHTS.map((date) => ({ date, time: 1 as TimeSlot }))
  const others = nights
    .filter((half) => half.date !== event.first.date)
    .sort((a, b) => Math.abs(a.date - event.first.date) - Math.abs(b.date - event.first.date))
  return [event.first, ...others, ...RUSH_FALLBACKS]
}

/** The occasion a rush event becomes once it has a day. */
export function rushOccasion(event: RushEventDef, half: HalfDay): Occasion {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    startDate: half.date,
    endDate: half.date,
    time: half.time,
    cancelsClasses: false,
    kind: 'campus',
    house: event.house,
    where: event.house
  }
}

// ─── Parties and mixers ────────────────────────────────────────────────────────

/** The first and the last day a house throws a party or holds a mixer on: after rush, until the classes end. */
export const PARTY_FIRST_DAY = 14
export const PARTY_LAST_DAY = 105

/** The fraternities that throw the parties, in the order the parties alternate. */
const PARTY_HOUSES: readonly HouseId[] = ['kappa_row', 'xi_delt']

/**
 * The nights a party may be held on, as days from its Saturday, best first: the Saturday, the
 * Friday before it, the Sunday after it.
 */
export const PARTY_NIGHT_OFFSETS: readonly number[] = [0, -1, 1]

/** The nights a mixer may be held on, as days from its Friday, best first: the Thursday, then the Friday. */
export const MIXER_NIGHT_OFFSETS: readonly number[] = [-1, 0]

/** The pairs that hold a mixer, by their fraternity, taking the weeks in turn. */
const MIXER_PAIRS: readonly HouseId[] = ['kappa_row', 'xi_delt']

export type HouseEventKind = 'rush' | 'party' | 'mixer'

/** What an occasion id says of a house's event: which kind, whose, and, at a mixer, with whom. */
export interface HouseEvent {
  kind: HouseEventKind
  /** The house the event is held at. */
  host: HouseId
  /** The house a mixer is held with. */
  guest?: HouseId
}

/** A party's id: the house that throws it and the week it is for, counted from the first day. */
export function partyEventId(host: HouseId, week: number): string {
  return `party-${host}-w${week}`
}

/** A mixer's id: the house that hosts it and the week it is for. */
export function mixerEventId(host: HouseId, week: number): string {
  return `mixer-${host}-w${week}`
}

/** The house event an occasion id names, or `undefined` for any other id. */
export function houseEventOf(eventId: string | null | undefined): HouseEvent | undefined {
  if (!eventId) return undefined
  const rush = rushEventOf(eventId)
  if (rush) return { kind: 'rush', host: rush.house }
  const found = /^(party|mixer)-([a-z_]+)-w\d+$/.exec(eventId)
  if (!found || !isHouse(found[2])) return undefined
  const host = found[2]
  return found[1] === 'party'
    ? { kind: 'party', host }
    : { kind: 'mixer', host, guest: HOUSES[host].mixer }
}

/** One night a house wants, before it has a day. */
export interface HouseNight {
  kind: 'party' | 'mixer'
  /** The week it is for, counted from the first day. */
  week: number
  /** The fraternity of the pair that holds it, for a mixer. */
  pair?: HouseId
  /** The days it may fall on, best first, all at night. */
  candidates: number[]
}

/**
 * Every night the houses want from the first day to the last: a party each weekend, and, each
 * week, the mixer of the pair whose turn it is, so that each pair holds one every other week.
 */
export function houseNights(): HouseNight[] {
  const nights: HouseNight[] = []
  for (let week = Math.floor(PARTY_FIRST_DAY / 7); week * 7 + 4 <= PARTY_LAST_DAY; week++) {
    const saturday = week * 7 + 5
    if (saturday >= PARTY_FIRST_DAY && saturday <= PARTY_LAST_DAY) {
      nights.push({
        kind: 'party',
        week,
        candidates: PARTY_NIGHT_OFFSETS.map((offset) => saturday + offset)
      })
    }
    const friday = week * 7 + 4
    if (friday >= PARTY_FIRST_DAY) {
      nights.push({
        kind: 'mixer',
        week,
        pair: MIXER_PAIRS[week % MIXER_PAIRS.length],
        candidates: MIXER_NIGHT_OFFSETS.map((offset) => friday + offset)
      })
    }
  }
  return nights
}

/** The house that throws the party that is the `nth` one held (from zero). */
export function partyHost(nth: number): HouseId {
  return PARTY_HOUSES[nth % PARTY_HOUSES.length]
}

/** The house that hosts the `nth` mixer (from zero) of a pair: its fraternity first, then its sorority. */
export function mixerHost(pair: HouseId, nth: number): HouseId {
  return nth % 2 === 0 ? pair : HOUSES[pair].mixer
}

/** The word for the people of a house. */
function memberWord(house: HouseId): string {
  return HOUSES[house].kind === 'fraternity' ? 'brothers' : 'sisters'
}

/** The occasion a party becomes once it has a night. */
export function partyOccasion(host: HouseId, week: number, date: number): Occasion {
  const nickname = HOUSES[host].nickname
  return {
    id: partyEventId(host, week),
    title: `${nickname} Party`,
    description: `${nickname} throws a party at the house, with music, food and drinks going, and anybody who comes by is welcome.`,
    startDate: date,
    endDate: date,
    time: 1,
    cancelsClasses: false,
    kind: 'campus',
    house: host,
    where: host
  }
}

/** The occasion a mixer becomes once it has a night. */
export function mixerOccasion(host: HouseId, week: number, date: number): Occasion {
  const guest = HOUSES[host].mixer
  const [nickname, guestNickname] = [HOUSES[host].nickname, HOUSES[guest].nickname]
  return {
    id: mixerEventId(host, week),
    title: `${nickname} & ${guestNickname} Mixer`,
    description: `${nickname} and ${guestNickname} hold a mixer at ${nickname}: the ${memberWord(host)} and the ${memberWord(guest)} spend the night together, and anybody who comes by is welcome.`,
    startDate: date,
    endDate: date,
    time: 1,
    cancelsClasses: false,
    kind: 'campus',
    house: host,
    where: host
  }
}

/**
 * The houses an occasion is of, whose people alone may ask the reader along to it: the house
 * whose event it is, and, for a mixer, the house it holds the mixer with.
 */
export function occasionHouses(occasion: Pick<Occasion, 'house' | 'id'>): HouseId[] {
  const event = houseEventOf(occasion.id)
  if (event) return event.guest ? [event.host, event.guest] : [event.host]
  return occasion.house ? [occasion.house] : []
}

/**
 * Whether somebody of `house` (or of none) may ask the reader to an occasion: anybody may ask him
 * to one that is no house's, and only those who live in a house an occasion is of may ask him to
 * that one.
 */
export function mayAskTo(occasion: Pick<Occasion, 'house' | 'id'>, house: HouseId | undefined): boolean {
  const houses = occasionHouses(occasion)
  return houses.length === 0 || (house !== undefined && houses.includes(house))
}

/** What the reader's bid on a house is kept as: the day it was decided, who bid and the answer. */
export interface BidOffer {
  /** The day the bid was decided on, the last night of rush. */
  day: number
  /** The houses that bid on him. */
  invited: HouseId[]
  /** The houses that would have bid if their meetings did not clash with his team's. */
  clashed: HouseId[]
  /** What each fraternity scored, for the log and the development build. */
  scores: Partial<Record<HouseId, number>>
}

/** The bid and how it was answered: a house, `null` for none, absent while the window waits. */
export interface BidRecord extends BidOffer {
  answer?: HouseId | null
}

/** What a save keeps of rush: the events he went to, and the bid once it is decided. */
export interface RushSave {
  attended: string[]
  bid?: BidRecord
}

/** The house he has said yes to, and where he stands in it. */
export interface HouseStanding {
  id: HouseId
  stage: 'pledge'
  /** The slot id he said yes in. */
  since: number
}

/** The four offices of a house, the president first. */
export const OFFICE_IDS = ['president', 'social', 'rush', 'treasurer'] as const

export type OfficeId = (typeof OFFICE_IDS)[number]

export function isOffice(value: string): value is OfficeId {
  return (OFFICE_IDS as readonly string[]).includes(value)
}

/** What an office is called in a sentence. */
export const OFFICE_NAMES: Readonly<Record<OfficeId, string>> = {
  president: 'president',
  social: 'social chair',
  rush: 'rush chair',
  treasurer: 'treasurer'
}

/** How much more a senior weighs than anybody else in the draw for the presidency. */
export const SENIOR_PRESIDENT_WEIGHT = 3

/** The offices of each house that nobody of the roster holds. */
export type HouseOffices = Partial<Record<HouseId, OfficeId[]>>

/** Who of the roster holds which office, and the offices that are the unnamed's. */
export interface OfficeDeal {
  holders: Record<string, { house: HouseId; office: OfficeId }>
  unnamed: HouseOffices
}

/**
 * Deals the four offices of every house among its members of the roster: the presidency first,
 * with a senior (year 4) weighing {@link SENIOR_PRESIDENT_WEIGHT} to one, then the rest by
 * chance. Nobody holds two, and an office with nobody left is the unnamed's. The same seed deals
 * the same offices.
 */
export function dealOffices(input: {
  members: HouseMembers
  years: Readonly<Record<string, number>>
  seed: string
}): OfficeDeal {
  const holders: OfficeDeal['holders'] = {}
  const unnamed: HouseOffices = {}
  for (const house of HOUSE_IDS) {
    const rand = seededRand(`${input.seed}:offices:${house}`)
    const left = [...(input.members[house] ?? [])]
    const held = new Set<OfficeId>()
    if (left.length > 0) {
      const weights = left.map((charId) => (input.years[charId] === 4 ? SENIOR_PRESIDENT_WEIGHT : 1))
      let r = rand() * weights.reduce((sum, weight) => sum + weight, 0)
      let at = 0
      while (at < left.length - 1 && r >= weights[at]) {
        r -= weights[at]
        at += 1
      }
      holders[left[at]] = { house, office: 'president' }
      held.add('president')
      left.splice(at, 1)
    }
    const rest = shuffle(OFFICE_IDS.filter((office) => office !== 'president'), rand)
    const people = shuffle(left, rand)
    rest.forEach((office, at) => {
      if (people[at] === undefined) return
      holders[people[at]] = { house, office }
      held.add(office)
    })
    const open = OFFICE_IDS.filter((office) => !held.has(office))
    if (open.length > 0) unnamed[house] = [...open]
  }
  return { holders, unnamed }
}

/** What New Game asked for one house: how many, and who by name; the rest are drawn. */
export interface HouseChoice {
  count: number
  picked: string[]
}

/** New Game's whole answer on houses; a house it has no entry for is drawn. */
export type HousesChoice = Partial<Record<HouseId, HouseChoice>>

/** Who of the roster lives in each house. */
export type HouseMembers = Partial<Record<HouseId, string[]>>

/** Who of `roster` a house may take: those of its gender, less the barred. */
export function housePool(
  def: HouseDef,
  roster: readonly { charId: string; gender: Gender }[],
  barred: ReadonlySet<string>
): string[] {
  return roster
    .filter((entry) => entry.gender === def.gender && !barred.has(entry.charId))
    .map((entry) => entry.charId)
}

/** What {@link dealHouses} reads. */
export interface HouseDealInput {
  choice: HousesChoice
  roster: readonly { charId: string; gender: Gender; preferredStat: StatKey }[]
  /** Those no house may take: the reader's ex, and anybody known to be a freshman. */
  barred: ReadonlySet<string>
  seed: string
}

/** How much more a woman who looks for the stat a sorority prizes weighs in its draw. */
const SORORITY_TENDENCY = 3

/**
 * Settles the members of every house: the people picked by name first, then the rest drawn, up
 * to the count asked for or, where none was, from the house's least to its most. Nobody is in
 * two houses, and with two or more people for a gender every house of it gets one. A house the
 * roster cannot fill to its least has nobody of the roster. The same seed deals the same houses.
 */
export function dealHouses(input: HouseDealInput): HouseMembers {
  const members: HouseMembers = {}
  for (const gender of ['woman', 'man'] as const) {
    const houses = HOUSE_IDS.map((id) => HOUSES[id]).filter((def) => def.gender === gender)
    const pool = housePool(houses[0], input.roster, input.barred)
    const rand = seededRand(`${input.seed}:${gender}`)
    const order = shuffle(houses, rand)
    const picksOf = (def: HouseDef): string[] =>
      (input.choice[def.id]?.picked ?? []).filter((charId) => pool.includes(charId))
    const wants = (def: HouseDef): boolean => (input.choice[def.id]?.count ?? 1) > 0
    // Enough for every house to have its least; if not, the first drawn take it.
    const enough = pool.length >= order.filter(wants).reduce((sum, def) => sum + def.minMembers, 0)
    const taken = new Set<string>()

    order.forEach((def, at) => {
      if (!wants(def)) return
      const asked = input.choice[def.id]
      const later = order.slice(at + 1)
      const laterPicked = new Set(later.flatMap(picksOf))
      const picks = picksOf(def).filter((charId) => !taken.has(charId))
      const open = pool.filter(
        (charId) => !taken.has(charId) && !picks.includes(charId) && !laterPicked.has(charId)
      )
      const reserve = enough
        ? later
            .filter(wants)
            .reduce((sum, other) => sum + Math.max(0, other.minMembers - picksOf(other).length), 0)
        : 0
      const room = Math.max(0, Math.min(def.maxMembers - picks.length, open.length - reserve))
      let count: number
      if (asked) count = Math.min(Math.max(asked.count - picks.length, 0), room)
      else {
        const least = Math.max(0, Math.min(def.minMembers - picks.length, room))
        count = least + Math.floor(rand() * (room - least + 1))
      }

      const chosen = [...picks]
      const left = [...open]
      for (let i = 0; i < count; i++) {
        const weights = left.map((charId) => {
          const wanted = input.roster.find((entry) => entry.charId === charId)?.preferredStat
          return def.kind === 'sorority' && wanted === def.values ? SORORITY_TENDENCY : 1
        })
        let r = rand() * weights.reduce((sum, weight) => sum + weight, 0)
        let at2 = 0
        while (at2 < left.length - 1 && r >= weights[at2]) {
          r -= weights[at2]
          at2 += 1
        }
        chosen.push(left[at2])
        left.splice(at2, 1)
      }
      // A house that cannot reach its least is only the unnamed.
      if (chosen.length < def.minMembers) return
      for (const charId of chosen) taken.add(charId)
      members[def.id] = pool.filter((charId) => chosen.includes(charId))
    })
  }
  return members
}

/** The house a character lives in, or undefined. */
export function houseOfMember(members: HouseMembers, charId: string): HouseId | undefined {
  return HOUSE_IDS.find((id) => members[id]?.includes(charId))
}

/** The shared rooms of a house a resident can be run into in. */
export interface HouseSpot {
  id: string
  label: string
  house: HouseId
}

/** The one shared room each house has: its common room. */
export const HOUSE_SPOTS: readonly HouseSpot[] = HOUSE_IDS.map((id) => ({
  id: `${id}_common_room`,
  label: `the ${HOUSES[id].nickname} common room`,
  house: id
}))

/** The ` | She lives in …` tail of a cast block's labeled facts line. */
export function houseClause(house: HouseId, gender: Gender, office?: OfficeId): string {
  return ` | ${pronounsOf(gender).Subject} lives in ${houseResidence(house)}, in a room of ${pronounsOf(gender).possessive} own${officeTail(office)}.`
}

/** The same fact as lorebook prose. */
export function houseSentence(house: HouseId, gender: Gender, office?: OfficeId): string {
  return ` ${pronounsOf(gender).Subject} lives in ${houseResidence(house)}, in a room of ${pronounsOf(gender).possessive} own${officeTail(office)}.`
}

function officeTail(office: OfficeId | undefined): string {
  return office ? `, and is its ${OFFICE_NAMES[office]}` : ''
}

function houseResidence(house: HouseId): string {
  const def = HOUSES[house]
  return `the ${def.nickname} ${def.kind} house (${def.name}) on Laurel Row`
}
