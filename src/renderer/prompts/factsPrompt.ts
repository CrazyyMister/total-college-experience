import { FACT_CAP } from '@shared/facts'
import { pronounsOf } from '@shared/pronouns'
import {
  FACT_ABOUT_READER,
  FACT_CATEGORIES,
  charKeyOf,
  fullNameOf,
  type Character,
  type Fact,
  type FactCategory,
  type SceneLine,
  type StructuredRequest
} from '@shared/types'
import { factSentence } from './facts'
import { objectSchema } from './schema'
import { groupFigurantLine, groupsInPlay } from './groupPrompt'
import { ledgerPersonaFor, ledgerTranscriptOf, type PromptState } from './scenePrompt'
import { transcriptStubs } from './schedulePrompt'

/**
 * The facts call: the bookkeeping that, beside the scene ledger, notes what the finished scene
 * showed that will still be true weeks on, and who in the scene came to know a fact already kept.
 */

/** What each category is, for the writer. */
const FACT_GLOSS: Record<FactCategory, string> = {
  family: 'who somebody\'s family are and what they are like: parents, siblings, relatives',
  past: 'something that happened to somebody before this scene: where they are from, what they went through, who they used to be',
  tastes_habits: 'what somebody likes, dislikes or does regularly, beyond what their profile already says',
  plans_promises: 'something somebody says they mean to do or has promised, with no day and hour settled',
  secrets: 'something somebody does not want other people to know',
  about_reader: 'something about the reader himself that fits none of the other kinds'
}

/**
 * The facts reply's schema. `about` offers the reader and the cast the reader can name, `heardBy`
 * and `charKey` the whole cast; `learned` is asked for only when the scene knows facts to learn.
 */
function factsSchema(
  aboutKeys: readonly string[],
  castKeys: readonly string[],
  asksLearned: boolean
): { name: string; schema: Record<string, unknown> } {
  const charKey = { type: 'string', enum: [...castKeys] }
  return objectSchema('facts', asksLearned ? ['facts', 'learned'] : ['facts'], {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['about', 'category', 'text', 'said', 'heardBy'],
        properties: {
          about: { type: 'string', enum: [FACT_ABOUT_READER, ...aboutKeys] },
          category: { type: 'string', enum: [...FACT_CATEGORIES] },
          text: { type: 'string' },
          said: { type: 'boolean' },
          heardBy: { type: 'array', items: charKey }
        }
      }
    },
    ...(asksLearned
      ? {
          learned: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['fact', 'charKey'],
              properties: { fact: { type: 'string' }, charKey }
            }
          }
        }
      : {})
  })
}

/**
 * Builds the facts request for a finished scene. `facts` is everything on the save; the call is
 * shown those somebody in the cast already knows, each with its id, to say who came to know one
 * and not to propose one twice.
 */
export function buildFactsPrompt(
  cast: readonly Character[],
  scene: readonly SceneLine[],
  state: PromptState,
  reader: string,
  facts: readonly Fact[]
): StructuredRequest {
  const castKeys = cast.map((c) => charKeyOf(c.firstName, c.lastName))
  const named = cast.filter((c) => state.charInfo[c.charId]?.nameKnown === true)
  const castIds = cast.map((c) => c.charId)
  const people = Object.fromEntries(cast.map((c) => [c.charId, c]))
  const here = facts.filter((fact) => fact.knownBy.some((charId) => castIds.includes(charId)))
  const stubs = transcriptStubs(ledgerTranscriptOf(scene), cast, true)

  const preamble = [
    'YOUR TASK',
    'Hey Rita! Let\'s take the scene so far and note down the lasting facts it showed about the people in it, so we can look them up later.',
    '',
    'FACTS',
    'A fact is something lasting and specific that this scene showed or told about a character or about the reader: something that will still be true weeks from now and that somebody could bring up again.',
    `Report at most ${FACT_CAP} new facts in "facts". Fewer is better, and an empty list is the ordinary answer. Skip small talk, moods and anything that only mattered in the moment: those are memories, which another call writes.`,
    'For each fact:',
    '- "about": whose fact it is: a character key from CAST, or "reader" for the reader himself. Only people the CAST says the reader knows by name, and only people who were in this scene.',
    '- "category": exactly one of:',
    ...FACT_CATEGORIES.map((category) => `  - ${category}: ${FACT_GLOSS[category]}.`),
    '- "text": a short phrase that completes "<Name> …", where Name is who the fact is about. Do not start with the name. Use the present tense for what is true now and the past tense for what already happened: "has an older sister, Joy, who is a nurse in Boston", "grew up on a farm in Ohio", "plans to move to Spain after graduation". Name every other person; call the reader "the reader" every time, never "you", "he" or "him".',
    '- "said": true when the fact is only what somebody said — a plan, a promise, a claim, a story — and the scene does not show it happening or being true. False when the scene showed it happen or it is plainly the case.',
    '- "heardBy": the characters from CAST who were there and took it in when it came up. Leave out anybody who had left, was out of earshot or was not part of the conversation. Empty when nobody but the person it is about heard it.',
    'Never report a fact about anything the game keeps track of itself: where somebody lives, their year, their major, their job, their classes, who is dating whom, who an ex is, or a milestone such as a first kiss, a first night or sharing contact info.',
    'A plan to meet at a certain time belongs to the calendar and is never a fact. "plans_promises" is for what somebody means to do or has promised with no day and hour settled, and it never schedules anything.',
    ...(here.length > 0
      ? [
          '',
          'WHO LEARNED WHAT',
          'KNOWN FACTS below are facts somebody in this scene already knew, each with an id and who here knew it.',
          'When somebody in CAST is told one of them in this scene, or finds it out, report it in "learned" with the id copied exactly and that character\'s key. Only people who did not already know it, and only when the scene itself shows it. Never repeat a fact from KNOWN FACTS as a new one.'
        ]
      : []),
    ''
  ].join('\n')

  // A team's coach and teammates are never somebody a fact is about.
  const figurant = groupFigurantLine(
    groupsInPlay(
      cast.map((c) => state.charInfo[c.charId]?.groups),
      state.sceneLocation,
      state.playerTeam
    )
  )

  const rest = [
    'READER',
    reader,
    '',
    'CAST',
    ...cast.flatMap((c) => {
      const p = pronounsOf(c.gender)
      return [
        '',
        `${charKeyOf(c.firstName, c.lastName)} — ${fullNameOf(c)}.`,
        state.charInfo[c.charId]?.nameKnown === true
          ? `The reader knows ${p.possessive} name.`
          : `The reader does not know ${p.possessive} name, so nothing is ever about ${p.object}.`
      ]
    }),
    '',
    ...(figurant ? [figurant, ''] : []),
    ...(here.length > 0
      ? [
          'KNOWN FACTS',
          ...here.flatMap((fact) => {
            const sentence = factSentence(fact, people)
            if (!sentence) return []
            const knowers = cast
              .filter((c) => fact.knownBy.includes(c.charId))
              .map((c) => c.firstName)
            return [`- ${fact.id}: ${sentence}. Known here by ${knowers.join(', ')}.`]
          }),
          ''
        ]
      : []),
    // Last: the block that varies most.
    'SCENE SO FAR',
    '\'\'\'',
    ...stubs,
    '\'\'\'',
    ''
  ].join('\n')

  return {
    system: ledgerPersonaFor(state.lessNsfwText),
    user: `${preamble}\n${rest}`,
    schema: factsSchema(
      named.map((c) => charKeyOf(c.firstName, c.lastName)),
      castKeys,
      here.length > 0
    ),
    // Constant, not the playthrough: nothing above the seam varies by save.
    cacheKey: 'facts',
    logFrom: preamble.length + 1,
    // Judged better at high, like the ledgers, whatever the setting says.
    minThinking: 'high'
  }
}
