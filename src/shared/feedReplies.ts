/**
 * The reader's own posts on the feed: how long one may be, how many a slot holds, and what the
 * game decides of each — its likes and who replies — fixed by the post's id and applied once;
 * and who of a finished scene tags him in a post about it.
 */

import { seededRand } from './hash'
import type { Disposition } from './relationship'
import { splitSentences } from './sentences'
import type {
  ReaderCommentAnswer,
  ReaderPost,
  ReaderPostAnswer,
  ReaderPostReply,
  ReaderTag,
  SocialPost,
  TimeSlot
} from './types'

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

/** The most comments he leaves in one half of the day. */
export const READER_COMMENTS_PER_SLOT = 3

/** How many comments of his were left in this slot, read off the posts they sit on. */
export function commentsThisSlot(
  feeds: ReadonlyArray<readonly SocialPost[] | undefined>,
  date: number,
  time: TimeSlot
): number {
  let count = 0
  for (const feed of feeds) {
    for (const post of feed ?? []) {
      if (post.comment?.date === date && post.comment.time === time) count++
    }
  }
  return count
}

/** Whether a post of a contact's is recent enough to comment on, and has no comment of his yet. */
export function commentable(post: Pick<SocialPost, 'comment' | 'date'>, today: number): boolean {
  return post.comment === undefined && post.date >= today - 1 && post.date <= today
}

/**
 * The post with `answer` applied to his comment, stamped with the slot it was answered in, its
 * reply kept only when `keepReply`; the post itself when the answer names no comment it carries
 * or the comment is already answered, so applying twice changes nothing.
 */
export function withAnsweredComment(
  post: SocialPost,
  answer: ReaderCommentAnswer,
  date: number,
  time: TimeSlot,
  keepReply: boolean
): SocialPost {
  const comment = post.comment
  if (post.id !== answer.postId || comment?.id !== answer.commentId) return post
  if (comment.answered !== undefined) return post
  return {
    ...post,
    comment: {
      ...comment,
      answered: { date, time },
      ...(keepReply && answer.reply !== undefined ? { reply: answer.reply } : {})
    }
  }
}

/** The handle the reader goes by: his names, trimmed, joined by an underscore and lowercased. */
export function readerHandle(firstName: string, lastName: string): string {
  return [firstName, lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join('_')
    .toLowerCase()
}

/** How likely a scene ending with somebody able to tag the reader is to have one of them do it. */
export const READER_TAG_CHANCE = 0.2

/** What a finished scene was, as the tag reads it, off the ledger as it came back. */
export interface TagScene {
  inPublic: boolean
  /** The kisses and nights the ledger reported, with anybody at all. */
  acts: number
  /** The romance between the roster and the wingman actions the ledger reported. */
  romance: number
  /** The reader's own milestones the ledger reported beyond a number given or a block lifted. */
  milestones: number
  /** Whoever the scene was planned with or arranged with by text, and whether he dates her. */
  dates: ReadonlyArray<{ charId: string; isLover: boolean }>
}

/** Why a finished scene tags nobody: each thing it holds that a post would expose. */
export function sceneTagBars(scene: TagScene): string[] {
  return [
    ...(scene.inPublic ? [] : ['private']),
    ...(scene.acts > 0 ? ['a kiss or a night'] : []),
    ...(scene.romance > 0 ? ['romance or wingman reported'] : []),
    ...(scene.milestones > 0 ? ["a milestone of the reader's"] : []),
    ...(scene.dates.some((one) => !one.isLover) ? ['a date with somebody not his lover'] : [])
  ]
}

/** One character the scene held, as the tag reads her. */
export interface TagCandidate {
  charId: string
  /** She was no longer in the scene when it ended. */
  left: boolean
  /** As the ending leaves her. */
  contact: boolean
  blocked: boolean
  disposition: Disposition
  /** She posts for sure in the slot the ending opens. */
  posting: boolean
}

/** The dispositions that may tag the reader. */
const TAG_DISPOSITIONS: ReadonlySet<Disposition> = new Set(['devoted', 'trusted', 'friendly'])

/** Why a character the scene held may not tag the reader, or null when she may. */
export function tagSkipOf(candidate: TagCandidate): string | null {
  if (candidate.left) return 'left before the end'
  if (!candidate.contact) return 'not a contact'
  if (candidate.blocked) return 'has him blocked'
  if (!TAG_DISPOSITIONS.has(candidate.disposition)) return `${candidate.disposition}, below friendly`
  if (candidate.posting) return 'posts for sure this slot'
  return null
}

/**
 * Who tags the reader of those who may: `forced` whenever it is among them, and otherwise one of
 * them at {@link READER_TAG_CHANCE}; null for nobody. The roll is null where nothing was rolled.
 */
export function pickReaderTagger(
  eligible: readonly string[],
  forced: string | null,
  rand: () => number = Math.random
): { tagger: string | null; roll: number | null } {
  if (forced !== null && eligible.includes(forced)) return { tagger: forced, roll: null }
  if (eligible.length === 0) return { tagger: null, roll: null }
  const roll = rand()
  if (roll >= READER_TAG_CHANCE) return { tagger: null, roll }
  return { tagger: eligible[Math.floor(rand() * eligible.length)], roll }
}

/**
 * Her feed with the tagged post filed, dated with the slot it lands in; the feed itself when the
 * post is already on it, so a replayed boundary files it once.
 */
export function withReaderTag(
  feed: readonly SocialPost[],
  tag: ReaderTag,
  date: number,
  time: TimeSlot
): readonly SocialPost[] {
  if (feed.some((post) => post.id === tag.postId)) return feed
  return [
    ...feed,
    { id: tag.postId, text: tag.text, date, time, likes: tag.likes, tagsReader: true }
  ]
}

/** One exchange on the feed between the reader and one character, as the phone's summary reads it. */
export interface FeedExchange {
  charId: string
  /** What the exchange is known by: his post's id, or his comment's. */
  id: string
  /** Her post he commented under, there for context only; absent for a reply to his post. */
  herPost?: string
  /** What he wrote: his post, or his comment. */
  reader: string
  /** What she wrote back to him. */
  reply: string
}

/**
 * Every exchange on the feed that closed in the slot — whose reply landed in it — his posts'
 * first, in the order he posted them, then his comments, in roster order. An exchange is only
 * ever one he wrote a side of and a roster character answered him in by her charId: an anonymous
 * student's reply, a comment she never answered and anything on the feed he did not write never
 * are.
 */
export function feedExchangesOf(
  readerPosts: readonly ReaderPost[],
  feeds: ReadonlyArray<{ charId: string; feed: readonly SocialPost[] | undefined }>,
  date: number,
  time: TimeSlot
): FeedExchange[] {
  const closedHere = (answered: { date: number; time: TimeSlot } | undefined): boolean =>
    answered?.date === date && answered.time === time
  const onHisPosts = readerPosts.flatMap((post) =>
    closedHere(post.answered)
      ? (post.replies ?? []).filter(isContactReply).map((reply) => ({
          charId: reply.charId,
          id: post.id,
          reader: post.text,
          reply: reply.text
        }))
      : []
  )
  const onHers = feeds.flatMap(({ charId, feed }) =>
    (feed ?? []).flatMap((post) => {
      const comment = post.comment
      return comment && closedHere(comment.answered) && comment.reply !== undefined
        ? [{ charId, id: comment.id, herPost: post.text, reader: comment.text, reply: comment.reply }]
        : []
    })
  )
  return [...onHisPosts, ...onHers]
}
