/**
 * One finished scene as it is kept for the people who were in it: its recap as a field, which is
 * the same text for everybody there and the calendar, and a way to take her out of it. Saving
 * writes the recap; taking her out asks first and keeps the text for the rest.
 */
import { useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'

import type { Encounter, TimeSlot } from '@shared/types'
import { ConfirmModal } from '../components/ConfirmModal'
import { TitleTab } from '../components/TitleTab'
import { useModalShell } from '../components/useModalShell'
import { formatChatDivider } from '../prompts/gameDate'
import { placeOf } from '../prompts/encounters'
import { useGameStore } from '../stores/gameStore'
import type { ScreenTheme } from './clockTheme'
import { gestures, lift, panelUnderTab, press, quietLift, quietPress, veilIn } from './motion'
import '../vu_styles/MemoryEdit.css'

export interface EditEncounterModalProps {
  /** Drawn by the screen that opened this — a portal inherits no palette. */
  theme: ScreenTheme
  /** Whose page it was opened on. */
  charId: string
  /** Her first name. */
  name: string
  date: number
  time: TimeSlot
  encounter: Encounter
  onClose: () => void
}

export function EditEncounterModal({
  theme,
  charId,
  name,
  date,
  time,
  encounter,
  onClose
}: EditEncounterModalProps): JSX.Element | null {
  // Opens on the recap exactly as it is kept, whatever its length.
  const [text, setText] = useState(encounter.summary)
  const [removing, setRemoving] = useState(false)
  const { host, overlayProps } = useModalShell(onClose)
  const blank = text.trim() === ''

  if (!host) return null

  const head = [
    formatChatDivider(date, time),
    ...(encounter.where ? [placeOf(encounter.where)] : [])
  ]

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
            id="edit-encounter"
            className="vu-memedit vu-memedit--one vu-paper"
            role="dialog"
            aria-modal="true"
            aria-label="Edit encounter"
            variants={panelUnderTab}
            onSubmit={(event) => {
              event.preventDefault()
              if (blank) return
              useGameStore.getState().editEncounterText(date, time, text)
              onClose()
            }}
            // The key stops here, so no listener behind the panel answers it as well.
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.stopPropagation()
            }}
          >
            <TitleTab>Edit encounter</TitleTab>

            <div className="vu-factedit">
              <p className="vu-memedit-head">{head.join(' · ')}</p>
              <textarea
                id="edit-encounter-text"
                className="vu-input vu-input--multiline vu-factedit-text vu-factedit-text--recap"
                aria-label="What the scene came to"
                value={text}
                autoFocus
                onFocus={(e) => {
                  const end = e.currentTarget.value.length
                  e.currentTarget.setSelectionRange(end, end)
                }}
                // A recap is one paragraph, so Enter files it as the form's own submit.
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
                onChange={(e) => setText(e.target.value.replace(/[\r\n]+/g, ' '))}
              />
              <p className="vu-field-hint">
                This is the scene&apos;s recap for everybody who was there and for the calendar, so
                a change here reaches them all. Write it in the third person, as “the reader”.
              </p>
            </div>

            <div className="vu-foot">
              <motion.button
                id="edit-encounter-remove"
                className="vu-btn vu-btn--quiet"
                type="button"
                {...gestures(false, quietLift, quietPress)}
                onClick={() => setRemoving(true)}
              >
                Remove from this encounter
              </motion.button>
              <motion.button
                id="edit-encounter-cancel"
                className="vu-btn vu-btn--quiet"
                type="button"
                {...gestures(false, quietLift, quietPress)}
                onClick={onClose}
              >
                Cancel
              </motion.button>
              <motion.button
                id="edit-encounter-save"
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
        {removing && (
          <ConfirmModal
            key="remove-encounter"
            id="remove-encounter"
            theme={theme}
            title={`Remove ${name} from this encounter?`}
            message={`${name} will no longer remember it. Everybody else who was there keeps it, and the calendar still shows what happened.`}
            confirmText="Remove"
            // Taken down before the panel goes, so the two do not leave as one exiting child
            // rendered twice under the same key.
            onConfirm={() => {
              useGameStore.getState().leaveEncounter(charId, date, time)
              setRemoving(false)
              onClose()
            }}
            onCancel={() => setRemoving(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
