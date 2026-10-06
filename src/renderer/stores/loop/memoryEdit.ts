import type { FactLearned } from '@shared/facts'
import { storedMemoryDesc } from '@shared/readerVoice'
import {
  FACT_ABOUT_READER,
  memoryAt,
  type CharMemory,
  type Fact,
  type FactCategory,
  type FactKind,
  type MemoryMark,
  type MemoryMoment,
  type MemoryType
} from '@shared/types'

/**
 * The boundary's question as data — its rows off the ledger and the facts call, and what the
 * answers change.
 */

/** One row of the question: who, and the memory the ledger filed that the row stands for. */
export interface MemoryEditRow {
  charId: string
  applied: CharMemory | null
}

/** What the player left in a row: the verb and the words as typed. */
export interface MemoryAnswer {
  type: MemoryType
  desc: string
}

/** One change the answers make: rewrite or drop `match`, or record `next` where there was nothing. */
export interface MemoryEdit {
  charId: string
  match: CharMemory | null
  next: CharMemory | null
}

/**
 * One row per distinct memory the ledger filed for each girl in the cast, in cast order, or a
 * blank row for a girl it filed nothing for; a filed girl outside the cast follows at the end.
 */
export function memoryEditRows(
  cast: readonly string[],
  filed: readonly { charId: string; type: MemoryType; desc: string; mark?: MemoryMark }[],
  when: MemoryMoment
): MemoryEditRow[] {
  const rows: MemoryEditRow[] = []
  const seen = new Set<string>()
  // Her rows: each distinct verb and wording the ledger filed for her, or one blank row.
  const rowsFor = (charId: string): void => {
    let any = false
    for (const entry of filed) {
      if (entry.charId !== charId) continue
      any = true
      const key = JSON.stringify([charId, entry.type, entry.desc, entry.mark ?? null])
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({ charId, applied: memoryAt(when, entry.type, entry.desc, entry.mark) })
    }
    if (!any) rows.push({ charId, applied: null })
  }
  const named = new Set<string>()
  for (const charId of cast) {
    if (named.has(charId)) continue
    named.add(charId)
    rowsFor(charId)
  }
  for (const { charId } of filed) {
    if (named.has(charId)) continue
    named.add(charId)
    rowsFor(charId)
  }
  return rows
}

/**
 * The edits the answers make, `answers[i]` answering `rows[i]`: a filed memory blanked is
 * dropped, changed is rewritten on its own day and half of the day, and a blank row filled is
 * recorded at `when`.
 */
export function memoryEditsOf(
  rows: readonly MemoryEditRow[],
  answers: readonly MemoryAnswer[],
  when: MemoryMoment
): MemoryEdit[] {
  const edits: MemoryEdit[] = []
  rows.forEach(({ charId, applied }, index) => {
    const answer = answers[index]
    if (!answer) return
    const desc = storedMemoryDesc(answer.desc)
    if (applied) {
      if (!desc) {
        edits.push({ charId, match: applied, next: null })
      } else if (answer.type !== applied.type || desc !== applied.desc) {
        const next: CharMemory = { ...applied, type: answer.type, desc }
        edits.push({ charId, match: applied, next })
      }
    } else if (desc) {
      edits.push({ charId, match: null, next: memoryAt(when, answer.type, desc) })
    }
  })
  return edits
}

/** What the boundary asks: the memories, the facts proposed for the scene, and who learned one. */
export interface SceneReview {
  memories: MemoryEditRow[]
  /** The new facts, each as it will be filed unless the player changes it. */
  facts: Fact[]
  learned: FactLearned[]
}

/** What the player left on a fact: its words, kind and who knows. A blank text drops the fact. */
export interface FactAnswer {
  text: string
  category: FactCategory
  kind: FactKind
  knownBy: string[]
}

/** The question's one answer, each list answering the same list of the review. */
export interface SceneAnswer {
  memories: MemoryAnswer[]
  facts: FactAnswer[]
  /** Whether each learned row is kept. */
  learned: boolean[]
}

/** Whether the review has anything to ask. */
export function reviewAsks(review: SceneReview): boolean {
  return review.memories.length > 0 || review.facts.length > 0 || review.learned.length > 0
}

/**
 * The facts the answers leave: a fact with no words is dropped, and the rest are as the player
 * left them, known to the person they are about and to whoever of `cast` is ticked.
 */
export function factsOfAnswers(
  rows: readonly Fact[],
  answers: readonly FactAnswer[],
  cast: readonly string[]
): Fact[] {
  const kept: Fact[] = []
  rows.forEach((fact, index) => {
    const answer = answers[index]
    if (!answer) return
    const text = storedMemoryDesc(answer.text).replace(/\s+/g, ' ')
    if (!text) return
    const heard = cast.filter((charId) => answer.knownBy.includes(charId))
    const knownBy =
      fact.about === FACT_ABOUT_READER || heard.includes(fact.about) ? heard : [fact.about, ...heard]
    kept.push({ ...fact, text, category: answer.category, kind: answer.kind, knownBy })
  })
  return kept
}

/** The learned rows the player left ticked. */
export function learnedOfAnswers(
  rows: readonly FactLearned[],
  kept: readonly boolean[]
): FactLearned[] {
  return rows.filter((_, index) => kept[index] !== false)
}
