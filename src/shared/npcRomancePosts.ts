import { seededRand } from './hash'
import type { NpcRomanceMap } from './npcRomance'

/**
 * What the roster's romance puts on the feed: who posts for sure in the slot after a couple forms
 * or ends or a drift opens, and the drift's sign such a post counts for. Pure: the caller hands in
 * the maps either side of an ending's settle and stores what comes back.
 */

/** How many days a breakup is still told to the writer beside a post. */
const RECENT_BREAKUP_DAYS = 7

/** A couple forming or ending, as one of the two posts about it. */
export interface RomanceNews {
  kind: 'together' | 'broke_up'
  /** The other one of the two. */
  with: string
}

/** A drift's hint post: who writes it, and the drift it is a sign of. */
export interface DriftPost {
  poster: string
  lover: string
  suitor: string
}

/** Somebody the slot's opening has posting for sure, and what about. */
export interface GuaranteedPoster {
  charId: string
  /** The couples of theirs that formed or ended at the ending, sorted. */
  news: RomanceNews[]
  /** Set when the post is a drift's hint, written as the lover or as the one she is drawn to. */
  driftHint?: 'lover' | 'suitor'
}

/** Everything {@link guaranteedPostersOf} reads. */
export interface GuaranteedPostersInput {
  /** The map before the ending's settle. */
  before: NpcRomanceMap
  /** The map the settle returned. */
  after: NpcRomanceMap
  /** Whether a character's posts reach the reader: a contact who has not blocked him. */
  visible: (charId: string) => boolean
  /** The slot being opened, which seeds the pick between two equally visible partners. */
  date: number
  time: number
}

/** What {@link guaranteedPostersOf} decides. */
export interface GuaranteedPosters {
  posters: GuaranteedPoster[]
  /** The drift hint posts among them, for the boundary to count once written. */
  driftPosts: DriftPost[]
}

/**
 * Who posts for sure in the slot an ending opens: one of each couple that formed or ended, the
 * one the reader can see preferred and a pick fixed by the slot otherwise, a couple ended by
 * the reader dating one of them excepted; and for each drift that opened, the lover where the
 * reader can see her posts, the one she is drawn to otherwise.
 */
export function guaranteedPostersOf(input: GuaranteedPostersInput): GuaranteedPosters {
  const { before, after, visible } = input
  const byChar = new Map<string, GuaranteedPoster>()
  const entry = (charId: string): GuaranteedPoster => {
    const found = byChar.get(charId)
    if (found) return found
    const made: GuaranteedPoster = { charId, news: [] }
    byChar.set(charId, made)
    return made
  }
  const pick = (key: string): string => {
    const [a, b] = key.split('|')
    if (visible(a) !== visible(b)) return visible(a) ? a : b
    return seededRand(`${input.date}|${input.time}|${key}`)() < 0.5 ? a : b
  }
  const tell = (key: string, kind: RomanceNews['kind']): void => {
    const [a, b] = key.split('|')
    const poster = pick(key)
    entry(poster).news.push({ kind, with: poster === a ? b : a })
  }

  for (const key of Object.keys(after.couples).sort()) {
    if (!before.couples[key]) tell(key, 'together')
  }
  for (const key of Object.keys(before.couples).sort()) {
    if (after.couples[key]) continue
    const ex = after.exes[key]
    // A couple the reader broke up by dating one of them ends without a word.
    if (!ex || ex.displaced !== undefined) continue
    tell(key, 'broke_up')
  }

  const driftPosts: DriftPost[] = []
  for (const lover of Object.keys(after.drifts ?? {}).sort()) {
    const drift = after.drifts![lover]
    const was = before.drifts?.[lover]
    if (was && was.since === drift.since && was.to === drift.to) continue
    const poster = visible(lover) ? lover : drift.to
    const guaranteed = entry(poster)
    guaranteed.driftHint = poster === lover ? 'lover' : 'suitor'
    driftPosts.push({ poster, lover, suitor: drift.to })
  }

  const posters = [...byChar.values()]
    .map((poster) => ({
      ...poster,
      news: [...poster.news].sort((x, y) => (x.kind + x.with < y.kind + y.with ? -1 : 1))
    }))
    .sort((x, y) => (x.charId < y.charId ? -1 : 1))
  return { posters, driftPosts }
}

/**
 * The map with a sign counted on each drift whose hint was actually posted, dated `date`, the day
 * the post went up: once a day at most, and only while the drift stands with the same suitor.
 * Idempotent, so the boundary can replay off its own save.
 */
export function withDriftPostSigns(
  map: NpcRomanceMap,
  driftPosts: readonly DriftPost[],
  posted: ReadonlySet<string>,
  date: number
): NpcRomanceMap {
  let drifts = map.drifts
  for (const { poster, lover, suitor } of driftPosts) {
    const drift = drifts?.[lover]
    if (!drift || drift.to !== suitor || !posted.has(poster) || drift.lastSign === date) continue
    drifts = { ...drifts, [lover]: { ...drift, signs: drift.signs + 1, lastSign: date } }
  }
  return drifts === map.drifts ? map : { ...map, drifts }
}

/** One poster's love life as the writer is told it; a name is absent where the reader has none. */
export interface PosterRomance {
  partner?: { name?: string; since: number }
  ex?: { name?: string; ended: number }
  crush?: true
}

/**
 * What a poster's love life is on `date`: the partner, the latest breakup inside
 * {@link RECENT_BREAKUP_DAYS}, and whether a crush is held — never on whom. `nameOf` answers a
 * first name only for somebody the reader can name.
 */
export function posterRomanceOf(
  map: NpcRomanceMap,
  charId: string,
  date: number,
  nameOf: (charId: string) => string | undefined
): PosterRomance | null {
  const romance: PosterRomance = {}
  for (const key of Object.keys(map.couples).sort()) {
    const [a, b] = key.split('|')
    if (a !== charId && b !== charId) continue
    const other = a === charId ? b : a
    const name = nameOf(other)
    romance.partner = { ...(name ? { name } : {}), since: map.couples[key].since }
  }
  for (const key of Object.keys(map.exes).sort()) {
    const [a, b] = key.split('|')
    if (a !== charId && b !== charId) continue
    const { ended } = map.exes[key]
    if (date - ended > RECENT_BREAKUP_DAYS) continue
    if (romance.ex && romance.ex.ended >= ended) continue
    const name = nameOf(a === charId ? b : a)
    romance.ex = { ...(name ? { name } : {}), ended }
  }
  if (map.crushes[charId]) romance.crush = true
  return Object.keys(romance).length > 0 ? romance : null
}
