import {
  npcCommentBarOf,
  npcCommentPostBar,
  npcCommentRelationOf,
  pickNpcCommenters,
  type NpcCommentCandidates,
  type NpcCommentRelation,
  type NpcCommentWorld
} from '@shared/npcComments'
import { fittedReply } from '@shared/feedReplies'
import type { NpcRelationshipMap } from '@shared/npcRelationships'
import type { NpcRomanceMap } from '@shared/npcRomance'
import { unknownNameIn, type GossipName } from '@shared/npcRomanceGossip'
import type { CharInfo, FeedRepliesResponse, TimeSlot } from '@shared/types'
import { useGameStore } from '../gameStore'
import { isFeedContact } from '../feedView'
import { loopState } from './state'

/** The comments roster characters leave under contacts' posts, where they meet the store. */

/** One comment an ending has a character write, as it is asked for. */
export interface NpcCommentAsk {
  postId: string
  posterId: string
  /** Who writes it. */
  charId: string
  /** Minted here, what a replayed boundary is stopped filing twice by. */
  commentId: string
  relation: NpcCommentRelation
  post: { text: string; date: number; time: TimeSlot }
}

/**
 * Who comments under which post of the slot that is ending, rolled once here: the posts a
 * contact put up in this slot, off the maps and contacts as the ending leaves them. Writes the
 * development read-out.
 */
export function npcCommentsFor(
  charInfo: Readonly<Record<string, CharInfo | undefined>>,
  relationships: NpcRelationshipMap,
  romance: NpcRomanceMap
): NpcCommentAsk[] {
  const game = useGameStore.getState()
  const name = (charId: string): string => game.characters[charId]?.firstName ?? charId
  const forced = loopState.debugNpcComment
  const world: NpcCommentWorld = { relationships, romance, roster: game.chars, date: game.date }
  const report: string[] = []
  loopState.npcCommentReport = report

  const candidates: NpcCommentCandidates[] = []
  const posts = new Map<string, { posterId: string; text: string }>()
  for (const posterId of game.chars) {
    const info = charInfo[posterId]
    for (const post of info?.feed ?? []) {
      if (post.date !== game.date || post.time !== game.time) continue
      const head = `${name(posterId)}'s post "${post.text.slice(0, 30)}"`
      if (!isFeedContact(info)) {
        report.push(`${head}: not a contact, no comment`)
        continue
      }
      const bar = npcCommentPostBar(world, posterId, post)
      if (bar) {
        report.push(`${head}: ${bar}, no comment`)
        continue
      }
      const commenters: NpcCommentCandidates['commenters'] = []
      const skipped: string[] = []
      for (const charId of game.chars) {
        if (charId === posterId) continue
        const other = charInfo[charId]
        const why = npcCommentBarOf(world, posterId, charId, {
          posterReachable: true,
          commenterKnown: other?.nameKnown === true,
          commenterBlocked: Boolean(other?.flags?.blocked)
        })
        if (why !== null) {
          // Strangers to the reader are never named here, even in the read-out's skips.
          if (other?.nameKnown === true) skipped.push(`${name(charId)}: ${why}`)
          continue
        }
        const found = npcCommentRelationOf(world, posterId, charId)
        if ('relation' in found) commenters.push({ charId, relation: found.relation })
      }
      report.push(`${head}: ${commenters.length === 0 ? 'nobody may comment' : 'may be commented on'}`)
      for (const line of skipped) report.push(`  ${line}`)
      if (commenters.length > 0) candidates.push({ postId: post.id, posterId, commenters })
      posts.set(post.id, { posterId, text: post.text })
    }
  }
  if (forced && !candidates.some((one) => one.posterId === forced.posterId && one.commenters.some((c) => c.charId === forced.charId))) {
    report.push(`forced ${name(forced.charId)} cannot comment under ${name(forced.posterId)}'s post`)
  }

  const { picked, log } = pickNpcCommenters(candidates, forced)
  for (const one of log) {
    report.push(
      `  ${name(one.charId)} (${one.relation}) ${Math.round(one.chance * 100)}% rolled ${one.roll.toFixed(2)} → ${one.reason}`
    )
  }
  return picked.flatMap(({ postId, posterId, charId }) => {
    const post = posts.get(postId)
    const relation = log.find((one) => one.postId === postId && one.charId === charId)?.relation
    if (!post || !relation) return []
    return [
      {
        postId,
        posterId,
        charId,
        commentId: crypto.randomUUID(),
        relation,
        post: { text: post.text, date: game.date, time: game.time }
      }
    ]
  })
}

/**
 * The comment as the feed keeps it, or why it is dropped: cut to length, and dropped for any @
 * and for naming the reader or anybody on the roster but the poster.
 */
export function sanitizedNpcComment(
  reply: FeedRepliesResponse,
  charKey: string,
  posterId: string
): { text: string } | { dropped: string } {
  const entry = (reply.replies ?? []).find((one) => one?.who === charKey)
  const text = fittedReply(typeof entry?.text === 'string' ? entry.text : '')
  if (text === null) return { dropped: 'empty or with no whole sentence under the limit' }
  if (text.includes('@')) return { dropped: `carrying an @: "${text}"` }
  const game = useGameStore.getState()
  const roster: GossipName[] = [
    ...game.chars.flatMap((charId) => {
      const character = game.characters[charId]
      return character
        ? [{ firstName: character.firstName, lastName: character.lastName, known: charId === posterId }]
        : []
    }),
    { firstName: game.playerFirstName, lastName: game.playerLastName, known: false }
  ]
  if (unknownNameIn(text, roster)) return { dropped: `naming somebody: "${text}"` }
  return { text }
}
