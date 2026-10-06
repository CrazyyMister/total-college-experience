import type { JSX } from 'react'
import { motion } from 'motion/react'

import { profileUrl, useSpriteVersion } from '../stores/characterStore'
import { cardLift, gestures, press, slideInQuick } from './motion'
import '../vu_styles/Gift.css'
import '../vu_styles/Breakthrough.css'

/** Her archway and her given name; the whole card is the control, and the picked one wears a border on its crop. */
export function PickFace({
  charId,
  name,
  on,
  onPick
}: {
  charId: string
  name: string
  on: boolean
  onPick: () => void
}): JSX.Element {
  const version = useSpriteVersion(charId)

  return (
    <motion.div
      className="vu-card vu-giftto-card vu-bt-face"
      variants={slideInQuick}
      {...gestures(false, cardLift, press)}
    >
      <motion.button
        className="vu-card-face"
        type="button"
        aria-label={name}
        aria-pressed={on}
        onClick={onPick}
      >
        <span className="vu-arch vu-giftto-arch vu-paper">
          <span className="vu-crop">
            <img className="vu-crop-img" src={profileUrl(charId, version)} alt="" />
          </span>
        </span>
        <span className="vu-card-caption">
          <span className="vu-card-name">{name}</span>
        </span>
      </motion.button>
    </motion.div>
  )
}
