import {
  charKeyOf,
  MEMORY_TYPES,
  TEXT_MEMORY_SOURCES,
  type CharInfo,
  type LedgerResponse,
  type StructuredRequest,
  type TextMemorySource
} from '@shared/types'
import { objectSchema } from './schema'
import { LEDGER_PERSONA, milestoneCastLines } from './scenePrompt'
import {
  feedBlock,
  feedCharKeys,
  messagesBlock,
  phoneMemoryCharKeys,
  plansSchema,
  scheduleBlocks,
  scheduleCharKeys,
  TEXT_PLANS_INSTRUCTIONS,
  textLedgerCharKeys,
  type SchedulePromptInput
} from './schedulePrompt'

/**
 * The texting ledger: the bookkeeping call for the slot's Bunnyboard messages and for the
 * exchanges with the reader on the feed that closed in it.
 */

/**
 * The milestones a text thread can reach, each with the gloss RITA is given — the texting-ledger
 * subset of the scene ledger's `EVENT_GLOSS`, in the same append-only discipline.
 */
export const TEXT_EVENT_GLOSS: ReadonlyArray<readonly [string, string]> = [
  ['became_lovers', 'they agreed over these texts to be a couple'],
  ['broke_up', 'their relationship ended in these texts'],
  [
    'friendzoned_by_reader',
    'the reader turned the character down in these texts or made it clear they\'re just friends'
  ],
  [
    'friendzoned_reader',
    'the character turned the reader down in these texts or made it clear they\'re just friends'
  ],
  [
    'agreed_to_harem',
    'the character agreed in these texts to an open relationship and/or to share the reader with other people, and not to be jealous about them'
  ]
]

/**
 * The texting ledger's schema — one branch, every field required. `memoryKeys` is never empty:
 * the call only fires when somebody texted or had an exchange with him on the feed. With nobody
 * texted, the events and the plans are left out, since only texts may carry them.
 */
function textLedgerSchema(
  textedKeys: readonly string[],
  memoryKeys: readonly string[],
  rosterKeys: readonly string[]
): { name: string; schema: Record<string, unknown> } {
  const textMemories = {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['charKey', 'source', 'type', 'desc'],
      properties: {
        charKey: { type: 'string', enum: [...memoryKeys] },
        source: { type: 'string', enum: [...TEXT_MEMORY_SOURCES] },
        type: { type: 'string', enum: [...MEMORY_TYPES] },
        desc: { type: 'string' }
      }
    }
  }
  if (textedKeys.length === 0) return objectSchema('text-ledger', ['textMemories'], { textMemories })
  return objectSchema('text-ledger', ['events', 'textMemories', 'plans'], {
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['charKey', 'event'],
        properties: {
          charKey: { type: 'string', enum: [...textedKeys] },
          event: { type: 'string', enum: TEXT_EVENT_GLOSS.map(([key]) => key) }
        }
      }
    },
    textMemories,
    plans: plansSchema(rosterKeys)
  })
}

/** Builds the texting ledger request. */
export function buildTextLedgerPrompt(
  schedule: SchedulePromptInput,
  charInfo: Record<string, CharInfo>
): StructuredRequest {
  const textedKeys = textLedgerCharKeys(schedule)
  const memoryKeys = phoneMemoryCharKeys(schedule)
  const rosterKeys = scheduleCharKeys(schedule.characters)
  // Everybody it may file a memory for, as characters, in roster order.
  const keyed = new Set(memoryKeys)
  const people = Object.values(schedule.characters).filter((character) =>
    keyed.has(charKeyOf(character.firstName, character.lastName))
  )
  const [texts, feed] = TEXT_MEMORY_SOURCES

  const preamble = [
    'YOUR TASK',
    'Hey Rita! The reader spent part of this day on Bunnyboard, texting and on the campus feed. Let\'s take THE MESSAGES and THE FEED below and create some notes for us to reference later.',
    'Judge the texts and the feed alone: anything a scene did face to face is another call\'s business.',
    '',
    'EVENTS',
    'List any of these milestones that actually happened IN THESE MESSAGES:',
    ...TEXT_EVENT_GLOSS.map(([key, gloss]) => `- ${key}: ${gloss}`),
    'A milestone that did not happen in these messages is simply left out. If one happened again — they broke up again — report it again; the app knows which time it was.',
    '',
    'TEXT MEMORIES',
    'For each character the reader texted or had an exchange with on THE FEED, write at most ONE memory of what it left them with, in "textMemories" — one, even when there were both.',
    `"source" says where that memory comes from: "${texts}" for THE MESSAGES, "${feed}" for THE FEED.`,
    'Each desc completes the sentence "<Name> <type> that ...", in the past tense, e.g. "the reader asked how their recital went".',
    'A desc never says where it happened — no "over text", "by text", "on Bunnyboard" or "on the feed" — since the game adds that.',
    'A memory from THE FEED is only about what the reader wrote and how the character took it, e.g. "the reader posted about acing a midterm and they cheered the reader on". Never about a fact a reply states, or anything a reply says happened or will happen.',
    'Call the reader "the reader" every time, never "you", "he" or "him": "the reader lent them the reader\'s notes", not "he lent them his notes".',
    'Small talk that left them feeling nothing gets no entry. Give a character nothing rather than something invented.',
    '',
    'EVENTS and PLANS come from THE MESSAGES alone, never from THE FEED.',
    '',
    ...TEXT_PLANS_INSTRUCTIONS,
    ''
  ].join('\n')

  // The cloud-LLM seam: everything above is constant across calls, everything below varies,
  // and the console log starts here.
  const rest = [
    'PEOPLE — whoever the reader texted or had an exchange with on the feed.',
    ...milestoneCastLines(people, charInfo),
    '',
    ...scheduleBlocks(schedule, true),
    '',
    ...messagesBlock(schedule),
    '',
    ...feedBlock(schedule),
    ''
  ].join('\n')

  return {
    system: LEDGER_PERSONA,
    user: `${preamble}\n${rest}`,
    schema: textLedgerSchema(textedKeys, memoryKeys, rosterKeys),
    // Constant: everything save-varying sits below the seam.
    cacheKey: 'text-ledger',
    logFrom: preamble.length + 1,
    // The bookkeeping is judged better at high, whatever the setting says.
    minThinking: 'high'
  }
}

/**
 * The texting ledger's reply held to what the slot gave it, and why each row was dropped or
 * changed: an event from somebody he did not text is dropped, and so is a plan none of whose
 * people he texted; a memory for somebody he neither texted nor met on the feed is dropped, and
 * one whose source is not where she was with him is put down to where she was, his texts where
 * it was both.
 */
export function fittedTextLedger(
  reply: LedgerResponse,
  schedule: SchedulePromptInput
): { reply: LedgerResponse; report: string[] } {
  const texted = new Set(textLedgerCharKeys(schedule))
  const onFeed = new Set(feedCharKeys(schedule))
  const report: string[] = []
  const fitted: LedgerResponse = { ...reply }

  if (reply.events !== undefined) {
    fitted.events = reply.events.filter((row) => {
      if (texted.has(row?.charKey)) return true
      report.push(`dropped the event ${row?.event} of ${row?.charKey}, who did not text him`)
      return false
    })
  }
  if (reply.plans !== undefined) {
    fitted.plans = reply.plans.filter((plan) => {
      if ((plan?.chars ?? []).some((key) => texted.has(key))) return true
      report.push(`dropped the plan "${plan?.title}", with nobody who texted him`)
      return false
    })
  }
  if (reply.textMemories !== undefined) {
    fitted.textMemories = reply.textMemories.flatMap((row) => {
      const charKey = row?.charKey
      const wasTexted = texted.has(charKey)
      const wasOnFeed = onFeed.has(charKey)
      if (!wasTexted && !wasOnFeed) {
        report.push(`dropped the memory of ${charKey}, who neither texted him nor met him on the feed`)
        return []
      }
      const source: TextMemorySource =
        row.source === 'feed' && wasOnFeed
          ? 'feed'
          : row.source === 'texts' && wasTexted
            ? 'texts'
            : wasTexted
              ? 'texts'
              : 'feed'
      if (row.source !== source) {
        report.push(`put ${charKey}'s memory down to ${source}, not ${String(row.source)}`)
      }
      return [{ ...row, source }]
    })
  }
  return { reply: fitted, report }
}

/**
 * Folds the two bookkeeping replies into the one `LedgerResponse` downstream reads:
 * scene first in both lists, an `events` row the scene already reported dropped, and a
 * `plans` row sharing a slot and an attendee with a scene plan losing to it.
 */
export function mergeLedgerReplies(main: LedgerResponse, texting: LedgerResponse): LedgerResponse {
  const merged: LedgerResponse = { ...main }

  if (texting.textMemories !== undefined) merged.textMemories = texting.textMemories

  if (texting.events?.length) {
    const seen = new Set((main.events ?? []).map((row) => `${row.charKey}\u0000${row.event}`))
    const fresh = texting.events.filter((row) => !seen.has(`${row.charKey}\u0000${row.event}`))
    if (main.events?.length || fresh.length) merged.events = [...(main.events ?? []), ...fresh]
  }

  if (texting.plans?.length) {
    const scenePlans = main.plans ?? []
    const fresh = texting.plans.filter(
      (plan) =>
        !scenePlans.some(
          (existing) =>
            existing.slot === plan.slot &&
            (plan.chars ?? []).some((key) => (existing.chars ?? []).includes(key))
        )
    )
    if (scenePlans.length || fresh.length) merged.plans = [...scenePlans, ...fresh]
  }

  return merged
}
