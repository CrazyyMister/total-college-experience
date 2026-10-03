/**
 * The reader's own posts on the feed: how long one may be, how many a slot holds, and what the
 * game decides of each — its likes and who replies — fixed by the post's id and applied once.
 */

import { seededRand } from './hash'
import type { Disposition } from './relationship'
import { splitSentences } from './sentences'
import type { ReaderPost, ReaderPostAnswer, ReaderPostReply, TimeSlot } from './types'

/** The most a post of his may run to, in characters. */
export const READER_POST_MAX = 280

/** How likely a contact is to like his post, by how she feels about him. */
const LIKE_CHANCE: Readonly<Record<Disposition, number>> = {
  devoted: 0.95,
  trusted: 0.85,
  friendly: 0.65,
  neutral: 0.35,
  annoyed: 0.1,
  hostile: 0
}

/** The most strangers who like a post of his before his Heart adds any. */
const STRANGER_LIKES = 4

/** Whether he has already posted in this slot; one post a slot. */
export function postedThisSlot(
  posts: readonly ReaderPost[],
  date: number,
  time: TimeSlot
): boolean {
  return posts.some((post) => post.date === date && post.time === time)
}

/** His posts still waiting on their likes, oldest first. */
export function unansweredPosts(posts: readonly ReaderPost[]): ReaderPost[] {
  return posts.filter((post) => post.answered === undefined)
}

/** One contact as the likes read her: how she feels about him, and whether she is his lover. */
export interface LikingContact {
  disposition: Disposition
  isLover: boolean
}

/**
 * How many like one post of his: each contact by how she feels about him, his lover always, and
 * strangers by his Heart tier. Drawn off the post's id, so the same post and the same contacts
 * always come to the same count.
 */
export function readerPostLikes(
  postId: string,
  contacts: readonly LikingContact[],
  heartTier: number
): number {
  const rand = seededRand(`likes:${postId}`)
  let likes = 0
  for (const contact of contacts) {
    const roll = rand()
    if (contact.isLover || roll < LIKE_CHANCE[contact.disposition]) likes++
  }
  return likes + Math.floor(rand() * (STRANGER_LIKES + 1)) + Math.max(0, heartTier - 1)
}

/**
 * His posts with `answers` applied, each stamped with the slot it was answered in; a post already
 * answered, or one no answer names, is left as it is, so applying twice changes nothing. A
 * contact's reply lands only while `stillContact` holds for her.
 */
export function withAnsweredPosts(
  posts: readonly ReaderPost[],
  answers: readonly ReaderPostAnswer[],
  date: number,
  time: TimeSlot,
  stillContact: (charId: string) => boolean
): ReaderPost[] {
  return posts.map((post) => {
    if (post.answered !== undefined) return post
    const answer = answers.find((one) => one.postId === post.id)
    if (!answer) return post
    const replies = (answer.replies ?? []).filter(
      (reply) => !isContactReply(reply) || stillContact(reply.charId)
    )
    return {
      ...post,
      answered: { date, time },
      likes: answer.likes,
      ...(replies.length > 0 ? { replies } : {})
    }
  })
}

/** Whether a reply is a contact's rather than an anonymous student's. */
export function isContactReply(
  reply: ReaderPostReply
): reply is Extract<ReaderPostReply, { charId: string }> {
  return 'charId' in reply
}

/** How likely a contact is to reply to his post, by how she feels about him. */
const REPLY_CHANCE: Readonly<Record<Disposition, number>> = {
  devoted: 0.8,
  trusted: 0.6,
  friendly: 0.4,
  neutral: 0.2,
  annoyed: 0.05,
  hostile: 0
}

/** How likely his lover is to reply, whatever her disposition. */
const LOVER_REPLY_CHANCE = 0.9

/** The most contacts who reply to one post, unless more were forced. */
const MAX_REPLYING_CONTACTS = 3

/** How likely a second anonymous student is to reply beside the first. */
const SECOND_STRANGER_CHANCE = 0.5

/** The most characters a reply runs to before it is cut at its last whole sentence. */
export const READER_REPLY_MAX = 200

/** How long the replies may still take once the opening they ride with is in, in milliseconds. */
export const FEED_REPLIES_DEADLINE_MS = 30_000

/** The dispositions that are owed a reply when the dice picked nobody. */
const OWED_DISPOSITIONS: ReadonlySet<Disposition> = new Set(['devoted', 'trusted', 'friendly'])

/** One contact as the replies read her. */
export interface ReplyingContact {
  charId: string
  disposition: Disposition
  affection: number
  isLover: boolean
}

/** Why a contact replies to a post, or why she does not. */
type ReplyPickReason = 'rolled' | 'forced' | 'guaranteed' | 'missed' | 'capped'

/** One contact's part in who replies, for the development read-out. */
export interface ReplyPick {
  charId: string
  chance: number
  roll: number
  reason: ReplyPickReason
}

/**
 * Who of his contacts replies to one post, lover first and then by affection: each by her
 * chance, `forced` always, at most three with the highest kept; when the dice picked nobody, the
 * first who is his lover or friendly or better is owed one. Each roll is drawn off the post's id
 * and her charId, so the same post always picks the same people.
 */
export function pickReplyingContacts(
  postId: string,
  contacts: readonly ReplyingContact[],
  forced: readonly string[] = []
): { picked: string[]; log: ReplyPick[] } {
  const ranked = [...contacts].sort(
    (a, b) =>
      Number(b.isLover) - Number(a.isLover) ||
      b.affection - a.affection ||
      (a.charId < b.charId ? -1 : a.charId > b.charId ? 1 : 0)
  )
  const log: ReplyPick[] = ranked.map((contact) => {
    const chance = contact.isLover ? LOVER_REPLY_CHANCE : REPLY_CHANCE[contact.disposition]
    const roll = seededRand(`replies:${postId}:${contact.charId}`)()
    const reason: ReplyPickReason = forced.includes(contact.charId)
      ? 'forced'
      : roll < chance
        ? 'rolled'
        : 'missed'
    return { charId: contact.charId, chance, roll, reason }
  })

  // The forced take their places first; the dice fill what room is left, in rank order.
  let room = MAX_REPLYING_CONTACTS - log.filter((one) => one.reason === 'forced').length
  for (const one of log) {
    if (one.reason !== 'rolled') continue
    if (room > 0) room--
    else one.reason = 'capped'
  }

  if (!log.some((one) => one.reason === 'rolled' || one.reason === 'forced')) {
    const owed = log.find(
      (_one, at) => ranked[at].isLover || OWED_DISPOSITIONS.has(ranked[at].disposition)
    )
    if (owed) owed.reason = 'guaranteed'
  }

  const picked = log
    .filter((one) => one.reason === 'rolled' || one.reason === 'forced' || one.reason === 'guaranteed')
    .map((one) => one.charId)
  return { picked, log }
}

/**
 * The anonymous students who reply to one post: one, and a second at even odds, each a handle
 * and an emoji off the given pools, never the same handle twice. Drawn off the post's id.
 */
export function pickReplyStrangers(
  postId: string,
  handles: readonly string[],
  emojis: readonly string[]
): Array<{ handle: string; emoji: string }> {
  const rand = seededRand(`strangers:${postId}`)
  const count = rand() < SECOND_STRANGER_CHANCE ? 2 : 1
  const left = [...handles]
  const strangers: Array<{ handle: string; emoji: string }> = []
  for (let at = 0; at < count && left.length > 0; at++) {
    const [handle] = left.splice(Math.floor(rand() * left.length), 1)
    const emoji = emojis.length > 0 ? emojis[Math.floor(rand() * emojis.length)] : ''
    strangers.push({ handle, emoji })
  }
  return strangers
}

/**
 * A reply as the feed keeps it: on one line, and cut at its last whole sentence when it runs
 * past {@link READER_REPLY_MAX}; null when it is empty or not even its first sentence fits.
 */
export function fittedReply(text: string): string | null {
  const flat = text.replace(/\s*\n+\s*/g, ' ').trim()
  if (flat.length === 0) return null
  if (flat.length <= READER_REPLY_MAX) return flat
  let kept = ''
  for (const sentence of splitSentences(flat)) {
    const next = kept ? `${kept} ${sentence}` : sentence
    if (next.length > READER_REPLY_MAX) break
    kept = next
  }
  return kept || null
}

/** The handle the reader goes by: his names, trimmed, joined by an underscore and lowercased. */
export function readerHandle(firstName: string, lastName: string): string {
  return [firstName, lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join('_')
    .toLowerCase()
}
