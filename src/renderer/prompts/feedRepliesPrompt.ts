import { READER_REPLY_MAX } from '@shared/feedReplies'
import { pronounsOf } from '@shared/pronouns'
import { affectionFor, dedupedMemoriesFor, emptyFlags } from '@shared/relationship'
import {
  fullNameOf,
  type Character,
  type CharFlags,
  type CharInfo,
  type StructuredRequest,
  type TimeSlot
} from '@shared/types'
import { DEFAULT_PLAYER_STATS, type PlayerStats } from '@shared/playerStats'
import { formatGameDate } from './gameDate'
import { relationshipLines } from './relationship'
import { objectSchema } from './schema'
import { memoryLines, personaFor, profileLines, spaced } from './scenePrompt'

/**
 * The replies under one of the reader's feed posts — his contacts' and anonymous students' —
 * a contact's reply to his comment on hers, and a contact's post tagging him.
 */

/** A contact the game picked to reply. */
export interface FeedReplier {
  character: Character
  info: CharInfo
  /** How the reply names her back — resolved through `charKeyToId`. */
  charKey: string
  /** Whether a Bunnyboard thread with her already holds anything (`hasTexted`). */
  texted: boolean
}

/** Everything the builder reads; assembled by the loop, which owns the store. */
export interface FeedRepliesInput {
  /** The cloud-LLM cache key — the playthrough, exactly as the scene calls use it. */
  playthroughId: string
  /** The player's `lessNsfwText` setting; picks which persona heads the call. */
  lessNsfwText: boolean
  /** The reader's accumulated stats, used for relationship requirement guidance. */
  stats?: PlayerStats
  /** The reader's first name, the only thing about him the contacts are told. */
  readerFirstName: string
  /** The post, and the slot he wrote it in. */
  post: { text: string; date: number; time: TimeSlot }
  /** The day the replies are weighed at: her affection and memories as they stand then. */
  date: number
  contacts: readonly FeedReplier[]
  /** The anonymous students' handles. */
  strangers: readonly string[]
}

/** How many of her latest memories a contact is given. */
const MEMORY_CAP = 3

/**
 * What of her standing with the reader may show in public: a lover's dating is common knowledge,
 * and anything else past friendship is hers alone.
 */
function publicLine(character: Character, flags: CharFlags): string | null {
  const name = character.firstName
  const p = pronounsOf(character.gender)
  if (flags.isLover) {
    return `Everybody knows ${name} and the reader are dating, so ${p.subject} may be openly affectionate in public, but nothing intimate and nothing else that is private.`
  }
  if (flags.hasCrush || flags.benefits || flags.hasKissed || flags.hadSex || flags.friendZoned || flags.friendZonedBy) {
    return `Anything above about ${name} and the reader beyond friendship — a crush, a kiss, hooking up, a friendzone — is a secret, and it must not show in ${p.possessive} reply in any way.`
  }
  return null
}

/** One contact as a feed call describes her: who she is, where she stands with him, what she recalls. */
function contactEntry(
  { character, info, charKey, texted }: FeedReplier,
  date: number,
  stats: PlayerStats | undefined
): string[] {
  const flags = info.flags ?? emptyFlags()
  const secret = publicLine(character, flags)
  return [
    `${fullNameOf(character)} — "who": "${charKey}"`,
    ...profileLines(character, flags),
    ...relationshipLines(
      character,
      flags,
      info.nameKnown,
      affectionFor(info, date, character),
      stats ?? DEFAULT_PLAYER_STATS,
      // A reply on the feed is typed on a phone, like a text.
      { texting: true, texted }
    ),
    ...(secret ? [secret] : []),
    ...memoryLines(character, dedupedMemoriesFor(info).slice(-MEMORY_CAP), info.textMemory)
  ]
}

/** Every contact the call names, described once each. */
function contactBlock(input: FeedRepliesInput): string[] {
  const entries = input.contacts.map((contact) => contactEntry(contact, input.date, input.stats))
  if (entries.length === 0) return []
  return [
    'CONTACTS',
    `They know the reader. His first name is ${input.readerFirstName}, and they may call him by it.`,
    '',
    ...entries.flatMap((entry, index) => (index === 0 ? entry : ['', ...entry]))
  ]
}

/** A post, quoted on one line under the day and half it went up. */
function quotedPost(heading: string, who: string, post: { text: string; date: number; time: TimeSlot }): string[] {
  const half = post.time === 0 ? 'morning' : 'evening'
  return [
    heading,
    `${who} posted this on Bunnyboard, the campus social feed, on ${formatGameDate(post.date)} in the ${half}:`,
    `"${post.text.replace(/\s*\n+\s*/g, ' ')}"`
  ]
}

/** The anonymous students, by handle. */
function strangerBlock(input: FeedRepliesInput): string[] {
  if (input.strangers.length === 0) return []
  return [
    'STRANGERS',
    'Students at Venus University who have never met the reader and know nothing about him but this post. They do not know his name.',
    ...input.strangers.map((handle) => `- "who": "${handle}"`)
  ]
}

/** The `FeedRepliesResponse` schema: one entry per key, `who` held to the keys asked for. */
function feedRepliesSchema(keys: readonly string[]): StructuredRequest['schema'] {
  return objectSchema('feed_replies', ['replies'], {
    replies: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['who', 'text'],
        properties: {
          who: { type: 'string', enum: [...keys] },
          text: { type: 'string' }
        }
      }
    }
  })
}

/** Builds the request for the replies under one post of the reader's. */
export function buildFeedRepliesPrompt(input: FeedRepliesInput): StructuredRequest {
  const user = [
    ...spaced(quotedPost('THE POST', 'The reader', input.post)),
    ...spaced(contactBlock(input)),
    ...spaced(strangerBlock(input)),
    'YOUR TURN',
    'Hey RITA, write the replies these people leave under the reader\'s post.',
    'Fill "replies" with one entry for every key listed under CONTACTS and STRANGERS. "who" is the key exactly as written there.',
    `"text" is the reply itself: one or two short lines in their own voice, the way they would actually type it, under ${READER_REPLY_MAX} characters. Lowercase, slang and emoji are fine if that is how they write. No narration and no stage directions.`,
    'The post is public and so is every reply: the whole campus reads them.',
    'Each reply reacts only to what the post says. They do not answer each other.',
    'A contact may bring up only what is in their memories above, and only what they would say in front of the whole campus: never sex, intimacy, secrets, confessions or feelings they have not declared, and nothing that exposes the reader or anybody else. If nothing fits, they react to the post alone.',
    'Never say or imply that something happened between a contact and the reader that their memories do not hold.',
    'Nobody makes a plan, invites him anywhere, suggests meeting up or promises anything: no "let\'s hang out", no "see you tonight", no "text me".',
    'Nobody names anybody else.',
    'The strangers never use a name and say nothing personal about the reader.'
  ].join('\n')

  return {
    system: personaFor(input.lessNsfwText),
    user,
    schema: feedRepliesSchema([
      ...input.contacts.map(({ charKey }) => charKey),
      ...input.strangers
    ]),
    cacheKey: input.playthroughId
  }
}

/** Everything the comment reply's builder reads; assembled by the loop, which owns the store. */
export interface CommentReplyInput {
  /** The cloud-LLM cache key — the playthrough, exactly as the scene calls use it. */
  playthroughId: string
  /** The player's `lessNsfwText` setting; picks which persona heads the call. */
  lessNsfwText: boolean
  /** The reader's accumulated stats, used for relationship requirement guidance. */
  stats?: PlayerStats
  /** The reader's first name, the only thing about him she is told beyond her own record. */
  readerFirstName: string
  /** The day the reply is weighed at: her affection and memories as they stand then. */
  date: number
  /** The contact whose post it is, who replies. */
  contact: FeedReplier
  /** Her post, and the slot it went up in. */
  post: { text: string; date: number; time: TimeSlot }
  /** What the reader commented under it. */
  comment: string
}

/** Builds the request for a contact's one reply to the reader's comment on her post. */
export function buildCommentReplyPrompt(input: CommentReplyInput): StructuredRequest {
  const { character, charKey } = input.contact
  const name = character.firstName
  const p = pronounsOf(character.gender)
  const user = [
    ...spaced(['CONTACT', ...contactEntry(input.contact, input.date, input.stats)]),
    ...spaced(quotedPost('THE POST', name, input.post)),
    ...spaced([
      'THE COMMENT',
      `The reader, whose first name is ${input.readerFirstName}, commented under it:`,
      `"${input.comment.replace(/\s*\n+\s*/g, ' ')}"`
    ]),
    'YOUR TURN',
    `Hey RITA, write ${name}'s reply to the reader's comment, under ${p.possessive} own post.`,
    `Fill "replies" with exactly one entry. "who" is "${charKey}".`,
    `"text" is the reply itself: one or two short lines in ${p.possessive} own voice, the way ${p.subject} would actually type it, under ${READER_REPLY_MAX} characters, in the tone of where ${p.subject} stands with the reader. Lowercase, slang and emoji are fine if that is how ${p.subject} writes. No narration and no stage directions.`,
    'The post, the comment and the reply are public: the whole campus reads them.',
    `${name} adds no new fact about the post: not where ${p.subject} is, who with, why, or what ${p.subject} is doing next. If the post does not say it, ${p.subject} does not say it. If ${p.subject} does not know what to answer, ${p.subject} reacts to the comment alone.`,
    `${p.Subject} may bring up only what is in ${p.possessive} memories above, and only what ${p.subject} would say in front of the whole campus: never sex, intimacy, secrets, confessions or feelings ${p.subject} has not declared, and nothing that exposes the reader or anybody else.`,
    `Never say or imply that something happened between ${name} and the reader that ${p.possessive} memories do not hold.`,
    `The reply is never sexual or intimate, even when the comment is: ${p.subject} may be embarrassed, change the subject or laugh it off without playing along.`,
    `${p.Subject} makes no plan, invites him nowhere and promises nothing. If the comment asks to meet up, ${p.subject} may react to it but agrees to no day, time or place.`,
    'Name nobody but people the post or the comment already names.'
  ].join('\n')

  return {
    system: personaFor(input.lessNsfwText),
    user,
    schema: feedRepliesSchema([charKey]),
    cacheKey: input.playthroughId
  }
}

/** Everything the tag post's builder reads; assembled by the loop, which owns the store. */
export interface ReaderTagInput {
  /** The cloud-LLM cache key — the playthrough, exactly as the scene calls use it. */
  playthroughId: string
  /** The player's `lessNsfwText` setting; picks which persona heads the call. */
  lessNsfwText: boolean
  /** The reader's accumulated stats, used for relationship requirement guidance. */
  stats?: PlayerStats
  /** The reader's first name. */
  readerFirstName: string
  /** The day the post is weighed at: her affection and memories as they stand then. */
  date: number
  /** The contact who posts. */
  contact: FeedReplier
  /** The summary of the scene the two of them were just in. */
  summary: string
  /** Every first name the post may use, the reader's among them. */
  names: readonly string[]
}

/** Builds the request for a contact's post about the scene just ended, tagging the reader. */
export function buildReaderTagPrompt(input: ReaderTagInput): StructuredRequest {
  const { character, charKey } = input.contact
  const name = character.firstName
  const p = pronounsOf(character.gender)
  const user = [
    ...spaced(['CONTACT', ...contactEntry(input.contact, input.date, input.stats)]),
    ...spaced([
      'THE SCENE',
      `${name} and the reader, whose first name is ${input.readerFirstName}, were just in this scene together:`,
      input.summary.replace(/\s*\n+\s*/g, ' ')
    ]),
    ...spaced(['NAMES', `The only names the post may use: ${input.names.join(', ')}.`]),
    'YOUR TURN',
    `Hey RITA, write the post ${name} puts up on Bunnyboard, the campus social feed, about that scene, tagging the reader in it.`,
    `Fill "replies" with exactly one entry. "who" is "${charKey}".`,
    `"text" is the post itself: one or two short lines in ${p.possessive} own voice, the way ${p.subject} would actually type it, under ${READER_REPLY_MAX} characters. Lowercase, slang and emoji are fine if that is how ${p.subject} writes. No narration and no stage directions.`,
    'The game adds the tag itself: write no @, no handle and no username.',
    'The post is public: the whole campus reads it.',
    'It says only what the scene above says happened and adds no fact of its own.',
    'It is about what they did and where they were, never about what anybody said, confessed or felt.',
    'Nothing romantic or physical: no flirting, no touching, nothing about how the reader looks.',
    'No secret, no plan and no promise: nothing about meeting again.',
    'Use no name that is not listed under NAMES.'
  ].join('\n')

  return {
    system: personaFor(input.lessNsfwText),
    user,
    schema: feedRepliesSchema([charKey]),
    cacheKey: input.playthroughId
  }
}
