import { DRIFT_MIN_SIGNS, type NpcRomanceMap } from './npcRomance'
import { withDriftPostSigns } from './npcRomancePosts'
import type { TimeSlot } from './types'

/**
 * The anonymous gossip the roster's romance puts on the feed: at most one post a slot, written
 * by the slot's opening, about a lover who left the reader where he could not hear of it, a drift
 * still short of its signs, or a crush that leaked. Pure: the ending picks the topic, the opening
 * writes it, and the boundary stores the post and what it counts for.
 */

/** A crush has to have been held this many days before it can leak. */
export const CRUSH_LEAK_AFTER_DAYS = 7
/** The odds, each slot, that a crush old enough leaks. */
export const CRUSH_LEAK_CHANCE = 0.15
/** A drift is gossiped about from this many days after it opened: its fifth day. */
export const DRIFT_GOSSIP_AFTER_DAYS = 4

/** What one slot's gossip is about, as charIds. */
export type GossipTopic =
  /** The reader's lover left him for somebody else, and no text of it reached him. */
  | { kind: 'single'; lover: string }
  /** The reader's lover seen getting close to the one she is drawn to. */
  | { kind: 'drift'; lover: string; suitor: string }
  /** `from`'s crush on `to`. */
  | { kind: 'crush'; from: string; to: string }

/** One gossip post as the feed keeps it. */
export interface GossipPost {
  id: string
  /** The student posting it, one of the generated names. */
  handle: string
  emoji: string
  text: string
  likes: number
  /** The player liked it. Absent means he has not. */
  liked?: boolean
  date: number
  time: TimeSlot
}

/** Everything on the save about gossip. */
export interface NpcGossip {
  /** Every gossip post written so far, oldest first. */
  posts: GossipPost[]
  /** The lovers who left the reader in silence, still waiting on their gossip. Absent means none. */
  owed?: string[]
}

/** A save with no gossip on it. */
export function emptyNpcGossip(): NpcGossip {
  return { posts: [] }
}

/** Everything {@link pickGossipTopic} reads. */
export interface GossipTopicInput {
  /** The romance map the ending's settle returned. */
  romance: NpcRomanceMap
  /** The lovers owed a gossip post: those already on the save and those this settle left. */
  owed: readonly string[]
  /** The date of the slot the gossip goes up in. */
  date: number
  /** Whether the reader knows a character's name. */
  nameKnown: (charId: string) => boolean
  /** A crush holder whose crush leaks whatever its age and the odds; the development build's. */
  forcedLeak?: string
  rand?: () => number
}

/**
 * The topic of the slot's gossip, or null: a lover owed one whose name the reader knows first,
 * then a drift from its fifth day still short of its signs with none counted on `date`, then a
 * crush of a week or more whose two names the reader knows and which he has not found out about,
 * each leaking at even odds.
 */
export function pickGossipTopic(input: GossipTopicInput): GossipTopic | null {
  const { romance, date, nameKnown } = input
  const rand = input.rand ?? Math.random

  const owed = input.owed.filter(nameKnown).sort()
  if (owed.length > 0) return { kind: 'single', lover: owed[0] }

  const drifting = Object.entries(romance.drifts ?? {})
    .filter(
      ([, drift]) =>
        date - drift.since >= DRIFT_GOSSIP_AFTER_DAYS &&
        drift.signs < DRIFT_MIN_SIGNS &&
        drift.lastSign !== date
    )
    .sort(([a, x], [b, y]) => x.since - y.since || (a < b ? -1 : 1))
  if (drifting.length > 0) {
    const [lover, drift] = drifting[0]
    return { kind: 'drift', lover, suitor: drift.to }
  }

  const leakable = (from: string): boolean => {
    const crush = romance.crushes[from]
    return (
      crush !== undefined &&
      !romance.discovered?.[from] &&
      nameKnown(from) &&
      nameKnown(crush.to)
    )
  }
  if (input.forcedLeak && leakable(input.forcedLeak)) {
    return { kind: 'crush', from: input.forcedLeak, to: romance.crushes[input.forcedLeak].to }
  }
  const leaked = Object.keys(romance.crushes)
    .sort()
    .filter(
      (from) =>
        leakable(from) &&
        date - romance.crushes[from].since >= CRUSH_LEAK_AFTER_DAYS &&
        rand() < CRUSH_LEAK_CHANCE
    )
  if (leaked.length === 0) return null
  const from = leaked[Math.floor(rand() * leaked.length)]
  return { kind: 'crush', from, to: romance.crushes[from].to }
}

/** What a slot's opening brings to {@link withGossip}. */
export interface GossipDelivery {
  /** The lovers the ending's settle left in silence. */
  silent: readonly string[]
  /** The gossip it had written, and the post it came back as; no post when none came back. */
  topic?: GossipTopic
  post?: GossipPost
}

/**
 * The map and the gossip record once a slot's opening is in: the lovers left in silence are owed
 * a post, and a post that came back is filed, clearing the lover it was owed for, counting a
 * drift's sign dated `date` at most once that day, or marking the crush it leaked as found out
 * while it still stands. Idempotent, so the boundary can replay off its own save.
 */
export function withGossip(
  romance: NpcRomanceMap,
  gossip: NpcGossip,
  delivery: GossipDelivery,
  date: number
): { romance: NpcRomanceMap; gossip: NpcGossip } {
  const owed = new Set([...(gossip.owed ?? []), ...delivery.silent])
  let posts = gossip.posts
  let map = romance
  const { topic, post } = delivery
  if (topic && post) {
    if (!posts.some(({ id }) => id === post.id)) posts = [...posts, post]
    if (topic.kind === 'single') owed.delete(topic.lover)
    if (topic.kind === 'drift') {
      const hint = { poster: topic.lover, lover: topic.lover, suitor: topic.suitor }
      map = withDriftPostSigns(map, [hint], new Set([topic.lover]), date)
    }
    if (
      topic.kind === 'crush' &&
      map.crushes[topic.from]?.to === topic.to &&
      !map.discovered?.[topic.from]
    ) {
      map = { ...map, discovered: { ...map.discovered, [topic.from]: { to: topic.to, date } } }
    }
  }
  const next: NpcGossip = { posts, ...(owed.size > 0 ? { owed: [...owed].sort() } : {}) }
  return { romance: map, gossip: next }
}

/** One roster character as {@link unknownNameIn} reads them. */
export interface GossipName {
  firstName: string
  lastName: string
  known: boolean
}

/**
 * Whether `text` names, as a whole word in any case, somebody the reader cannot name: a first or
 * last name of an unknown character that no known character also carries.
 */
export function unknownNameIn(text: string, roster: readonly GossipName[]): boolean {
  const known = new Set(
    roster
      .filter((one) => one.known)
      .flatMap((one) => [one.firstName, one.lastName])
      .map((name) => name.trim().toLowerCase())
  )
  const lower = text.toLowerCase()
  return roster.some(
    (one) =>
      !one.known &&
      [one.firstName, one.lastName].some((name) => {
        const word = name.trim().toLowerCase()
        if (word.length === 0 || known.has(word)) return false
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(lower)
      })
  )
}
