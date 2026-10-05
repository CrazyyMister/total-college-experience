import { rollPostLikes } from '@shared/feed'
import {
  FEED_REPLIES_DEADLINE_MS,
  fittedReply,
  pickReaderTagger,
  pickReplyingContacts,
  pickReplyStrangers,
  READER_TAG_CHANCE,
  readerPostLikes,
  sceneTagBars,
  tagSkipOf,
  unansweredPosts,
  type LikingContact,
  type ReplyingContact,
  type TagScene
} from '@shared/feedReplies'
import { npcFriendsOf, type NpcRelationshipMap } from '@shared/npcRelationships'
import { unknownNameIn, type GossipName } from '@shared/npcRomanceGossip'
import { tierOf, type PlayerStats } from '@shared/playerStats'
import { affectionFor, dispositionOf } from '@shared/relationship'
import {
  charKeyOf,
  type CharInfo,
  type FeedRepliesResponse,
  type LedgerResponse,
  type ReaderComment,
  type ReaderCommentAnswer,
  type ReaderPost,
  type ReaderPostAnswer,
  type ReaderPostReply,
  type ReaderTag,
  type SocialPost,
  type StructuredRequest
} from '@shared/types'
import {
  buildCommentReplyPrompt,
  buildFeedRepliesPrompt,
  buildReaderTagPrompt,
  type FeedReplier
} from '../../prompts/feedRepliesPrompt'
import { FEED_EMOJI, GOSSIP_HANDLE_POOL } from '../../prompts/feedRandoms'
import { hasTexted } from '../../prompts/textingPrompt'
import { stageContextOf, useGameStore } from '../gameStore'
import { stageAt } from '../stageStep'
import { retrySilently } from '../silentRetry'
import { lessNsfwTextNow } from './promptState'
import { currentRun, loopState, runStale } from './state'

/** The reader's own posts and comments on the feed where they meet the store and the writer. */

/** The handles the anonymous replies are picked from: the gossip's generated names. */
const STRANGER_HANDLES = GOSSIP_HANDLE_POOL.map((one) => one.handle)

/** The development build's read-out of his posts, newest first, then what the latest opening decided. */
export function readerPostDebugRows(): { key: string; text: string }[] {
  const posts = useGameStore.getState().readerPosts
  const rows =
    posts.length === 0
      ? [{ key: 'none', text: 'The reader has not posted.' }]
      : [...posts].reverse().map((post) => ({
          key: post.id,
          text:
            `Day ${post.date} ${post.time === 0 ? 'day' : 'night'}: "${post.text.slice(0, 40)}" · ` +
            (post.answered === undefined
              ? 'waiting on its likes and replies'
              : `${post.likes ?? 0} likes, ${post.replies?.length ?? 0} replies, landed day ${post.answered.date} ${post.answered.time === 0 ? 'day' : 'night'}`)
        }))
  const forced = loopState.debugFeedReplier
  const forcedName = forced ? useGameStore.getState().characters[forced]?.firstName : undefined
  return [
    ...rows,
    {
      key: 'forced',
      text:
        `Next opening: ${forcedName ? `${forcedName} replies to the latest post` : 'no reply forced'}` +
        (loopState.debugFeedRepliesFail ? '; the replies call fails' : '')
    },
    ...waitingComments().map(({ charId, post, comment }) => ({
      key: `comment-${comment.id}`,
      text: `Comment on ${useGameStore.getState().characters[charId]?.firstName ?? charId}'s post "${post.text.slice(0, 30)}": "${comment.text.slice(0, 40)}" · waiting on her reply`
    })),
    ...loopState.feedRepliesReport.map((text, at) => ({ key: `report-${at}`, text })),
    {
      key: 'tag-forced',
      text: `Next ending: ${
        loopState.debugReaderTagger
          ? `${useGameStore.getState().characters[loopState.debugReaderTagger]?.firstName ?? loopState.debugReaderTagger} tags the reader`
          : 'no tag forced'
      }`
    },
    ...loopState.readerTagReport.map((text, at) => ({ key: `tag-${at}`, text })),
    ...loopState.textLedgerReport.map((text, at) => ({ key: `ledger-${at}`, text: `Texting ledger: ${text}` }))
  ]
}

/** His contacts as the likes and the replies read them: none who has him blocked. */
function contactsOf(
  charInfo: Readonly<Record<string, CharInfo | undefined>>
): Array<ReplyingContact & LikingContact> {
  const game = useGameStore.getState()
  return game.chars.flatMap((charId) => {
    const info = charInfo[charId]
    const flags = info?.flags
    if (!info || !flags?.gaveContactInfo || flags.blocked) return []
    const affection = affectionFor(info, game.date, game.characters[charId])
    return [{ charId, affection, disposition: dispositionOf(affection), isLover: flags.isLover }]
  })
}

/**
 * The likes alone for every post of his still waiting, off his contacts as `charInfo` leaves
 * them and his Heart in `stats` — what an opening with no replies call gives.
 */
export function readerPostAnswersFor(
  charInfo: Readonly<Record<string, CharInfo | undefined>>,
  stats: PlayerStats
): ReaderPostAnswer[] {
  const waiting = unansweredPosts(useGameStore.getState().readerPosts)
  if (waiting.length === 0) return []
  const contacts = contactsOf(charInfo)
  const heart = tierOf(stats.heart)
  return waiting.map((post) => ({
    postId: post.id,
    likes: readerPostLikes(post.id, contacts, heart)
  }))
}

/** How one post's replies call came out. */
type ReplyOutcome =
  | { kind: 'written'; reply: FeedRepliesResponse }
  | { kind: 'blocked' }
  | { kind: 'failed'; why: string }
  | { kind: 'late' }

/** Sends one post's request, re-sending itself quietly while `live` holds and the budget lasts. */
async function sendReplies(
  request: StructuredRequest,
  group: string,
  live: () => boolean,
  sleeps: Array<() => void>
): Promise<ReplyOutcome> {
  for (let spent = 0; ; spent++) {
    const result = await window.api.llm.completeFeedReplies(request, group)
    if (!live()) return { kind: 'failed', why: 'abandoned' }
    if (result.ok) return { kind: 'written', reply: result.data }
    // A content block is the post itself; a resend meets the same filter.
    if (result.error.code === 'LLM_BLOCKED') return { kind: 'blocked' }
    const again = await retrySilently('feed replies', result.error, spent, {
      onSleep: (cancel) => sleeps.push(cancel)
    })
    if (!live()) return { kind: 'failed', why: 'abandoned' }
    if (!again) return { kind: 'failed', why: result.error.message }
  }
}

/**
 * The replies the call came back with, in the order shown — the contacts asked, then the
 * strangers — each cut to length and checked for names: a contact's naming somebody the reader
 * cannot name, or a stranger's naming anybody on the roster or the reader himself, is dropped.
 */
function sanitizedReplies(
  reply: FeedRepliesResponse,
  contacts: ReadonlyArray<{ charId: string; charKey: string }>,
  strangers: ReadonlyArray<{ handle: string; emoji: string }>,
  charInfo: Readonly<Record<string, CharInfo | undefined>>
): { replies: ReaderPostReply[]; dropped: string[] } {
  const game = useGameStore.getState()
  const roster: GossipName[] = game.chars.flatMap((charId) => {
    const character = game.characters[charId]
    return character
      ? [
          {
            firstName: character.firstName,
            lastName: character.lastName,
            known: charInfo[charId]?.nameKnown === true
          }
        ]
      : []
  })
  const nobodyKnown: GossipName[] = [
    ...roster.map((one) => ({ ...one, known: false })),
    { firstName: game.playerFirstName, lastName: game.playerLastName, known: false }
  ]

  const written = new Map<string, string>()
  const dropped: string[] = []
  for (const entry of reply.replies ?? []) {
    const who = typeof entry?.who === 'string' ? entry.who : ''
    const asked =
      contacts.some((one) => one.charKey === who) || strangers.some((one) => one.handle === who)
    if (!asked) {
      dropped.push(`a reply from "${who}", who was not asked`)
      continue
    }
    if (written.has(who)) {
      dropped.push(`a second reply from ${who}`)
      continue
    }
    const text = fittedReply(typeof entry.text === 'string' ? entry.text : '')
    if (text === null) {
      dropped.push(`${who}'s reply, empty or with no whole sentence under the limit`)
      continue
    }
    const stranger = strangers.some((one) => one.handle === who)
    if (unknownNameIn(text, stranger ? nobodyKnown : roster)) {
      dropped.push(`${who}'s reply, naming somebody: "${text}"`)
      continue
    }
    written.set(who, text)
  }
  for (const line of dropped) console.warn('[feed replies] dropped', line)

  const replies: ReaderPostReply[] = [
    ...contacts.flatMap(({ charId, charKey }) => {
      const text = written.get(charKey)
      return text ? [{ charId, text }] : []
    }),
    ...strangers.flatMap(({ handle, emoji }) => {
      const text = written.get(handle)
      return text ? [{ handle, emoji, text }] : []
    })
  ]
  return { replies, dropped }
}

/** One waiting post's call, as it is sent. */
interface PendingPost {
  post: ReaderPost
  likes: number
  contacts: Array<{ charId: string; charKey: string }>
  strangers: Array<{ handle: string; emoji: string }>
  report: string[]
  outcome: Promise<ReplyOutcome>
}

/** One waiting comment of his, and the call for her reply where one was sent. */
interface PendingComment {
  charId: string
  charKey: string
  post: SocialPost
  comment: ReaderComment
  report: string
  /** Absent where the game decided she gives no reply, so no call went out. */
  outcome?: Promise<ReplyOutcome>
}

/** What an opening banks of his waiting posts and comments, and of the post tagging him. */
interface ReaderFeedAnswers {
  posts: ReaderPostAnswer[]
  comments: ReaderCommentAnswer[]
  tag?: ReaderTag
}

/** The post an ending has a contact write about the scene, tagging the reader, as it is asked for. */
export interface ReaderTagAsk {
  charId: string
  postId: string
  likes: number
  /** The summary of the scene that ended. */
  summary: string
  /** Everybody the scene held; the post may name those of them the reader knows. */
  castIds: string[]
}

/** The replies an opening asked for, settled once the opening itself is in. */
export interface PendingReaderFeedAnswers {
  /**
   * What the opening banks, waiting at most the deadline more: a post answered with its likes
   * and whatever replies survived, or its likes alone on a content block; a comment answered
   * with her reply, or with none where she gives none, the writer blocked it or the reply was
   * dropped; anything else — a failure, or past the deadline — left out, still waiting. The tag
   * is banked only when it came back written and survived its checks, and never waits.
   */
  settle: () => Promise<ReaderFeedAnswers>
}

/** His comments still waiting on a reply, on the posts of everybody on the roster. */
function waitingComments(): Array<{ charId: string; post: SocialPost; comment: ReaderComment }> {
  const game = useGameStore.getState()
  return game.chars.flatMap((charId) =>
    (game.charInfo[charId]?.feed ?? []).flatMap((post) =>
      post.comment && post.comment.answered === undefined
        ? [{ charId, post, comment: post.comment }]
        : []
    )
  )
}

/**
 * The post tagging the reader as the feed keeps it, or why it is dropped: cut to length, and
 * dropped for any @ — the game writes the only one — or for naming somebody on the roster the
 * reader cannot name or who was not in the scene.
 */
function sanitizedTag(
  reply: FeedRepliesResponse,
  charKey: string,
  castIds: readonly string[],
  charInfo: Readonly<Record<string, CharInfo | undefined>>
): { text: string } | { dropped: string } {
  const entry = (reply.replies ?? []).find((one) => one?.who === charKey)
  const text = fittedReply(typeof entry?.text === 'string' ? entry.text : '')
  if (text === null) return { dropped: 'empty or with no whole sentence under the limit' }
  if (text.includes('@')) return { dropped: `carrying an @: "${text}"` }
  const game = useGameStore.getState()
  const roster: GossipName[] = game.chars.flatMap((charId) => {
    const character = game.characters[charId]
    return character
      ? [
          {
            firstName: character.firstName,
            lastName: character.lastName,
            known: castIds.includes(charId) && charInfo[charId]?.nameKnown === true
          }
        ]
      : []
  })
  if (unknownNameIn(text, roster)) return { dropped: `naming somebody: "${text}"` }
  return { text }
}

/**
 * Asks for the replies to every post and comment of his still waiting, one call each, and for
 * the post `tag` names, beside the opening being asked for under `group`: the contacts and the
 * strangers who reply to a post are picked off its id, the likes as {@link readerPostAnswersFor}
 * has them, and a comment is answered by the contact whose post it is on unless she is hostile
 * or no longer his contact.
 */
export function startReaderFeedAnswers(
  charInfo: Readonly<Record<string, CharInfo | undefined>>,
  stats: PlayerStats,
  call: { group: string; stale: () => boolean },
  tag: ReaderTagAsk | null = null
): PendingReaderFeedAnswers {
  const run = currentRun()
  const game = useGameStore.getState()
  const waiting = unansweredPosts(game.readerPosts)
  const commented = waitingComments()
  if (waiting.length === 0 && commented.length === 0 && tag === null) {
    loopState.feedRepliesReport = []
    return { settle: async () => ({ posts: [], comments: [] }) }
  }

  let expired = false
  const live = (): boolean => !expired && !runStale(run) && !call.stale()
  const sleeps: Array<() => void> = []
  const groups: string[] = []
  const contacts = contactsOf(charInfo)
  const heart = tierOf(stats.heart)
  const newest = waiting[waiting.length - 1]
  const name = (charId: string): string => game.characters[charId]?.firstName ?? charId
  const fail = loopState.debugFeedRepliesFail
  loopState.debugFeedRepliesFail = false
  const common = {
    playthroughId: game.playthroughId ?? 'unsaved',
    lessNsfwText: lessNsfwTextNow(),
    stats,
    readerFirstName: game.playerFirstName,
    date: game.date
  }

  /** Sends one request under a group of its own, or fails it at once under the dev button. */
  const send = (id: string, request: StructuredRequest): Promise<ReplyOutcome> => {
    if (fail) return Promise.resolve({ kind: 'failed', why: 'forced by the development button' })
    const group = `feedReplies:${id}:${Date.now()}`
    groups.push(group)
    loopState.feedRepliesCalls.push({ group, parent: call.group })
    return sendReplies(request, group, live, sleeps)
  }

  /** One contact as the feed calls describe her. */
  const replierOf = (charId: string): FeedReplier | null => {
    const character = game.characters[charId]
    const info = charInfo[charId]
    return character && info
      ? {
          character,
          info,
          charKey: charKeyOf(character.firstName, character.lastName),
          texted: hasTexted(game.bunnyboard.conversations[charId])
        }
      : null
  }

  const pendingPosts: PendingPost[] = waiting.map((post) => {
    const forced =
      post === newest && loopState.debugFeedReplier ? [loopState.debugFeedReplier] : []
    const { picked, log } = pickReplyingContacts(post.id, contacts, forced)
    const strangers = pickReplyStrangers(post.id, STRANGER_HANDLES, FEED_EMOJI)
    const asked = picked.flatMap((charId) => {
      const replier = replierOf(charId)
      return replier ? [{ charId, ...replier }] : []
    })
    const report = [
      `Post "${post.text.slice(0, 30)}": ` +
        (log.length === 0
          ? 'no contacts'
          : log
              .map(
                (one) =>
                  `${name(one.charId)} ${Math.round(one.chance * 100)}% rolled ${one.roll.toFixed(2)} → ${one.reason}`
              )
              .join(', ')),
      `  strangers: ${strangers.map((one) => `${one.emoji} @${one.handle}`).join(', ')}`
    ]
    const request = buildFeedRepliesPrompt({
      ...common,
      post: { text: post.text, date: post.date, time: post.time },
      contacts: asked,
      strangers: strangers.map(({ handle }) => handle)
    })
    return {
      post,
      likes: readerPostLikes(post.id, contacts, heart),
      contacts: asked.map(({ charId, charKey }) => ({ charId, charKey })),
      strangers,
      report,
      outcome: send(post.id, request)
    }
  })

  const pendingComments: PendingComment[] = commented.map(({ charId, post, comment }) => {
    const head = `Comment on ${name(charId)}'s post "${post.text.slice(0, 30)}"`
    const replier = replierOf(charId)
    const contact = contacts.find((one) => one.charId === charId)
    const charKey = replier?.charKey ?? charId
    if (!replier || !contact) {
      return { charId, charKey, post, comment, report: `${head}: no longer a contact → no reply` }
    }
    if (contact.disposition === 'hostile') {
      return { charId, charKey, post, comment, report: `${head}: hostile → no reply` }
    }
    const request = buildCommentReplyPrompt({
      ...common,
      contact: replier,
      post: { text: post.text, date: post.date, time: post.time },
      comment: comment.text
    })
    return {
      charId,
      charKey,
      post,
      comment,
      report: `${head}: ${contact.disposition}, asked`,
      outcome: send(comment.id, request)
    }
  })

  const tagger = tag ? replierOf(tag.charId) : null
  const pendingTag =
    tag && tagger
      ? {
          ask: tag,
          charKey: tagger.charKey,
          outcome: send(
            tag.postId,
            buildReaderTagPrompt({
              ...common,
              contact: tagger,
              summary: tag.summary,
              names: [
                game.playerFirstName,
                ...tag.castIds.flatMap((charId) => {
                  const character = game.characters[charId]
                  return character && charInfo[charId]?.nameKnown ? [character.firstName] : []
                })
              ]
            })
          )
        }
      : null

  return {
    settle: async () => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const late = new Promise<ReplyOutcome>((resolve) => {
        timer = setTimeout(() => resolve({ kind: 'late' }), FEED_REPLIES_DEADLINE_MS)
      })
      const race = (outcome: Promise<ReplyOutcome>): Promise<ReplyOutcome> =>
        Promise.race([outcome, late])
      const [postOutcomes, commentOutcomes, tagOutcome] = await Promise.all([
        Promise.all(pendingPosts.map(({ outcome }) => race(outcome))),
        Promise.all(
          pendingComments.map(({ outcome }) => (outcome ? race(outcome) : Promise.resolve(null)))
        ),
        pendingTag ? race(pendingTag.outcome) : Promise.resolve(null)
      ])
      clearTimeout(timer)
      // Whatever is still out is cut off here, so nothing it brings back can land anywhere.
      expired = true
      for (const cancel of sleeps) cancel()
      cancelGroups(groups)
      if (runStale(run) || call.stale()) return { posts: [], comments: [] }

      const posts: ReaderPostAnswer[] = []
      const report: string[] = []
      pendingPosts.forEach((one, at) => {
        const outcome = postOutcomes[at]
        report.push(...one.report)
        if (outcome.kind === 'late') {
          report.push('  → past the deadline: the post keeps waiting')
          return
        }
        if (outcome.kind === 'failed') {
          report.push(`  → the call failed (${outcome.why}): the post keeps waiting`)
          return
        }
        if (outcome.kind === 'blocked') {
          report.push('  → blocked for its content: likes only')
          posts.push({ postId: one.post.id, likes: one.likes })
          return
        }
        const { replies, dropped } = sanitizedReplies(
          outcome.reply,
          one.contacts,
          one.strangers,
          charInfo
        )
        report.push(
          replies.length > 0
            ? `  → ${replies.length} replies written`
            : '  → every reply dropped: likes only',
          ...dropped.map((line) => `  dropped ${line}`)
        )
        posts.push({
          postId: one.post.id,
          likes: one.likes,
          ...(replies.length > 0 ? { replies } : {})
        })
      })

      const comments: ReaderCommentAnswer[] = []
      pendingComments.forEach((one, at) => {
        const outcome = commentOutcomes[at]
        const answer = { charId: one.charId, postId: one.post.id, commentId: one.comment.id }
        report.push(one.report)
        if (outcome === null) {
          comments.push(answer)
          return
        }
        if (outcome.kind === 'late') {
          report.push('  → past the deadline: the comment keeps waiting')
          return
        }
        if (outcome.kind === 'failed') {
          report.push(`  → the call failed (${outcome.why}): the comment keeps waiting`)
          return
        }
        if (outcome.kind === 'blocked') {
          report.push('  → blocked for its content: no reply')
          comments.push(answer)
          return
        }
        const { replies, dropped } = sanitizedReplies(
          outcome.reply,
          [{ charId: one.charId, charKey: one.charKey }],
          [],
          charInfo
        )
        const reply = replies[0]?.text
        report.push(
          reply !== undefined ? '  → reply written' : '  → the reply was dropped: no reply',
          ...dropped.map((line) => `  dropped ${line}`)
        )
        comments.push(reply !== undefined ? { ...answer, reply } : answer)
      })

      loopState.feedRepliesReport = report

      // The tag is about a scene already over: whatever keeps it from landing drops it for good.
      let banked: ReaderTag | undefined
      if (pendingTag && tagOutcome) {
        const head = `Tag call for ${name(pendingTag.ask.charId)}`
        if (tagOutcome.kind === 'late') {
          loopState.readerTagReport.push(`${head}: past the deadline, no tag`)
        } else if (tagOutcome.kind === 'failed') {
          loopState.readerTagReport.push(`${head}: failed (${tagOutcome.why}), no tag`)
        } else if (tagOutcome.kind === 'blocked') {
          loopState.readerTagReport.push(`${head}: blocked for its content, no tag`)
        } else {
          const checked = sanitizedTag(
            tagOutcome.reply,
            pendingTag.charKey,
            pendingTag.ask.castIds,
            charInfo
          )
          if ('dropped' in checked) {
            console.warn('[feed replies] dropped the tag post,', checked.dropped)
            loopState.readerTagReport.push(`${head}: dropped, ${checked.dropped}`)
          } else {
            loopState.readerTagReport.push(`${head}: written, "${checked.text}"`)
            banked = {
              charId: pendingTag.ask.charId,
              postId: pendingTag.ask.postId,
              text: checked.text,
              likes: pendingTag.ask.likes
            }
          }
        }
      }
      return { posts, comments, ...(banked ? { tag: banked } : {}) }
    }
  }
}

/** Cancels the replies calls under `groups` and forgets them. */
function cancelGroups(groups: readonly string[]): void {
  for (const group of groups) void window.api.jobs.cancelGroup(group)
  loopState.feedRepliesCalls = loopState.feedRepliesCalls.filter(
    ({ group }) => !groups.includes(group)
  )
}

/** Cancels every replies call out beside an opening under `parent`, or every one when absent. */
export function cancelFeedReplies(parent?: string): void {
  cancelGroups(
    loopState.feedRepliesCalls
      .filter((one) => parent === undefined || one.parent === parent)
      .map(({ group }) => group)
  )
}

/** The reader's milestones a scene may report without anything in it being private. */
const PUBLIC_MILESTONES: ReadonlySet<string> = new Set(['gave_contact_info', 'unblocked'])

/** A finished scene as the tag reads it: what it held, who was in it and its summary. */
export interface ReaderTagScene extends TagScene {
  cast: string[]
  /** Those of the cast no longer in the scene when it ended. */
  departed: string[]
  summary: string | null
}

/**
 * The scene that just ended as the tag reads it, off the store and off the scene's own ledger as
 * it came back, before any of its rows were filtered: every kiss, night, romance row and wingman
 * action it reported counts, with anybody at all. A date is a scene arranged by text, or a plan
 * on the calendar for this slot with somebody in the cast.
 */
export function readerTagSceneOf(ledger: LedgerResponse): ReaderTagScene {
  const game = useGameStore.getState()
  const cast = [...game.cast]
  const partners = new Set<string>()
  if (game.sceneTextLedgerSkip) partners.add(game.sceneTextLedgerSkip)
  for (const event of game.events) {
    if (event.date !== game.date || event.time !== game.time) continue
    for (const charId of event.charIds) if (cast.includes(charId)) partners.add(charId)
  }
  return {
    inPublic: game.sceneInPublic,
    acts: (ledger.acts ?? []).length,
    romance: (ledger.romance ?? []).length,
    milestones: (ledger.events ?? []).filter((one) => !PUBLIC_MILESTONES.has(one?.event)).length,
    dates: [...partners].map((charId) => ({
      charId,
      isLover: game.charInfo[charId]?.flags?.isLover === true
    })),
    cast,
    departed: stageAt([...game.sceneLog, ...game.pendingLines], stageContextOf(game)).departed,
    summary: game.sceneSummary
  }
}

/**
 * Who of the scene that ended tags the reader in a post about it, rolled once here, or null:
 * nobody from a scene that would expose something, and otherwise one of those still in it at its
 * end who are his contacts as the ending leaves them, have not blocked him, are friendly or
 * better and do not post for sure in the slot it opens. Writes the development read-out.
 */
export function readerTagFor(
  scene: ReaderTagScene,
  charInfo: Readonly<Record<string, CharInfo | undefined>>,
  posting: ReadonlySet<string>,
  npcRelationships: NpcRelationshipMap,
  rand: () => number = Math.random
): ReaderTagAsk | null {
  const game = useGameStore.getState()
  const name = (charId: string): string => game.characters[charId]?.firstName ?? charId
  const forced = loopState.debugReaderTagger
  const report = [
    `Tag: ${scene.inPublic ? 'public' : 'private'}, ${scene.acts} kisses or nights, ` +
      `${scene.romance} romance or wingman rows, ${scene.milestones} milestones of his` +
      (scene.dates.length > 0
        ? `, a date with ${scene.dates.map((one) => `${name(one.charId)}${one.isLover ? ' (his lover)' : ''}`).join(', ')}`
        : '')
  ]
  loopState.readerTagReport = report

  const bars = sceneTagBars(scene)
  if (bars.length > 0) {
    report.push(`  the scene tags nobody: ${bars.join(', ')}`)
    return null
  }
  if (!scene.summary) {
    report.push('  the scene tags nobody: no summary')
    return null
  }

  const eligible: string[] = []
  for (const charId of scene.cast) {
    const info = charInfo[charId]
    const affection = info ? affectionFor(info, game.date, game.characters[charId]) : 0
    const skip = tagSkipOf({
      charId,
      left: scene.departed.includes(charId),
      contact: Boolean(info?.flags?.gaveContactInfo),
      blocked: Boolean(info?.flags?.blocked),
      disposition: dispositionOf(affection),
      posting: posting.has(charId)
    })
    report.push(`  ${name(charId)}: ${skip ?? 'may tag'}`)
    if (skip === null) eligible.push(charId)
  }
  if (forced && !eligible.includes(forced)) {
    report.push(`  forced ${name(forced)} cannot tag here`)
  }

  const { tagger, roll } = pickReaderTagger(eligible, forced, rand)
  report.push(
    tagger && roll === null
      ? `  ${name(tagger)} tags the reader, forced`
      : roll === null
        ? '  nobody may tag'
        : `  ${Math.round(READER_TAG_CHANCE * 100)}% rolled ${roll.toFixed(2)} → ${tagger ? `${name(tagger)} tags the reader` : 'no tag'}`
  )
  if (!tagger) return null
  return {
    charId: tagger,
    postId: crypto.randomUUID(),
    likes: rollPostLikes(npcFriendsOf(npcRelationships, tagger, game.chars).length, rand),
    summary: scene.summary,
    castIds: scene.cast
  }
}
