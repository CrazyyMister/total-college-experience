import { useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { useModalShell } from '../components/useModalShell'
import { TitleTab } from '../components/TitleTab'
import { useUiStore } from '../stores/uiStore'
import {
  gestures,
  lift,
  panelUnderTab,
  press,
  quietLift,
  quietPress,
  veilIn
} from './motion'

export interface FeedbackModalProps {
  /** Drawn by whatever opened this — a portal inherits neither palette nor state rules. */
  theme: 'day' | 'night'
  /** How this closes for the Game View, which holds it as an arm of its own panel; absent is the menu's route, which closes the stack. */
  onClose?: () => void
}

/**
 * The Feedback modal, opened as Feedback from the Main Menu and as Report a bug from the
 * Game menu: a copy of the app log.
 */
export function FeedbackModal({ theme, onClose }: FeedbackModalProps): JSX.Element | null {
  const closeModal = useUiStore((s) => s.closeModal)
  const exportLog = useUiStore((s) => s.exportLog)
  const close = onClose ?? ((): void => closeModal('feedback'))

  const [busy, setBusy] = useState(false)

  const { host, overlayProps } = useModalShell(close)
  if (!host) return null

  /** Saves the log where the dialog points; the panel stays open, the OS dialog having been the whole interaction. */
  async function download(): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      await exportLog()
    } finally {
      setBusy(false)
    }
  }

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
      <motion.div
        id="feedback-modal"
        className="vu-note vu-paper"
        role="dialog"
        aria-modal="true"
        aria-label="Feedback"
        variants={panelUnderTab}
      >
        <TitleTab>Feedback</TitleTab>

        <p className="vu-note-text">
          The game log records what the app did and every error it hit. It may contain your text
          choices and the LLM&apos;s responses.
        </p>

        <div className="vu-foot vu-note-foot">
          <motion.button
            id="feedback-close"
            className="vu-btn vu-btn--quiet"
            type="button"
            {...gestures(false, quietLift, quietPress)}
            onClick={close}
          >
            Close
          </motion.button>
          <motion.button
            id="feedback-download"
            className="vu-btn vu-btn--primary vu-paper vu-btn--panel"
            type="button"
            disabled={busy}
            {...gestures(busy, lift, press)}
            onClick={() => void download()}
          >
            {busy ? 'Saving…' : 'Download log'}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>,
    host
  )
}
