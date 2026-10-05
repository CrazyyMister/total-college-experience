/**
 * The comments roster characters leave under each other's posts: which posts may take one, who
 * may write it, and which of them does — all fixed by the post's id and the roster's state, and
 * applied once. Nothing in a comment moves anything in the game.
 */

import { seededRand } from './hash'
import {
  areNpcFriends,
  npcBestFriendOf,
  pairKeyOf,
  type NpcRelationshipMap
} from './npcRelationships'
import {
  directedKeyOf,
  REJECTION_COOLDOWN_DAYS,
  type NpcRomanceMap
} from './npcRomance'
import type { NpcComment, NpcCommentAnswer, SocialPost, TimeSlot } from './types'

/** How close a commenter is to whoever posted, closest first. */
export type NpcCommentRelation = 'couple' | 'bestFriend' | 'friend'

/** How likely each kind of commenter is to write one, off the post's id. */
export const NPC_COMMENT_CHANCE: Readonly<Record<NpcCommentRelation, number>> = {
  couple: 0.4,
  bestFriend: 0.3,
  friend: 0.15
}

/** The most comments one ending has written, whoever the posts are. */
export const NPC_COMMENTS_PER_SLOT = 2

/** How many days a couple's fight keeps its two from commenting on each other. */
const FIGHT_QUIET_DAYS = 7

/** What a pair's comments read: the roster's maps, who is on it and the day. */
export interface NpcCommentWorld {
  relationships: NpcRelationshipMap | undefined
  romance: NpcRomanceMap
  /** Everybody on the roster, in roster order. */
  roster: readonly string[]
  date: number
}

/** Whether `charId` is one end of a drift: the reader's lover drifting, or the one she is drawn to. */
function inDrift(romance: NpcRomanceMap, charId: string): boolean {
  return Object.entries(romance.drifts ?? {}).some(([lover, drift]) => lover === charId || drift.to === charId)
}

/**
 * Why a post may not take a comment from anybody, or null: one tagging the reader, one by
 * somebody in a drift, and one by somebody whose couple formed or ended on this day or the one
 * before — the posts the romance has somebody write for sure carry no mark once filed, so the
 * poster's own standing stands in for it.
 */
export function npcCommentPostBar(
  world: NpcCommentWorld,
  posterId: string,
  post: Pick<SocialPost, 'tagsReader' | 'npcComment'>
): string | null {
  const { romance, date } = world
  if (post.tagsReader) return 'tags the reader'
  if (post.npcComment) return 'already has a comment'
  if (inDrift(romance, posterId)) return 'the poster is in a drift'
  const recent = (day: number): boolean => day >= date - 1
  const inPair = (key: string): boolean => key.split('|').includes(posterId)
  const news =
    Object.entries(romance.couples).some(([key, couple]) => inPair(key) && recent(couple.since)) ||
    Object.entries(romance.exes).some(([key, ex]) => inPair(key) && recent(ex.ended))
  return news ? 'a couple of the poster formed or ended just now' : null
}

/** What the pair rule says of one commenter under one poster's post: a relation, or why not. */
export function npcCommentRelationOf(
  world: NpcCommentWorld,
  posterId: string,
  commenterId: string
): { relation: NpcCommentRelation } | { bar: string } {
  const { relationships, romance, roster, date } = world
  if (commenterId === posterId) return { bar: 'wrote the post herself' }
  const key = pairKeyOf(posterId, commenterId)
  if (romance.exes[key]) return { bar: 'exes' }
  if (
    romance.crushes[posterId]?.to === commenterId ||
    romance.crushes[commenterId]?.to === posterId
  ) {
    return { bar: 'a crush between the two' }
  }
  const turnedDown = [directedKeyOf(posterId, commenterId), directedKeyOf(commenterId, posterId)]
    .map((one) => romance.rejections[one])
    .some((one) => one !== undefined && date - one.date < REJECTION_COOLDOWN_DAYS)
  if (turnedDown) return { bar: 'a recent turned-down declaration' }
  if (inDrift(romance, posterId) || inDrift(romance, commenterId)) return { bar: 'in a drift' }

  const couple = romance.couples[key]
  if (couple) {
    if (couple.lastFight !== undefined && date - couple.lastFight < FIGHT_QUIET_DAYS) {
      return { bar: 'a couple that fought this week' }
    }
    return { relation: 'couple' }
  }
  if (!areNpcFriends(relationships, posterId, commenterId)) return { bar: 'not friends' }
  const best = npcBestFriendOf(
    relationships,
    posterId,
    roster.filter((other) => other !== posterId)
  )
  return { relation: best === commenterId ? 'bestFriend' : 'friend' }
}

/** What the reader's view of two characters says: who may be shown and heard. */
export interface NpcCommentPeople {
  /** The poster's feed reaches him: he has her number and she has not blocked him. */
  posterReachable: boolean
  /** He can name the commenter. */
  commenterKnown: boolean
  /** The commenter has him blocked. */
  commenterBlocked: boolean
}

/**
 * Why `commenterId` may not comment under `posterId`'s post, or null when she may: the poster
 * must be somebody whose feed he reads, the commenter somebody he can name who has not blocked
 * him, and the pair a couple or friends with nothing between them the feed must not touch.
 */
export function npcCommentBarOf(
  world: NpcCommentWorld,
  posterId: string,
  commenterId: string,
  people: NpcCommentPeople
): string | null {
  if (!people.posterReachable) return 'the poster is not a contact'
  if (!people.commenterKnown) return 'he cannot name her'
  if (people.commenterBlocked) return 'she has him blocked'
  const found = npcCommentRelationOf(world, posterId, commenterId)
  return 'bar' in found ? found.bar : null
}

/** One post of a contact's from the slot that ended, with who might comment on it. */
export interface NpcCommentCandidates {
  postId: string
  posterId: string
  /** Everybody who may, each with how close she is to the poster. */
  commenters: Array<{ charId: string; relation: NpcCommentRelation }>
}

/** How the roll came out for one commenter, for the development read-out. */
export interface NpcCommentPick {
  postId: string
  posterId: string
  charId: string
  relation: NpcCommentRelation
  chance: number
  roll: number
  reason: 'rolled' | 'forced' | 'outranked' | 'capped' | 'missed'
}

const RELATION_RANK: Readonly<Record<NpcCommentRelation, number>> = {
  couple: 0,
  bestFriend: 1,
  friend: 2
}

/**
 * Who writes a comment, of the posts given: each commenter rolls off the post's id and her own,
 * `forced` always taking the post's one place, the closest rolled kept for each post and at most
 * {@link NPC_COMMENTS_PER_SLOT} across them, the forced first and then the closest and the
 * lowest roll.
 */
export function pickNpcCommenters(
  posts: readonly NpcCommentCandidates[],
  forced: { charId: string; posterId: string } | null = null,
  max: number = NPC_COMMENTS_PER_SLOT
): { picked: Array<{ postId: string; posterId: string; charId: string }>; log: NpcCommentPick[] } {
  const log: NpcCommentPick[] = posts.flatMap((post) =>
    post.commenters.map((one) => {
      const chance = NPC_COMMENT_CHANCE[one.relation]
      const roll = seededRand(`npcComment:${post.postId}:${one.charId}`)()
      const isForced = forced?.charId === one.charId && forced.posterId === post.posterId
      return {
        postId: post.postId,
        posterId: post.posterId,
        charId: one.charId,
        relation: one.relation,
        chance,
        roll,
        reason: isForced ? 'forced' : roll < chance ? 'rolled' : 'missed'
      } satisfies NpcCommentPick
    })
  )

  // One comment a post: the forced one, else the closest who rolled, else the lowest roll.
  const standing = (a: NpcCommentPick, b: NpcCommentPick): number =>
    Number(b.reason === 'forced') - Number(a.reason === 'forced') ||
    RELATION_RANK[a.relation] - RELATION_RANK[b.relation] ||
    a.roll - b.roll ||
    (a.charId < b.charId ? -1 : 1)
  const winners: NpcCommentPick[] = []
  for (const post of posts) {
    const live = log
      .filter((one) => one.postId === post.postId && (one.reason === 'rolled' || one.reason === 'forced'))
      .sort(standing)
    live.slice(1).forEach((one) => (one.reason = 'outranked'))
    if (live[0]) winners.push(live[0])
  }
  winners.sort((a, b) => standing(a, b) || (a.postId < b.postId ? -1 : 1))
  winners.slice(max).forEach((one) => (one.reason = 'capped'))

  return {
    picked: winners.slice(0, max).map(({ postId, posterId, charId }) => ({ postId, posterId, charId })),
    log
  }
}

/**
 * The post with the comment filed on it, dated with the slot it lands in; the post itself when
 * the answer names another post or it already carries one, so a replayed boundary files it once.
 */
export function withNpcComment(
  post: SocialPost,
  answer: NpcCommentAnswer,
  date: number,
  time: TimeSlot
): SocialPost {
  if (post.id !== answer.postId || post.npcComment !== undefined) return post
  const comment: NpcComment = {
    id: answer.commentId,
    charId: answer.charId,
    text: answer.text,
    date,
    time
  }
  return { ...post, npcComment: comment }
}
