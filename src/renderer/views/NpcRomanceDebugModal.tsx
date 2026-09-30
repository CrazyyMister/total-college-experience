import { lazy, Suspense, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { pairKeyOf } from '@shared/npcRelationships'
import {
  ENCOURAGED_DAYS,
  HELD_CRUSH_FADES_DAYS,
  isRivalGrudge,
  REJECTION_COOLDOWN_DAYS,
  WINGMAN_KEEP_DAYS
} from '@shared/npcRomance'
import { useModalShell } from '../components/useModalShell'
import { TitleTab } from '../components/TitleTab'
import { useGameStore } from '../stores/gameStore'
import { lastScenePromptText } from '../stores/gameLoop'
import {
  pendingGossipLeak,
  pendingMeetings,
  pendingWingman,
  romanceEventLog,
  romanceSectionOf
} from '../stores/npcRomanceDebug'
import { formatShortGameDate } from '../prompts/gameDate'
import { gestures, lift, panelUnderTab, press, veilIn } from './motion'
import '../vu_styles/NpcRomanceDebug.css'

/** The test buttons, loaded only in the development build so the build that ships holds none. */
const Tools = import.meta.env.DEV
  ? lazy(() =>
      import('./NpcRomanceDebugTools').then((module) => ({ default: module.NpcRomanceDebugTools }))
    )
  : null

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
  const {
    crushes,
    couples,
    exes,
    rejections,
    discovered = {},
    drifts = {},
    wingman = []
  } = game.npcRomance
  const leak = pendingGossipLeak()

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
        facts: `since ${dated(crush.since)} · ${game.date - crush.since} days · ${affinity(from, crush.to)}${
          crush.heldSince !== undefined
            ? ` · kept unsaid ${game.date - crush.heldSince} of ${HELD_CRUSH_FADES_DAYS} days`
            : ''
        }${
          crush.encouraged !== undefined
            ? ` · encouraged ${dated(crush.encouraged)}, ${game.date - crush.encouraged} of ${ENCOURAGED_DAYS} days`
            : ''
        }`
      }))
    },
    {
      title: 'Exes',
      rows: Object.entries(exes).map(([key, ex]) => {
        const [a, b] = key.split('|')
        return {
          key,
          who: `${name(a)} & ${name(b)}`,
          facts: `${dated(ex.since)} to ${dated(ex.ended)} · ${affinity(a, b)}${
            ex.displaced !== undefined
              ? ` · ${name(ex.displaced)} displaced by the reader${
                  isRivalGrudge(ex, game.date) ? ', grudge running' : ', grudge over'
                }`
              : ''
          }`
        }
      })
    },
    {
      title: 'Drifting from the reader',
      rows: Object.entries(drifts).map(([lover, drift]) => ({
        key: lover,
        who: `${name(lover)} is drifting towards ${name(drift.to)}`,
        facts: `since ${dated(drift.since)} · ${drift.signs} signs${
          drift.lastSign !== undefined ? ` · last ${dated(drift.lastSign)}` : ''
        }`
      }))
    },
    {
      title: 'Rejections',
      rows: Object.entries(rejections).map(([key, rejection]) => {
        const [from, to] = key.split('>')
        const waiting = rejection.date + REJECTION_COOLDOWN_DAYS - game.date
        return {
          key,
          who: rejection.quiet
            ? `${name(from)}'s crush on ${name(to)}, faded unsaid`
            : `${name(from)}, turned down by ${name(to)}`,
          facts: `${dated(rejection.date)}${rejection.quiet ? ', no declaration' : ''} · ${
            waiting > 0 ? `waits ${waiting} more days` : 'wait over'
          }`
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
      title: `Wingman, last ${WINGMAN_KEEP_DAYS} days`,
      rows: [
        ...pendingWingman().map((action, index) => ({
          key: `queued:${index}`,
          who: `${action.kind}: ${name(action.from)} → ${name(action.to)}`,
          facts: 'queued for this scene’s ending'
        })),
        ...pendingMeetings().map(([a, b], index) => ({
          key: `meet:${index}`,
          who: `${name(a)} & ${name(b)} spend the slot together`,
          facts: 'queued for this scene’s ending'
        })),
        ...[...wingman].reverse().map((entry, index) => ({
          key: `done:${index}`,
          who: `${entry.kind}: ${name(entry.from)} → ${name(entry.to)}`,
          facts: dated(entry.date)
        }))
      ]
    },
    {
      title: 'Gossip',
      rows: [
        ...(game.npcGossip.owed ?? []).map((lover) => ({
          key: `owed:${lover}`,
          who: `${name(lover)} left the reader in silence`,
          facts: 'owed a gossip post'
        })),
        ...(leak
          ? [
              {
                key: 'leak',
                who: `${name(leak)}'s crush leaks at the next ending`,
                facts: 'unless a breakup or a drift is gossiped first'
              }
            ]
          : []),
        ...game.npcGossip.posts
          .slice(-5)
          .reverse()
          .map((post) => ({
            key: post.id,
            who: `@${post.handle}: ${post.text}`,
            facts: dated(post.date)
          }))
      ]
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
  // Redrawn after a test button wrote something.
  const [, redraw] = useState(0)
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
            {Tools && (
              <Suspense fallback={null}>
                <Tools onChanged={() => redraw((tick) => tick + 1)} />
              </Suspense>
            )}
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
