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

/** The replies under one of the reader's feed posts: his contacts' and anonymous students'. */

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

/** Every contact the call names, described once each. */
function contactBlock(input: FeedRepliesInput): string[] {
  const entries = input.contacts.map(({ character, info, charKey, texted }) => {
    const flags = info.flags ?? emptyFlags()
    const secret = publicLine(character, flags)
    return [
      `${fullNameOf(character)} — "who": "${charKey}"`,
      ...profileLines(character, flags),
      ...relationshipLines(
        character,
        flags,
        info.nameKnown,
        affectionFor(info, input.date, character),
        input.stats ?? DEFAULT_PLAYER_STATS,
        // A reply on the feed is typed on a phone, like a text.
        { texting: true, texted }
      ),
      ...(secret ? [secret] : []),
      ...memoryLines(character, dedupedMemoriesFor(info).slice(-MEMORY_CAP), info.textMemory)
    ]
  })
  if (entries.length === 0) return []
  return [
    'CONTACTS',
    `They know the reader. His first name is ${input.readerFirstName}, and they may call him by it.`,
    '',
    ...entries.flatMap((entry, index) => (index === 0 ? entry : ['', ...entry]))
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
  const half = input.post.time === 0 ? 'morning' : 'evening'
  const user = [
    ...spaced([
      'THE POST',
      `The reader posted this on Bunnyboard, the campus social feed, on ${formatGameDate(input.post.date)} in the ${half}:`,
      `"${input.post.text.replace(/\s*\n+\s*/g, ' ')}"`
    ]),
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
