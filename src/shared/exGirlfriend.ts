import { FALLBACK_DORM } from './dorms'
import { romancesReader } from './characterRules'
import { pronounsOf } from './pronouns'
import { foldRelationshipEvents, initialFlags } from './relationship'
import {
  EX_ENDERS,
  EX_TONES,
  type CharFlags,
  type CharInfo,
  type CharMemory,
  type Character,
  type ExChoice,
  type ExEnder,
  type ExTone,
  type MemoryType,
  type RelationshipEvent
} from './types'

/**
 * The reader's chosen ex: whether a character can be one, what the game writes onto her before
 * day 0, and the paragraph that tells her story to the prompts and the contact page.
 */

/** What the game decides about her, to lay over her entry when the first save is written. */
export interface ExSeed {
  flags: CharFlags
  memories: CharMemory[]
  nameKnown: true
  /** The day they started dating, before day 0. */
  datingSince: number
  /** The day it ended, in the summer before the semester. */
  brokeUpOn: number
}

/** Days before day 0 the breakup falls: from August 31 back to June 1 of the previous year. */
const ENDED_NEAREST = 141
const ENDED_FARTHEST = 232

/** Days before day 0 the dating began: between one and two years back. */
const STARTED_NEAREST = 365
const STARTED_FARTHEST = 730

/** The first kiss comes up to this many days before they started dating. */
const KISS_LEAD_MAX = 10

/** The first night comes at least this long after they started and this long before it ended. */
const NIGHT_AFTER_START = 7
const NIGHT_BEFORE_END = 30

/** Whether a character may be the reader's ex: only a character who can be his romance. */
export function canBeEx(character: Character): boolean {
  return romancesReader(character)
}

/** One ex memory: the reader's voice, dated and with no half of the day. */
function memoryOn(date: number, type: MemoryType, desc: string): CharMemory {
  return { date, type, desc }
}

/** What fills the stretch of the relationship, by tone: three memories apiece. */
function toneMemories(tone: ExTone): [MemoryType, string][] {
  if (tone === 'good') {
    return [
      ['loved', 'the reader always made time for her, even when things got hectic'],
      ['loved', 'the reader planned a whole day around her birthday'],
      ['liked', 'the reader stuck by her through a rough few weeks']
    ]
  }
  return [
    ['disliked', 'the reader and she kept having the same fight over and over'],
    ['hated', 'the reader stopped making time for her near the end'],
    ['disliked', 'the reader went quiet whenever she tried to talk about the future']
  ]
}

/** The one memory of how it ended, by tone and by who ended it. */
function endingMemory(tone: ExTone, endedBy: ExEnder): [MemoryType, string] {
  if (tone === 'good') {
    const liked: Record<ExEnder, string> = {
      her: 'the reader took it gracefully when she ended things',
      him: 'the reader ended things kindly and honestly',
      both: 'the reader and she parted as friends'
    }
    return ['liked', liked[endedBy]]
  }
  const hated: Record<ExEnder, string> = {
    her: "the reader didn't even try to talk it through when she ended things",
    him: 'the reader ended things without warning',
    both: 'the reader and she parted in a bitter, shouting argument'
  }
  return ['hated', hated[endedBy]]
}

/** The reason the game's own breakup memory gives, by who ended it. */
function becauseOf(endedBy: ExEnder, subject: string): string {
  if (endedBy === 'her') return `because ${subject} ended it`
  if (endedBy === 'him') return 'because the reader ended it'
  return 'because they agreed it was over'
}

/**
 * Everything the game writes onto a character who starts as the reader's ex, all of it before day
 * 0: the milestones one by one, each on its own day through the same fold a scene's ledger takes,
 * and the memories that colour it, none with a half of the day. Null for anyone who cannot be his
 * romance. The kiss and night counts are never touched.
 */
export function exSeedOf(
  character: Character,
  choice: Pick<ExChoice, 'tone' | 'endedBy'>,
  rand: () => number = Math.random
): ExSeed | null {
  if (!canBeEx(character)) return null
  const p = pronounsOf(character.gender)
  const between = (from: number, to: number): number => from + Math.floor(rand() * (to - from + 1))

  const ended = -between(ENDED_NEAREST, ENDED_FARTHEST)
  const started = -between(STARTED_NEAREST, STARTED_FARTHEST)
  const kissed = started - between(1, KISS_LEAD_MAX)
  const night = between(started + NIGHT_AFTER_START, ended - NIGHT_BEFORE_END)
  const during = [0, 1, 2].map(() => between(started + 1, ended - 1)).sort((a, b) => a - b)

  // Folded in the order it happened; her entry starts with nothing but who she is.
  let info: CharInfo = {
    memories: [],
    flags: { ...initialFlags(character), hasMet: true },
    nameKnown: true,
    year: 1,
    dorm: FALLBACK_DORM,
    major: '',
    schedule: {},
    gifts: []
  }
  const fold = (event: RelationshipEvent, date: number, because?: string): void => {
    info = foldRelationshipEvents(info, [event], { date, time: 0 }, character.gender, because)
  }
  fold('gave_contact_info', kissed)
  fold('kissed', kissed)
  fold('became_lovers', started)
  fold('sex', night)
  fold('broke_up', ended, becauseOf(choice.endedBy, p.subject))

  const [endType, endDesc] = endingMemory(choice.tone, choice.endedBy)
  const own = [
    ...toneMemories(choice.tone).map(([type, desc], index) =>
      memoryOn(during[index], type, desc)
    ),
    memoryOn(ended, endType, endDesc)
  ]
  const memories = [...info.memories.map(({ date, type, desc }) => memoryOn(date, type, desc)), ...own]
    .map((memory, index) => ({ memory, index }))
    .sort((a, b) => a.memory.date - b.memory.date || a.index - b.index)
    .map(({ memory }) => memory)

  return {
    flags: info.flags,
    memories,
    nameKnown: true,
    datingSince: started,
    brokeUpOn: ended
  }
}

/**
 * The choice as the playthrough holds it, or null when it names nobody this playthrough has,
 * somebody who cannot be his romance, or carries a value off the lists.
 */
export function exOf(
  choice: ExChoice | null | undefined,
  characters: Readonly<Record<string, Character | undefined>>,
  chars: readonly string[]
): ExChoice | null {
  if (!choice) return null
  const character = characters[choice.charId]
  if (!character || !chars.includes(choice.charId) || !canBeEx(character)) return null
  if (!EX_TONES.includes(choice.tone) || !EX_ENDERS.includes(choice.endedBy)) return null
  return choice
}

/** How it ended, said once for a block that already names her: `name` is who the sentence names. */
function endingOf(choice: ExChoice, name: string): string {
  if (choice.tone === 'good') {
    const feeling = 'and there were no hard feelings on either side.'
    if (choice.endedBy === 'her') return `${name} ended it, kindly, ${feeling}`
    if (choice.endedBy === 'him') return `The reader ended it, kindly, ${feeling}`
    return `They ended it together, by agreement, ${feeling}`
  }
  if (choice.endedBy === 'her') {
    return `${name} ended it, and it ended badly: there is bad blood between them and the bitterness has not faded.`
  }
  if (choice.endedBy === 'him') {
    return `The reader ended it, and it ended badly: ${name} was hurt, and there is bad blood between them.`
  }
  return 'They agreed to end it, but it ended badly: there is bad blood between them and the bitterness has not faded.'
}

/**
 * The shared story of the reader and his ex: where and when they dated, when it ended and how.
 * It carries no city, no length and no month, so the dates of the exes line stand alone.
 */
export function exOriginOf(character: Character, choice: ExChoice): string {
  const name = character.firstName
  return [
    `${name} and the reader dated back home.`,
    'They were both adults by then: it was after high school, in the years before college.',
    'They broke up the previous summer.',
    endingOf(choice, name)
  ].join(' ')
}

/** The origin as her own block tells it, closed by the line that makes it outrank her sheet. */
export function exOriginForHer(character: Character, choice: ExChoice): string {
  const p = pronounsOf(character.gender)
  return `${exOriginOf(character, choice)} This is how things really were, and it stands over whatever the backstory or the love life say about ${p.possessive} past.`
}

/** The origin as the reader's block tells it. */
export function exOriginForReader(character: Character, choice: ExChoice): string {
  return `${exOriginOf(character, choice)} That is how it really was, whatever else is said about their pasts.`
}

/** The origin for a character's own block, or undefined when she is not the chosen ex. */
export function exOriginIfHer(
  ex: ExChoice | null | undefined,
  character: Character
): string | undefined {
  return ex && ex.charId === character.charId ? exOriginForHer(character, ex) : undefined
}
