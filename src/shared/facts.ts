import { storedMemoryDesc } from './readerVoice'
import {
  FACT_ABOUT_READER,
  FACT_CATEGORIES,
  type Fact,
  type FactCategory,
  type FactsReply,
  type TimeSlot
} from './types'

/** The most new facts one scene may file. */
export const FACT_CAP = 4

/** How many of a character's facts her scene block carries, by how many are in the scene. */
export function factCapFor(castSize: number): number {
  return castSize >= 3 ? 10 : castSize === 2 ? 20 : 30
}

/** How many of her facts a conversation on the phone carries. */
export const PHONE_FACT_CAP = 20

/** What each category reads as on screen. */
export const FACT_CATEGORY_LABELS: Record<FactCategory, string> = {
  family: 'Family',
  past: 'Past',
  tastes_habits: 'Tastes and habits',
  plans_promises: 'Plans and promises',
  secrets: 'Secrets',
  about_reader: 'About the reader'
}

/** The id of the fact at `position` in the list a scene filed on that day and half of the day. */
export function factIdOf(date: number, time: TimeSlot, position: number): string {
  return `d${date}t${time}n${position}`
}

/**
 * The facts `charId` knows, oldest first by the slot they were filed in and then in the order
 * they were kept; only the newest `limit` of them.
 */
export function factsKnownBy(
  charId: string,
  facts: readonly Fact[] | undefined,
  limit = Infinity
): Fact[] {
  const known = (facts ?? [])
    .filter((fact) => fact.knownBy.includes(charId))
    .sort((a, b) => a.date - b.date || a.time - b.time)
  return limit < known.length ? known.slice(known.length - limit) : known
}

/** A fact's words as two facts are compared: letters and digits alone, in lower case. */
function sameWordsKey(about: string, text: string): string {
  return `${about}|${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`
}

/**
 * A fact's words as filed: in the reader's voice, opening lower-case, with no subject in front
 * of the verb and no full stop behind it.
 */
export function factText(raw: string, subjectNames: readonly string[]): string {
  const names = ['the reader', ...subjectNames]
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  return storedMemoryDesc(raw)
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '')
    .replace(new RegExp(`^(?:${names})\\s+`, 'i'), '')
    .replace(/^that\s+/i, '')
    .replace(/^[A-Z](?=[a-z])/, (letter) => letter.toLowerCase())
}

/** What the game holds, as the check against a facts reply reads it. */
export interface FactsCheckInput {
  date: number
  time: TimeSlot
  /** The charIds in the scene. */
  cast: readonly string[]
  charIdOf: (charKey: string) => string | undefined
  nameKnown: (charId: string) => boolean
  firstNameOf: (charId: string) => string | undefined
  /** The facts already on the save. */
  existing: readonly Fact[] | undefined
  /** Who took in the scene's summary; who is told a fact about the reader when none is named. */
  saw: readonly string[]
  warn?: (message: string) => void
}

/** One character coming to know a fact the save already holds. */
export interface FactLearned {
  factId: string
  charId: string
}

/** What survives the check: the facts to propose and who may be shown as having learned one. */
export interface CheckedFacts {
  facts: Fact[]
  learned: FactLearned[]
}

/**
 * The facts reply held to the scene. A fact about nobody the save holds, about somebody not in
 * the scene or whose name the reader does not know, in a category off the list, with no words,
 * or the same as one already filed or one earlier in the reply is dropped, and so is whatever is
 * past {@link FACT_CAP}. Who knows is the subject and whoever the reply named who was in the
 * scene; with none named a fact about the reader is known to who took in the summary. A
 * learned row for a fact that does not exist, for somebody not in the scene who already knows
 * it, or that nobody in the scene knew to tell is dropped. Every drop is a warning, never an error.
 */
export function checkFacts(
  reply: FactsReply | null | undefined,
  input: FactsCheckInput
): CheckedFacts {
  const { cast, existing = [], warn } = input
  const facts: Fact[] = []
  const seen = new Set<string>()
  const rows = Array.isArray(reply?.facts) ? reply.facts : []
  const learnedRows = Array.isArray(reply?.learned) ? reply.learned : []
  let beyondCap = 0

  for (const row of rows) {
    const about = row?.about === FACT_ABOUT_READER ? FACT_ABOUT_READER : input.charIdOf(row?.about ?? '')
    if (!about) {
      warn?.(`[facts] fact about unknown "${String(row?.about)}" — dropping it.`)
      continue
    }
    if (about !== FACT_ABOUT_READER) {
      if (!cast.includes(about)) {
        warn?.(`[facts] fact about "${row.about}", who is not in the scene — dropping it.`)
        continue
      }
      if (!input.nameKnown(about)) {
        warn?.(`[facts] fact about "${row.about}", whose name the reader does not know — dropping it.`)
        continue
      }
    }
    if (!FACT_CATEGORIES.includes(row.category)) {
      warn?.(`[facts] category "${String(row.category)}" is not valid — dropping the fact.`)
      continue
    }
    const subjectName = about === FACT_ABOUT_READER ? undefined : input.firstNameOf(about)
    const text = typeof row.text === 'string' ? factText(row.text, subjectName ? [subjectName] : []) : ''
    if (!text) {
      warn?.('[facts] fact has no words — dropping it.')
      continue
    }
    const id = factIdOf(input.date, input.time, facts.length)
    const key = sameWordsKey(about, text)
    if (seen.has(key) || existing.some((fact) => fact.id !== id && sameWordsKey(fact.about, fact.text) === key)) {
      warn?.(`[facts] "${text}" is already a fact — dropping it.`)
      continue
    }
    if (facts.length >= FACT_CAP) {
      beyondCap += 1
      continue
    }
    seen.add(key)

    const named: string[] = []
    for (const charKey of Array.isArray(row.heardBy) ? row.heardBy : []) {
      const charId = input.charIdOf(charKey ?? '')
      if (!charId || !cast.includes(charId)) {
        warn?.(`[facts] "${String(charKey)}" heard a fact but was not in the scene — leaving them out.`)
        continue
      }
      if (!named.includes(charId)) named.push(charId)
    }
    const heard =
      named.length > 0 ? named : about === FACT_ABOUT_READER ? cast.filter((id) => input.saw.includes(id)) : []
    const knownBy = about === FACT_ABOUT_READER || heard.includes(about) ? heard : [about, ...heard]
    facts.push({
      id,
      about,
      category: row.category,
      text,
      // Anything not plainly marked as having happened is only what was said.
      kind: row.said === false ? 'happened' : 'said',
      knownBy,
      date: input.date,
      time: input.time
    })
  }
  if (beyondCap > 0) {
    warn?.(`[facts] ${beyondCap} more than ${FACT_CAP} new facts — dropping the rest.`)
  }

  const learned: FactLearned[] = []
  const told = new Set<string>()
  for (const row of learnedRows) {
    const fact = existing.find((one) => one.id === row?.fact)
    if (!fact) {
      warn?.(`[facts] "${String(row?.fact)}" is not a fact on the save — dropping the learned row.`)
      continue
    }
    const charId = input.charIdOf(row.charKey ?? '')
    if (!charId || !cast.includes(charId)) {
      warn?.(`[facts] "${String(row.charKey)}" learned a fact but was not in the scene — dropping it.`)
      continue
    }
    if (fact.knownBy.includes(charId)) {
      warn?.(`[facts] "${row.charKey}" already knew ${fact.id} — dropping the learned row.`)
      continue
    }
    if (!fact.knownBy.some((knower) => cast.includes(knower))) {
      warn?.(`[facts] nobody in the scene knew ${fact.id} to tell it — dropping the learned row.`)
      continue
    }
    const key = `${fact.id}|${charId}`
    if (told.has(key)) continue
    told.add(key)
    learned.push({ factId: fact.id, charId })
  }
  return { facts, learned }
}

/**
 * The facts with `added` filed and each learned row applied, or null where that changes
 * nothing. A fact filed under an id already there replaces it, so a boundary run twice files
 * each once.
 */
export function withFactsFiled(
  facts: readonly Fact[] | undefined,
  added: readonly Fact[],
  learned: readonly FactLearned[]
): Fact[] | null {
  const next = [...(facts ?? [])]
  let changed = false
  for (const fact of added) {
    const at = next.findIndex((one) => one.id === fact.id)
    if (at === -1) {
      next.push(fact)
      changed = true
    } else if (JSON.stringify(next[at]) !== JSON.stringify(fact)) {
      next[at] = fact
      changed = true
    }
  }
  for (const { factId, charId } of learned) {
    const at = next.findIndex((one) => one.id === factId)
    if (at === -1 || next[at].knownBy.includes(charId)) continue
    next[at] = { ...next[at], knownBy: [...next[at].knownBy, charId] }
    changed = true
  }
  return changed ? next : null
}
