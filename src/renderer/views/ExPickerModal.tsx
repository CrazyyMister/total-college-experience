/**
 * New Game's ex: which of the roster's girls who can be his romance he starts the game with
 * as an ex, how it felt and who ended it. What her sheet says of her love life and her past is
 * shown to be read, never edited; the game ignores her dating history in this game.
 */
import { useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { canBeEx } from '@shared/exGirlfriend'
import { EX_ENDERS, EX_TONES, type Character, type ExChoice, type ExEnder, type ExTone } from '@shared/types'

import { SelectField } from '../components/SelectField'
import { TitleTab } from '../components/TitleTab'
import { useModalShell } from '../components/useModalShell'
import type { ScreenTheme } from './clockTheme'
import {
  dealt,
  gestures,
  lift,
  panelUnderTab,
  press,
  quietLift,
  quietPress,
  veilIn
} from './motion'
import { PickFace } from './PickFace'
import '../vu_styles/Gift.css'
import '../vu_styles/CharacterPanel.css'
import '../vu_styles/NewGame.css'

/** The faces arrive with the panel — nothing here resizes. */
const FACE_DEAL = dealt(0, 0.04)

const TONE_LABELS: Record<ExTone, string> = {
  good: 'Good terms: no bitterness',
  bad: 'Bad terms: bitterness'
}

const ENDER_LABELS: Record<ExEnder, string> = {
  her: 'She ended it',
  him: 'The reader ended it',
  both: 'They ended it together'
}

export interface ExPickerModalProps {
  /** Drawn by the screen that opened this — a portal inherits no palette. */
  theme: ScreenTheme
  roster: readonly Character[]
  /** The ex already chosen, which the panel opens on. */
  current: ExChoice | null
  /** The answer: a choice, or null for no ex. */
  onConfirm: (choice: ExChoice | null) => void
  onClose: () => void
}

/** One written value of her sheet, with its label; nothing at all where she wrote none. */
function Reading({ label, value }: { label: string; value: string }): JSX.Element | null {
  if (!value.trim()) return null
  return (
    <div className="vu-field">
      <span className="vu-field-label">{label}</span>
      <p className="vu-view-prose">{value}</p>
    </div>
  )
}

export function ExPickerModal({
  theme,
  roster,
  current,
  onConfirm,
  onClose
}: ExPickerModalProps): JSX.Element | null {
  const candidates = roster.filter(canBeEx)
  const [picked, setPicked] = useState<string | null>(current?.charId ?? null)
  const [tone, setTone] = useState<ExTone>(current?.tone ?? 'good')
  const [endedBy, setEndedBy] = useState<ExEnder>(current?.endedBy ?? 'her')
  const { host, overlayProps } = useModalShell(onClose)

  if (!host) return null

  const character = candidates.find((c) => c.charId === picked)

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
        id="new-game-ex"
        className="vu-giftsay vu-newgame-ex-panel vu-paper"
        role="dialog"
        aria-modal="true"
        aria-label="Ex-girlfriend"
        variants={panelUnderTab}
        onSubmit={(event) => {
          event.preventDefault()
          if (character) onConfirm({ charId: character.charId, tone, endedBy })
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.stopPropagation()
        }}
      >
        <TitleTab>Ex-girlfriend</TitleTab>

        <div className="vu-scroll-box">
          <div className="vu-newgame-ex-body">
            <motion.div className="vu-giftto-row" variants={FACE_DEAL}>
              {candidates.map((candidate) => (
                <PickFace
                  key={candidate.charId}
                  charId={candidate.charId}
                  name={candidate.firstName}
                  on={picked === candidate.charId}
                  onPick={() => setPicked(candidate.charId)}
                />
              ))}
            </motion.div>

            {character && (
              <>
                <div className="vu-newgame-ex-read">
                  <Reading
                    label="Dating history (not used in this game)"
                    value={character.datingHistory}
                  />
                  <Reading label="Backstory" value={character.backstory} />
                </div>
                <SelectField
                  id="new-game-ex-tone"
                  label="How it ended"
                  value={tone}
                  onChange={(value) => setTone(value as ExTone)}
                  options={EX_TONES.map((value) => ({ value, label: TONE_LABELS[value] }))}
                />
                <SelectField
                  id="new-game-ex-ender"
                  label="Who ended it"
                  value={endedBy}
                  onChange={(value) => setEndedBy(value as ExEnder)}
                  options={EX_ENDERS.map((value) => ({ value, label: ENDER_LABELS[value] }))}
                />
              </>
            )}
          </div>
          <div className="vu-scroll-fade" />
        </div>

        <div className="vu-foot">
          <motion.button
            id="new-game-ex-cancel"
            className="vu-btn vu-btn--quiet"
            type="button"
            {...gestures(false, quietLift, quietPress)}
            onClick={onClose}
          >
            Cancel
          </motion.button>
          {current && (
            <motion.button
              id="new-game-ex-none"
              className="vu-btn vu-btn--quiet"
              type="button"
              {...gestures(false, quietLift, quietPress)}
              onClick={() => onConfirm(null)}
            >
              No ex
            </motion.button>
          )}
          <motion.button
            id="new-game-ex-save"
            className="vu-btn vu-btn--primary vu-btn--panel vu-paper"
            type="submit"
            disabled={!character}
            {...gestures(!character, lift, press)}
          >
            Save
          </motion.button>
        </div>
      </motion.form>
    </motion.div>,
    host
  )
}
