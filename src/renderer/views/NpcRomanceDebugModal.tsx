import type { JSX } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { pairKeyOf } from '@shared/npcRelationships'
import { REJECTION_COOLDOWN_DAYS } from '@shared/npcRomance'
import { useModalShell } from '../components/useModalShell'
import { TitleTab } from '../components/TitleTab'
import { useGameStore } from '../stores/gameStore'
import { lastScenePromptText } from '../stores/gameLoop'
import { romanceEventLog, romanceSectionOf } from '../stores/npcRomanceDebug'
import { formatShortGameDate } from '../prompts/gameDate'
import { gestures, lift, panelUnderTab, press, veilIn } from './motion'
import '../vu_styles/NpcRomanceDebug.css'

/** One row of the panel: who, and the facts beside them. */
interface DebugRow {
  key: string
  who: string
  facts: string
}

interface DebugSection {
  title: string
  rows: DebugRow[]
  /** Rows of one long line each, given the whole width. */
  wide?: boolean
}

/** `Jan 28 (day 9)`: the date as the calendar prints it, and the day number the constants count. */
function dated(date: number): string {
  return `${formatShortGameDate(date)} (day ${date})`
}

/** Every section, off the store as it stands. */
function sectionsOf(): DebugSection[] {
  const game = useGameStore.getState()
  const name = (charId: string): string => {
    const character = game.characters[charId]
    return character ? `${character.firstName} ${character.lastName}` : charId
  }
  const affinity = (a: string, b: string): string =>
    `affinity ${game.npcRelationships[pairKeyOf(a, b)]?.affinity ?? '—'}`
  const { crushes, couples, exes, rejections, discovered = {} } = game.npcRomance

  return [
    {
      title: 'Couples',
      rows: Object.entries(couples).map(([key, couple]) => {
        const [a, b] = key.split('|')
        return {
          key,
          who: `${name(a)} & ${name(b)}`,
          facts: `since ${dated(couple.since)} · ${affinity(a, b)}${
            couple.lastFight !== undefined ? ` · last fight ${dated(couple.lastFight)}` : ''
          }`
        }
      })
    },
    {
      title: 'Crushes',
      rows: Object.entries(crushes).map(([from, crush]) => ({
        key: from,
        who: `${name(from)} has a crush on ${name(crush.to)}`,
        facts: `since ${dated(crush.since)} · ${game.date - crush.since} days · ${affinity(from, crush.to)}`
      }))
    },
    {
      title: 'Exes',
      rows: Object.entries(exes).map(([key, ex]) => {
        const [a, b] = key.split('|')
        return {
          key,
          who: `${name(a)} & ${name(b)}`,
          facts: `${dated(ex.since)} to ${dated(ex.ended)} · ${affinity(a, b)}`
        }
      })
    },
    {
      title: 'Rejections',
      rows: Object.entries(rejections).map(([key, rejection]) => {
        const [from, to] = key.split('>')
        const waiting = rejection.date + REJECTION_COOLDOWN_DAYS - game.date
        return {
          key,
          who: `${name(from)}, turned down by ${name(to)}`,
          facts: `${dated(rejection.date)} · ${waiting > 0 ? `waits ${waiting} more days` : 'wait over'}`
        }
      })
    },
    {
      title: 'Found out by the reader',
      rows: Object.entries(discovered).map(([from, found]) => ({
        key: from,
        who: `${name(from)}'s crush on ${name(found.to)}`,
        facts: dated(found.date)
      }))
    },
    {
      title: 'Events, latest first',
      rows: romanceEventLog()
        .map((entry, index) => ({
          key: String(index),
          who: `[${entry.source}] ${name(entry.from)} → ${name(entry.to)}: ${entry.kind}`,
          facts: `${dated(entry.date)}${entry.note ? ` · ${entry.note}` : ''}`
        }))
        .reverse()
    },
    {
      title: 'Sent with the last scene call',
      wide: true,
      rows: romanceSectionOf(lastScenePromptText()).map((line, index) => ({
        key: String(index),
        who: line,
        facts: ''
      }))
    }
  ]
}

export interface NpcRomanceDebugModalProps {
  /** Drawn by the screen that opened this — a portal inherits neither palette nor state rules. */
  theme: 'day' | 'night'
  onClose: () => void
}

/** The development build's read-out of the roster's romances with each other. */
export function NpcRomanceDebugModal({
  theme,
  onClose
}: NpcRomanceDebugModalProps): JSX.Element | null {
  const { host, overlayProps } = useModalShell(onClose)
  if (!host) return null
  const today = useGameStore.getState().date

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
        id="npc-romance-debug"
        className="vu-sheet vu-romance-debug vu-paper"
        role="dialog"
        aria-modal="true"
        aria-label="Roster romance"
        variants={panelUnderTab}
      >
        <TitleTab>Roster romance</TitleTab>

        <div className="vu-scroll-box">
          <div className="vu-romance-debug-body">
            <p className="vu-romance-debug-today">Today: {dated(today)}</p>
            {sectionsOf().map((section) => (
              <section key={section.title} className="vu-romance-debug-section">
                <h3 className="vu-romance-debug-title">{section.title}</h3>
                {section.rows.length === 0 ? (
                  <p className="vu-empty vu-empty--flush">None yet.</p>
                ) : (
                  <ul className="vu-rows">
                    {section.rows.map((row) => (
                      <li
                        key={row.key}
                        className={`vu-row vu-romance-debug-row${section.wide ? ' vu-romance-debug-row--wide' : ''}`}
                      >
                        <span className="vu-romance-debug-who">{row.who}</span>
                        <span className="vu-romance-debug-facts">{row.facts}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
          <div className="vu-scroll-fade" />
        </div>

        <div className="vu-foot">
          <motion.button
            id="npc-romance-debug-close"
            className="vu-btn vu-btn--primary vu-paper vu-btn--panel"
            type="button"
            {...gestures(false, lift, press)}
            onClick={onClose}
          >
            Close
          </motion.button>
        </div>
      </motion.div>
    </motion.div>,
    host
  )
}
