/**
 * The end of rush, as a screen: the houses that bid on the reader, each with the one button that
 * answers it, and a line for each house that would have bid but for its meetings. The choice is
 * one-way, so the dimming, Escape and a right-click answer nothing: it leaves by a button.
 */
import type { JSX } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'

import { HOUSES, type BidRecord, type HouseId } from '@shared/houses'
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
  slideInQuick,
  veilIn
} from './motion'
import '../vu_styles/Bid.css'

export interface BidModalProps {
  bid: BidRecord
  /** How many of each house's rush events he went to. */
  events: Readonly<Partial<Record<HouseId, number>>>
  /** The slot's own half of the day, as every modal over the scene takes it. */
  theme: ScreenTheme
  /** A house he pledges, or `null` for none. */
  onAnswer: (house: HouseId | null) => void
}

const BID_DEAL = dealt(0, 0.04)

/** The sentence that opens the window. */
function leadOf(invited: number): string {
  if (invited === 0) return 'No house has bid on you.'
  if (invited === 1) return 'Two weeks of rush are done, and one house has bid on you:'
  return 'Two weeks of rush are done. These houses have bid on you:'
}

export function BidModal({ bid, events, theme, onAnswer }: BidModalProps): JSX.Element | null {
  // Nothing here dismisses it: a bid answered by accident cannot be asked again.
  const { host, overlayProps } = useModalShell(() => {}, 'panel')
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
      <motion.div
        id="bid"
        className="vu-bid vu-paper"
        role="dialog"
        aria-modal="true"
        aria-label="Rush is over"
        variants={panelUnderTab}
      >
        <TitleTab>Rush is over</TitleTab>

        <p className="vu-bid-lead">{leadOf(bid.invited.length)}</p>

        {bid.invited.length > 0 && (
          <motion.ul className="vu-bid-list" variants={BID_DEAL}>
            {bid.invited.map((house) => {
              const def = HOUSES[house]
              const went = events[house] ?? 0
              return (
                <motion.li key={house} className="vu-bid-house" variants={slideInQuick}>
                  <span className="vu-bid-name">
                    <span className="vu-bid-nick">{def.nickname}</span>
                    <span className="vu-bid-full">{def.name}</span>
                  </span>
                  <span className="vu-bid-note">You went to {went} of their events.</span>
                  <motion.button
                    id={`bid-pledge-${house}`}
                    className="vu-btn vu-btn--primary vu-btn--panel vu-paper"
                    type="button"
                    {...gestures(false, lift, press)}
                    onClick={() => onAnswer(house)}
                  >
                    Pledge {def.nickname}
                  </motion.button>
                </motion.li>
              )
            })}
          </motion.ul>
        )}

        {bid.clashed.length > 0 && (
          <ul className="vu-bid-clashes">
            {bid.clashed.map((house) => (
              <li key={house} className="vu-bid-clash">
                {HOUSES[house].nickname} would have bid on you, but its meetings clash with your
                team&apos;s practice.
              </li>
            ))}
          </ul>
        )}

        <div className="vu-foot">
          {bid.invited.length > 0 ? (
            <motion.button
              id="bid-decline"
              className="vu-btn vu-btn--quiet"
              type="button"
              {...gestures(false, quietLift, quietPress)}
              onClick={() => onAnswer(null)}
            >
              Turn them all down
            </motion.button>
          ) : (
            <motion.button
              id="bid-close"
              className="vu-btn vu-btn--primary vu-btn--panel vu-paper"
              type="button"
              {...gestures(false, lift, press)}
              onClick={() => onAnswer(null)}
            >
              Close
            </motion.button>
          )}
        </div>
      </motion.div>
    </motion.div>,
    host
  )
}
