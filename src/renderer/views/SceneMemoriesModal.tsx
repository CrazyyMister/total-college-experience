/**
 * The boundary's question, asked over the curtain once it is down: a row for each memory the
 * ledger filed for somebody in the scene and a blank one for each girl it gave nothing, then the
 * facts the scene showed and who came to know one already kept, every row an editable sentence.
 * Every value is already an answer, so a dismissal commits as Save does.
 */
import { useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'

import { FACT_CATEGORY_LABELS } from '@shared/facts'
import {
  FACT_ABOUT_READER,
  FACT_CATEGORIES,
  type Fact,
  type FactKind
} from '@shared/types'
import { CheckField } from '../components/CheckField'
import { MemoryRow, MEMORY_DESC_MAX } from '../components/MemoryRow'
import { useModalShell } from '../components/useModalShell'
import { TitleTab } from '../components/TitleTab'
import { factSentence } from '../prompts/facts'
import { profileUrl, useSpriteVersion } from '../stores/characterStore'
import { UNKNOWN_NAME, useGameStore } from '../stores/gameStore'
import type { FactAnswer, MemoryAnswer, SceneAnswer, SceneReview } from '../stores/loop/memoryEdit'
import type { ScreenTheme } from './clockTheme'
import { gestures, lift, panelUnderTab, press, veilIn } from './motion'
import '../vu_styles/MemoryEdit.css'

export interface SceneMemoriesModalProps {
  /** The finished slot's half, the curtain's own colour — a portal inherits no palette. */
  theme: ScreenTheme
  /** The question's rows, in the order the answers are handed back. */
  review: SceneReview
  /** The one answer: Save, Escape and a click on the dimming alike. */
  onSave: (answer: SceneAnswer) => void
}

/** What a fact's kind reads as on its row. */
const KIND_LABELS: Record<FactKind, string> = { happened: 'Happened', said: 'Only said' }

/** The kinds a fact's select offers, in the order it lists them. */
const KINDS: readonly FactKind[] = ['happened', 'said']

interface KnowerProps {
  id: string
  charId: string
  name: string
  checked: boolean
  /** The person the fact is about always knows it. */
  locked: boolean
  onChange: (checked: boolean) => void
}

/** One person of the scene on a fact's list of who knows it: her face and a box. */
function Knower({ id, charId, name, checked, locked, onChange }: KnowerProps): JSX.Element {
  const version = useSpriteVersion(charId)
  return (
    <span className="vu-factrow-knower">
      <span className="vu-arch vu-factrow-knower-face">
        <span className="vu-crop">
          <img className="vu-crop-img" src={profileUrl(charId, version)} alt="" />
        </span>
      </span>
      <CheckField id={id} label={name} checked={checked} disabled={locked} onChange={onChange} />
    </span>
  )
}

interface FactRowProps {
  index: number
  fact: Fact
  draft: FactAnswer
  /** Everybody in the scene, who may know the fact. */
  cast: readonly string[]
  nameOf: (charId: string) => string
  onChange: (change: Partial<FactAnswer>) => void
}

/**
 * One new fact: who it is about, its category and kind as selects, its words as a field and who
 * knows it as a row of boxes. A fact only said wears a sticker over its edge.
 */
function FactRow({ index, fact, draft, cast, nameOf, onChange }: FactRowProps): JSX.Element {
  const aboutReader = fact.about === FACT_ABOUT_READER
  const version = useSpriteVersion(aboutReader ? null : fact.about)
  const name = aboutReader ? 'The reader' : nameOf(fact.about)
  return (
    <div className="vu-row vu-factrow">
      {draft.kind === 'said' ? (
        <span className="vu-sticker vu-memrow-sticker">Only said</span>
      ) : null}
      {aboutReader ? (
        <span className="vu-factrow-face" aria-hidden="true" />
      ) : (
        <span className="vu-arch vu-memrow-face vu-factrow-face">
          <span className="vu-crop">
            <img className="vu-crop-img" src={profileUrl(fact.about, version)} alt="" />
          </span>
        </span>
      )}
      <span className="vu-memrow-name">{name}</span>
      <span className="vu-factrow-pick">
        <label className="vu-field">
          <select
            id={`fact-${index}-category`}
            className="vu-input vu-select"
            aria-label={`What kind of fact this is about ${name}`}
            value={draft.category}
            onChange={(e) => {
              const picked = FACT_CATEGORIES.find((category) => category === e.target.value)
              if (picked) onChange({ category: picked })
            }}
          >
            {FACT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {FACT_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </label>
        <label className="vu-field">
          <select
            id={`fact-${index}-kind`}
            className="vu-input vu-select"
            aria-label={`Whether what is true of ${name} happened or was only said`}
            value={draft.kind}
            onChange={(e) => {
              const picked = KINDS.find((kind) => kind === e.target.value)
              if (picked) onChange({ kind: picked })
            }}
          >
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
      </span>
      <textarea
        id={`fact-${index}-text`}
        className="vu-input vu-input--multiline vu-factrow-text"
        rows={2}
        aria-label={`What is true of ${name}`}
        value={draft.text}
        maxLength={MEMORY_DESC_MAX}
        onFocus={(e) => {
          const end = e.currentTarget.value.length
          e.currentTarget.setSelectionRange(end, end)
        }}
        // A fact is one phrase, so Enter files it as the form's own submit.
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.form?.requestSubmit()
          }
        }}
        onChange={(e) => onChange({ text: e.target.value.replace(/[\r\n]+/g, ' ') })}
      />
      <span className="vu-factrow-knows">
        <span className="vu-factrow-knows-label">Knows it</span>
        {cast.map((charId) => (
          <Knower
            key={charId}
            id={`fact-${index}-knows-${charId}`}
            charId={charId}
            name={nameOf(charId)}
            checked={draft.knownBy.includes(charId)}
            locked={charId === fact.about}
            onChange={(checked) =>
              onChange({
                knownBy: checked
                  ? [...draft.knownBy, charId]
                  : draft.knownBy.filter((one) => one !== charId)
              })
            }
          />
        ))}
      </span>
    </div>
  )
}

export function SceneMemoriesModal({
  theme,
  review,
  onSave
}: SceneMemoriesModalProps): JSX.Element | null {
  const characters = useGameStore((s) => s.characters)
  const charInfo = useGameStore((s) => s.charInfo)
  const filed = useGameStore((s) => s.facts)
  const sceneCast = useGameStore((s) => s.cast)
  const cast = sceneCast.filter((charId) => characters[charId])
  const rows = review.memories
  // Each row opens on the memory the ledger filed, or on a blank sentence where it filed none.
  const [drafts, setDrafts] = useState<MemoryAnswer[]>(() =>
    rows.map((row) => ({ type: row.applied?.type ?? 'liked', desc: row.applied?.desc ?? '' }))
  )
  // Each fact opens as it will be filed, and each learned row ticked.
  const [factDrafts, setFactDrafts] = useState<FactAnswer[]>(() =>
    review.facts.map((fact) => ({
      text: fact.text,
      category: fact.category,
      kind: fact.kind,
      knownBy: [...fact.knownBy]
    }))
  )
  const [learned, setLearned] = useState<boolean[]>(() => review.learned.map(() => true))
  const answer = (): SceneAnswer => ({ memories: drafts, facts: factDrafts, learned })
  // The shell reads its close at the moment it fires, so a dismissal commits the latest drafts.
  const { host, overlayProps } = useModalShell(() => onSave(answer()))

  /** Writes one row's verb or words, leaving the others as they stand. */
  function edit(index: number, change: Partial<MemoryAnswer>): void {
    setDrafts((was) => was.map((draft, at) => (at === index ? { ...draft, ...change } : draft)))
  }

  /** Writes one fact's words, category, kind or who knows, leaving the others as they stand. */
  function editFact(index: number, change: Partial<FactAnswer>): void {
    setFactDrafts((was) => was.map((draft, at) => (at === index ? { ...draft, ...change } : draft)))
  }

  /** A person as the reader may read the name: masked while he has not learned it. */
  function nameOf(charId: string): string {
    return charInfo[charId]?.nameKnown
      ? (characters[charId]?.firstName ?? UNKNOWN_NAME)
      : UNKNOWN_NAME
  }

  if (!host) return null

  return createPortal(
    <motion.div
      className="vu-veil"
      data-theme={theme}
      variants={veilIn}
      initial="hidden"
      animate="shown"
      exit="gone"
      {...overlayProps}
    >
      <motion.form
        id="scene-memories"
        className="vu-memedit vu-paper"
        role="dialog"
        aria-modal="true"
        aria-label="Edit memories?"
        variants={panelUnderTab}
        // A form, so Enter in any field is the answer the foot gives.
        onSubmit={(event) => {
          event.preventDefault()
          onSave(answer())
        }}
        // And the screen behind this never sees that key.
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.stopPropagation()
        }}
      >
        <TitleTab>Edit memories?</TitleTab>

        <p className="vu-note-text">
          Add anything else the characters should remember after this scene. Keep it short and
          include only important things to avoid context bloat, since this is injected in every
          scene the character is in. Use past-tense and refer to yourself as “the reader”.
        </p>

        <div className="vu-scroll-box">
          <div className="vu-memedit-rows">
            {rows.map((row, index) => {
              const draft = drafts[index]
              return (
                <MemoryRow
                  key={`${row.charId}-${index}`}
                  id={`memedit-${row.charId}-${index}`}
                  name={nameOf(row.charId)}
                  faceOf={row.charId}
                  type={draft.type}
                  desc={draft.desc}
                  onType={(type) => edit(index, { type })}
                  onDesc={(desc) => edit(index, { desc })}
                  mark={row.applied?.mark}
                  autoFocus={index === 0}
                />
              )
            })}
            {review.facts.length > 0 ? (
              <>
                <p className="vu-memedit-head">Facts</p>
                <p className="vu-field-hint">
                  What the scene showed that will still be true later. Clear the words to drop
                  one, and tick who knows it.
                </p>
                {review.facts.map((fact, index) => (
                  <FactRow
                    key={fact.id}
                    index={index}
                    fact={fact}
                    draft={factDrafts[index]}
                    cast={cast}
                    nameOf={nameOf}
                    onChange={(change) => editFact(index, change)}
                  />
                ))}
              </>
            ) : null}
            {review.learned.length > 0 ? (
              <>
                <p className="vu-memedit-head">Now know</p>
                <p className="vu-field-hint">
                  Facts told in this scene to somebody who did not know them. Untick one to take
                  it back.
                </p>
                {review.learned.map((row, index) => {
                  const fact = filed.find((one) => one.id === row.factId)
                  const sentence = fact ? (factSentence(fact, characters) ?? '') : ''
                  return (
                    <div key={`${row.factId}-${row.charId}`} className="vu-row vu-learnedrow">
                      <CheckField
                        id={`learned-${index}`}
                        label={`${nameOf(row.charId)} now knows`}
                        checked={learned[index] !== false}
                        onChange={(checked) =>
                          setLearned((was) => was.map((one, at) => (at === index ? checked : one)))
                        }
                      />
                      <span className="vu-learnedrow-text">
                        {sentence}
                        {fact?.kind === 'said' ? ' (only said)' : ''}
                      </span>
                    </div>
                  )
                })}
              </>
            ) : null}
          </div>
          <div className="vu-scroll-fade" />
        </div>

        {/* Every row is already an answer, so the foot carries one and no cancel. */}
        <div className="vu-foot">
          <motion.button
            id="scene-memories-save"
            className="vu-btn vu-btn--primary vu-btn--panel vu-paper"
            type="submit"
            {...gestures(false, lift, press)}
          >
            Save
          </motion.button>
        </div>
      </motion.form>
    </motion.div>,
    host
  )
}
