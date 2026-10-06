/**
 * One fact, corrected or written on a contact's page: who it is about, its category and kind as
 * selects and its words as a field. Saving files it; a fact already kept can also be taken from
 * her alone or deleted for everybody, each behind a confirmation.
 */
import { useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'

import { FACT_CATEGORY_LABELS, isLastKnower } from '@shared/facts'
import { pronounsOf } from '@shared/pronouns'
import {
  FACT_ABOUT_READER,
  FACT_CATEGORIES,
  type Fact,
  type FactCategory,
  type FactKind
} from '@shared/types'
import { ConfirmModal } from '../components/ConfirmModal'
import { MEMORY_DESC_MAX } from '../components/MemoryRow'
import { TitleTab } from '../components/TitleTab'
import { useModalShell } from '../components/useModalShell'
import { useGameStore } from '../stores/gameStore'
import type { ScreenTheme } from './clockTheme'
import { gestures, lift, panelUnderTab, press, quietLift, quietPress, veilIn } from './motion'
import '../vu_styles/MemoryEdit.css'

export interface EditFactModalProps {
  /** Drawn by the screen that opened this — a portal inherits no palette. */
  theme: ScreenTheme
  /** Whose page it was opened on. */
  charId: string
  /** The fact to correct; absent, the panel writes a new one that she knows. */
  fact?: Fact
  onClose: () => void
}

/** What a fact's kind reads as on its select. */
const KIND_LABELS: Record<FactKind, string> = { happened: 'Happened', said: 'Only said' }

/** The kinds a fact's select offers, in the order it lists them. */
const KINDS: readonly FactKind[] = ['happened', 'said']

/** Which of the two removals is waiting on its confirmation. */
type Removal = 'delete' | 'forget'

export function EditFactModal({
  theme,
  charId,
  fact,
  onClose
}: EditFactModalProps): JSX.Element | null {
  const characters = useGameStore((s) => s.characters)
  const her = characters[charId]
  const [about, setAbout] = useState(fact?.about ?? charId)
  const [category, setCategory] = useState<FactCategory>(fact?.category ?? 'family')
  const [kind, setKind] = useState<FactKind>(fact?.kind ?? 'happened')
  const [text, setText] = useState(fact?.text ?? '')
  const [removal, setRemoval] = useState<Removal | null>(null)
  const { host, overlayProps } = useModalShell(onClose)
  const blank = text.trim() === ''

  if (!host || !her) return null

  const aboutName =
    about === FACT_ABOUT_READER ? 'The reader' : (characters[about]?.firstName ?? her.firstName)
  const p = pronounsOf(her.gender)
  // About her, nobody can make her not know it; and when she is the only one who knows it,
  // taking it from her leaves nobody, so it is deleted.
  const canForget = fact !== undefined && fact.about !== charId
  const forgetDeletes = fact !== undefined && isLastKnower(fact, charId)
  const deleting = removal === 'delete' || forgetDeletes

  function save(): void {
    if (blank) return
    const store = useGameStore.getState()
    if (fact) {
      store.editFact(fact.id, { text, category, kind })
    } else {
      store.addFact({
        about,
        category,
        text,
        kind,
        knownBy: [charId],
        date: store.date,
        time: store.time
      })
    }
    onClose()
  }

  return (
    <>
      {createPortal(
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
            id="edit-fact"
            className="vu-memedit vu-memedit--one vu-paper"
            role="dialog"
            aria-modal="true"
            aria-label={fact ? 'Edit fact' : 'Add fact'}
            variants={panelUnderTab}
            onSubmit={(event) => {
              event.preventDefault()
              save()
            }}
            // The key stops here, so no listener behind the panel answers it as well.
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.stopPropagation()
            }}
          >
            <TitleTab>{fact ? 'Edit fact' : 'Add fact'}</TitleTab>

            <div className="vu-factedit">
              <div className="vu-factedit-pick">
                {fact ? (
                  <span className="vu-factedit-about">{aboutName}</span>
                ) : (
                  <label className="vu-field">
                    <select
                      id="edit-fact-about"
                      className="vu-input vu-select"
                      aria-label="Who the fact is about"
                      value={about}
                      onChange={(e) => setAbout(e.target.value)}
                    >
                      <option value={charId}>{her.firstName}</option>
                      <option value={FACT_ABOUT_READER}>The reader</option>
                    </select>
                  </label>
                )}
                <label className="vu-field">
                  <select
                    id="edit-fact-category"
                    className="vu-input vu-select"
                    aria-label={`What kind of fact this is about ${aboutName}`}
                    value={category}
                    onChange={(e) => {
                      const picked = FACT_CATEGORIES.find((one) => one === e.target.value)
                      if (picked) setCategory(picked)
                    }}
                  >
                    {FACT_CATEGORIES.map((one) => (
                      <option key={one} value={one}>
                        {FACT_CATEGORY_LABELS[one]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="vu-field">
                  <select
                    id="edit-fact-kind"
                    className="vu-input vu-select"
                    aria-label={`Whether what is true of ${aboutName} happened or was only said`}
                    value={kind}
                    onChange={(e) => {
                      const picked = KINDS.find((one) => one === e.target.value)
                      if (picked) setKind(picked)
                    }}
                  >
                    {KINDS.map((one) => (
                      <option key={one} value={one}>
                        {KIND_LABELS[one]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <textarea
                id="edit-fact-text"
                className="vu-input vu-input--multiline vu-factedit-text"
                rows={2}
                aria-label={`What is true of ${aboutName}`}
                value={text}
                maxLength={MEMORY_DESC_MAX}
                autoFocus
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
                onChange={(e) => setText(e.target.value.replace(/[\r\n]+/g, ' '))}
              />

              {fact ? null : (
                <>
                  <p className="vu-field-hint">
                    Where somebody lives, their year, course, job and classes, who is dating whom,
                    exes and milestones are decided by the game, so a fact about them has no effect.
                  </p>
                  <p className="vu-field-hint">
                    {her.firstName} will know it, and so will the reader; nobody else does at first.
                  </p>
                </>
              )}
            </div>

            <div className="vu-foot">
              {fact ? (
                <motion.button
                  id="edit-fact-delete"
                  className="vu-btn vu-btn--quiet"
                  type="button"
                  {...gestures(false, quietLift, quietPress)}
                  onClick={() => setRemoval('delete')}
                >
                  Delete fact
                </motion.button>
              ) : null}
              {canForget ? (
                <motion.button
                  id="edit-fact-forget"
                  className="vu-btn vu-btn--quiet"
                  type="button"
                  {...gestures(false, quietLift, quietPress)}
                  onClick={() => setRemoval('forget')}
                >
                  {p.Subject} doesn&apos;t know this
                </motion.button>
              ) : null}
              <motion.button
                id="edit-fact-cancel"
                className="vu-btn vu-btn--quiet"
                type="button"
                {...gestures(false, quietLift, quietPress)}
                onClick={onClose}
              >
                Cancel
              </motion.button>
              <motion.button
                id="edit-fact-save"
                className="vu-btn vu-btn--primary vu-btn--panel vu-paper"
                type="submit"
                disabled={blank}
                {...gestures(blank, lift, press)}
              >
                Save
              </motion.button>
            </div>
          </motion.form>
        </motion.div>,
        host
      )}

      {/* A sibling of the veil, so the panel is not a parent of what leaves with it. */}
      <AnimatePresence propagate>
        {fact && removal !== null && (
          <ConfirmModal
            key="remove-fact"
            id="remove-fact"
            theme={theme}
            title={deleting ? 'Delete this fact?' : `Remove it from ${her.firstName}?`}
            message={
              removal === 'delete'
                ? 'Nobody will know it any more.'
                : forgetDeletes
                  ? `${her.firstName} is the only one who knows it, so it will be deleted.`
                  : `${her.firstName} will stop knowing it. Everybody else who knows it keeps it.`
            }
            confirmText={deleting ? 'Delete' : 'Remove'}
            // Taken down before the panel goes, so the two do not leave as one exiting child
            // rendered twice under the same key.
            onConfirm={() => {
              const store = useGameStore.getState()
              if (removal === 'delete') store.deleteFact(fact.id)
              else store.forgetFact(fact.id, charId)
              setRemoval(null)
              onClose()
            }}
            onCancel={() => setRemoval(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
