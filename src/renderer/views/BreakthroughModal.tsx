/**
 * Spending a Breakthrough: who it is for, where a scene holds more than one character who is
 * full, and the direction the reader wants the scene to take for her — a required field, since
 * the instruction is empty without it. The box under the scene stays the turn's own action.
 */
import { useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'

import { useModalShell } from '../components/useModalShell'
import { TextField } from '../components/TextField'
import { TitleTab } from '../components/TitleTab'
import { useGameStore } from '../stores/gameStore'
import type { ScreenTheme } from './clockTheme'
import { PickFace } from './PickFace'
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
import '../vu_styles/Gift.css'

/** The faces arrive with the panel — nothing here resizes. */
const FACE_DEAL = dealt(0, 0.04)

export interface BreakthroughModalProps {
  /** Drawn by the screen that opened this — a portal inherits no palette. */
  theme: ScreenTheme
  /** Who is full and standing in the scene, by charId; the Game View has already dropped anyone unnamed. */
  charIds: readonly string[]
  onSend: (charId: string, direction: string) => void
  onClose: () => void
}

export function BreakthroughModal({
  theme,
  charIds,
  onSend,
  onClose
}: BreakthroughModalProps): JSX.Element | null {
  const characters = useGameStore((s) => s.characters)
  const [picked, setPicked] = useState<string | null>(charIds.length === 1 ? charIds[0] : null)
  const [direction, setDirection] = useState('')
  const { host, overlayProps } = useModalShell(onClose)

  if (!host) return null

  const said = direction.trim()
  const dead = picked === null || !said
  const name = picked ? characters[picked]?.firstName : undefined

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
        id="breakthrough"
        className="vu-giftsay vu-paper"
        role="dialog"
        aria-modal="true"
        aria-label="Breakthrough"
        variants={panelUnderTab}
        onSubmit={(event) => {
          event.preventDefault()
          if (picked !== null && said) onSend(picked, said)
        }}
        // The window-level Enter advances a line, and one answered here is not also answered there.
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.stopPropagation()
        }}
      >
        <TitleTab>Breakthrough</TitleTab>

        {charIds.length > 1 && (
          <motion.div className="vu-giftto-row" variants={FACE_DEAL}>
            {charIds.map((charId) => (
              <PickFace
                key={charId}
                charId={charId}
                name={characters[charId]?.firstName ?? charId}
                on={picked === charId}
                onPick={() => setPicked(charId)}
              />
            ))}
          </motion.div>
        )}

        <TextField
          id="breakthrough-direction"
          label="Direction"
          hint={
            name
              ? `What do you want this moment to do for ${name}?`
              : 'What do you want this moment to do?'
          }
          value={direction}
          onChange={setDirection}
          maxLength={200}
          autoFocus
        />

        <div className="vu-foot">
          <motion.button
            id="breakthrough-cancel"
            className="vu-btn vu-btn--quiet"
            type="button"
            {...gestures(false, quietLift, quietPress)}
            onClick={onClose}
          >
            Cancel
          </motion.button>
          <motion.button
            id="breakthrough-send"
            className="vu-btn vu-btn--primary vu-btn--panel vu-paper"
            type="submit"
            disabled={dead}
            {...gestures(dead, lift, press)}
          >
            Use Breakthrough
          </motion.button>
        </div>
      </motion.form>
    </motion.div>,
    host
  )
}
