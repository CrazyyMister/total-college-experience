/**
 * Greek Week: four nights of contests between the four houses of Laurel Row. The table is code,
 * the nights are dated at New Game, and the order each contest ends in is decided by these
 * functions alone; nothing here reads the clock or the store.
 */

import { seededRand } from './hash'
import { HOUSE_IDS, HOUSES, mayAskTo, type HouseId } from './houses'
import { MAX_TIER, STAT_KEYS, type StatKey } from './playerStats'
import type { Occasion, TimeSlot } from './types'

/** What a contest asks of a house: one stat, or all three at once. */
export type GreekStat = StatKey | 'all'

/** One night of Greek Week before it has a date. */
export interface GreekProva {
  id: string
  /** The calendar chip's label. */
  title: string
  /** The calendar's detail line, and what a scene is told the night is. */
  description: string
  /** The `LOCATIONS` id it is held at. */
  where: string
  stat: GreekStat
  /** The day it is held on if nothing else holds it. */
  day: number
}

/** The first day of Greek Week: the Monday of the last full week of April. */
export const GREEK_WEEK_FIRST_DAY = 98

/** Greek Week is held at night. */
export const GREEK_WEEK_TIME: TimeSlot = 1

export const GREEK_PROVAS: readonly GreekProva[] = [
  {
    id: 'greek-week-1',
    title: 'Greek Week: Scavenger Hunt',
    description:
      'The first night of Greek Week, when the four houses of Laurel Row compete for the trophy: a scavenger hunt across the Venus Quad, each house racing to solve clues and bring back a list of silly objects.',
    where: 'venus_quad',
    stat: 'brain',
    day: GREEK_WEEK_FIRST_DAY
  },
  {
    id: 'greek-week-2',
    title: 'Greek Week: Pool Relay',
    description:
      "The second night of Greek Week: a relay in the Palaestra pool, one house to a lane, with a great deal of splashing, a few pool noodles and a crowd on the deck shouting for their own house.",
    where: 'palaestra_pool',
    stat: 'body',
    day: GREEK_WEEK_FIRST_DAY + 1
  },
  {
    id: 'greek-week-3',
    title: 'Greek Week: Field Day',
    description:
      'The third night of Greek Week: field day on the Palaestra field, with a tug of war, three-legged races and a lot of cheering from the bleachers, every house playing for its own spirit.',
    where: 'palaestra_field',
    stat: 'heart',
    day: GREEK_WEEK_FIRST_DAY + 2
  },
  {
    id: 'greek-week-4',
    title: 'Greek Week: Greek Sing',
    description:
      'The closing night of Greek Week, back on the Venus Quad: every house performs a number before the judges, and the trophy goes to the house that finishes the week on top.',
    where: 'venus_quad',
    stat: 'all',
    day: GREEK_WEEK_FIRST_DAY + 3
  }
]

/** The contest an occasion id names, or `undefined` for any other id. */
export function greekWeekEventOf(eventId: string | null | undefined): GreekProva | undefined {
  return eventId ? GREEK_PROVAS.find((prova) => prova.id === eventId) : undefined
}

/**
 * The days a contest may be held on, best first: its own, then the other nights of the week in
 * order.
 */
export function greekCandidates(prova: GreekProva): number[] {
  const days = GREEK_PROVAS.map((entry) => entry.day)
  return [prova.day, ...days.filter((day) => day !== prova.day)]
}

/** The occasion a contest becomes once it has a day. */
export function greekWeekOccasion(prova: GreekProva, date: number): Occasion {
  return {
    id: prova.id,
    title: prova.title,
    description: prova.description,
    startDate: date,
    endDate: date,
    time: GREEK_WEEK_TIME,
    cancelsClasses: false,
    kind: 'campus',
    where: prova.where
  }
}

/** The points for first to last place. */
export const GREEK_POINTS: readonly number[] = [4, 3, 2, 1]

/** What a house prizing a contest's stat adds to its weight. */
export const GREEK_APTITUDE = 0.5

/** What the share of a house's roster that is free adds to its weight, from none to all. */
export const GREEK_PRESENCE = 0.5

/** What the reader's tier in the contest's stat adds to his house, from none at the first tier to this at the last. */
export const GREEK_READER = 1

/** How a contest ended: the houses first to last, and the house the reader competed for. */
export interface GreekResult {
  order: HouseId[]
  reader?: HouseId
}

/** The house the reader competes for in a contest, and his tier in each stat. */
export interface GreekReader {
  house: HouseId
  tiers: Readonly<Record<StatKey, number>>
}

/** How much of a tier counts, from 0 at the first to 1 at the last. */
function tierShare(tier: number): number {
  return (Math.min(Math.max(tier, 1), MAX_TIER) - 1) / (MAX_TIER - 1)
}

/** What the reader's tiers come to for a contest: its stat's, or the mean of the three. */
function readerShare(stat: GreekStat, tiers: Readonly<Record<StatKey, number>>): number {
  if (stat === 'all') {
    return STAT_KEYS.reduce((sum, key) => sum + tierShare(tiers[key]), 0) / STAT_KEYS.length
  }
  return tierShare(tiers[stat])
}

/**
 * A house's weight in a contest. `share` is how much of its roster is free that night, from 0 to
 * 1 (a house with nobody of the roster is all unnamed, who are always there).
 */
export function greekWeight(
  prova: GreekProva,
  house: HouseId,
  share: number,
  reader?: GreekReader
): number {
  const aptitude = HOUSES[house].values === prova.stat ? GREEK_APTITUDE : 0
  const part = reader?.house === house ? GREEK_READER * readerShare(prova.stat, reader.tiers) : 0
  return 1 + GREEK_PRESENCE * Math.min(1, Math.max(0, share)) + aptitude + part
}

/**
 * How a contest ends: the houses drawn first to last, each draw weighted by what is left. The
 * same weights and seed always end it the same way.
 */
export function greekResult(
  prova: GreekProva,
  shares: Readonly<Record<HouseId, number>>,
  reader: GreekReader | undefined,
  seed: string
): GreekResult {
  const rand = seededRand(seed)
  const weights = Object.fromEntries(
    HOUSE_IDS.map((id) => [id, greekWeight(prova, id, shares[id], reader)])
  ) as Record<HouseId, number>
  const left: HouseId[] = [...HOUSE_IDS]
  const order: HouseId[] = []
  while (left.length > 0) {
    const total = left.reduce((sum, id) => sum + weights[id], 0)
    let r = rand() * total
    let at = 0
    while (at < left.length - 1 && r >= weights[left[at]]) {
      r -= weights[left[at]]
      at += 1
    }
    order.push(left[at])
    left.splice(at, 1)
  }
  return { order, ...(reader ? { reader: reader.house } : {}) }
}

/** One house's place in the standings. */
export interface GreekStanding {
  house: HouseId
  points: number
}

/**
 * The houses by points over the contests held so far, best first. `held` is the contests in the
 * order they fell; a tie is broken by the place in the latest of them.
 */
export function greekStandings(
  held: readonly { id: string }[],
  results: Readonly<Record<string, GreekResult | undefined>>
): GreekStanding[] {
  const points = Object.fromEntries(HOUSE_IDS.map((id) => [id, 0])) as Record<HouseId, number>
  let latest: GreekResult | undefined
  for (const { id } of held) {
    const result = results[id]
    if (!result) continue
    latest = result
    result.order.forEach((house, place) => {
      points[house] += GREEK_POINTS[place] ?? 0
    })
  }
  const placeIn = (house: HouseId): number => latest?.order.indexOf(house) ?? 0
  return [...HOUSE_IDS]
    .sort((a, b) => points[b] - points[a] || placeIn(a) - placeIn(b))
    .map((house) => ({ house, points: points[house] }))
}

/**
 * Whether somebody of `house` (or of none) may ask the reader to an occasion: to a night of Greek
 * Week only those who live in one of the four houses, less the house that put him out or that he
 * left; every other occasion follows {@link mayAskTo}.
 */
export function mayAskToOccasion(
  occasion: Pick<Occasion, 'house' | 'id'>,
  house: HouseId | undefined,
  dropped?: HouseId | null
): boolean {
  if (greekWeekEventOf(occasion.id)) return house !== undefined && house !== dropped
  return mayAskTo(occasion, house, dropped)
}
