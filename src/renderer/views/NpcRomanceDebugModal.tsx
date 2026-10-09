import { lazy, Suspense, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { breakthroughMeterNow, lastBreakthroughUse, METER_MAX } from '@shared/breakthrough'
import { factsKnownBy } from '@shared/facts'
import { GROUP_IDS, GROUPS } from '@shared/groups'
import {
  HOUSE_IDS,
  HOUSES,
  OFFICE_IDS,
  OFFICE_NAMES,
  houseEventOf,
  rushEventsOf,
  type HouseId
} from '@shared/houses'
import { MAX_STRIKES, shiftSlotFullLabel } from '@shared/jobs'
import { locationLabel } from '@shared/locations'
import { pairKeyOf } from '@shared/npcRelationships'
import {
  ENCOURAGED_DAYS,
  HELD_CRUSH_FADES_DAYS,
  isRivalGrudge,
  REJECTION_COOLDOWN_DAYS,
  WINGMAN_KEEP_DAYS
} from '@shared/npcRomance'
import { pronounsOf } from '@shared/pronouns'
import { dedupedMemoriesFor } from '@shared/relationship'
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
import { leftOutLine } from '../stores/hiddenScheduler'
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
  const recorded = game.chars.some((charId) => game.charInfo[charId]?.leftOut !== undefined)
  const leftOutRows: DebugRow[] = game.chars.flatMap((charId) => {
    const entries = game.charInfo[charId]?.leftOut ?? []
    return entries.length === 0
      ? []
      : [{ key: charId, who: name(charId), facts: entries.map(leftOutLine).join(' · ') }]
  })

  const feedPosts = game.chars.flatMap((charId) => game.charInfo[charId]?.feed ?? [])
  const lastWeekPosts = feedPosts.filter((post) => post.date > game.date - 7 && post.date <= game.date)
  const suspicions = game.chars.reduce(
    (sum, charId) => sum + (game.charInfo[charId]?.suspicions?.length ?? 0),
    0
  )
  const leftOutTotal = game.chars.reduce(
    (sum, charId) => sum + (game.charInfo[charId]?.leftOut?.length ?? 0),
    0
  )
  const counts: [string, string][] = [
    ['Characters', `${game.chars.length}`],
    ['Posts on the feeds', `${feedPosts.length} held · ${lastWeekPosts.length} in the last 7 days`],
    ['Suspicions held', `${suspicions}`],
    ['Crushes', `${Object.keys(crushes).length}`],
    ['Couples', `${Object.keys(couples).length}`],
    [
      'Haunts and shifts left out',
      recorded ? `${leftOutTotal}` : 'no record: this game was dealt before the week kept it'
    ]
  ]

  const groupRows: DebugRow[] = GROUP_IDS.flatMap((id) => {
    const agenda = game.groups[id]
    if (!agenda) return []
    const def = GROUPS[id]
    if (agenda.unformed) {
      return [
        {
          key: id,
          who: def.name,
          facts: `asked for ${agenda.unformed.asked}, not formed: only ${agenda.unformed.left} women were left`
        }
      ]
    }
    const members = game.chars.filter((charId) => game.charInfo[charId]?.groups?.includes(id))
    const slotsLabel = agenda.sessions.map(shiftSlotFullLabel).join(', ') || 'none'
    const lost = agenda.leftOutSessions
      ? ` · ${agenda.leftOutSessions} left out: too few members free`
      : ''
    return [
      {
        key: id,
        who: def.name,
        facts: `${members.length === 0 && def.readerPlays ? 'nobody from the roster' : `${members.length} members`} · sessions at ${locationLabel(def.location)}: ${slotsLabel}${lost}${
          game.groupTeam?.id === id
            ? ` · the reader is on it, ${game.groupTeam.strikes} of ${MAX_STRIKES} misses, ${game.groupTeam.attended} of ${game.groupTeam.held} practices attended, judged through slot ${game.groupTeam.settledThrough}`
            : ''
        }`
      },
      ...(def.tryout
        ? [
            (() => {
              const tryout = def.tryout
              const occasion = game.occasions.find((entry) => entry.id === tryout.id)
              const verdict = game.groupTryouts[tryout.id]
              const left = agenda.leftOutEvents?.find((entry) => entry.id === tryout.id)
              const when = occasion
                ? `${dated(occasion.startDate)}, day`
                : left
                  ? `left out: ${left.reason === 'too_few_free' ? 'too few members free' : 'no free day'}`
                  : 'no record'
              const ended = verdict
                ? `${verdict.made ? 'made the team' : 'did not make it'} (Body tier ${verdict.tier})`
                : 'not gone to'
              return {
                key: `${id}:${tryout.id}`,
                who: occasion?.title ?? tryout.id,
                facts: `${when}${occasion ? ` · ${ended}` : ''}`
              }
            })()
          ]
        : []),
      ...def.events.map((event) => {
        const occasion = game.occasions.find((entry) => entry.id === event.id)
        const result = game.groupResults[event.id]
        const left = agenda.leftOutEvents?.find((entry) => entry.id === event.id)
        const when = occasion
          ? `${dated(occasion.startDate)}, ${occasion.time === 0 ? 'day' : 'night'}`
          : left
            ? `left out: ${left.reason === 'too_few_free' ? 'too few members free' : 'no free day'}`
            : 'no record'
        const ended = result
          ? `${result.won ? 'won' : 'lost'} ${Math.max(result.home, result.away)}–${Math.min(result.home, result.away)}`
          : 'not decided'
        return {
          key: `${id}:${event.id}`,
          who: occasion?.title ?? event.id,
          facts: `${when}${occasion ? ` · ${ended}` : ''}`
        }
      }),
      ...members.map((charId) => {
        const info = game.charInfo[charId]
        const kept = agenda.sessions.filter(
          (slot) => !info?.schedule?.[slot] && !info?.job?.shifts.includes(slot)
        )
        const missed = agenda.sessions
          .filter((slot) => !kept.includes(slot))
          .map((slot) => `${shiftSlotFullLabel(slot)} (${info?.schedule?.[slot] ? 'class' : 'shift'})`)
        return {
          key: `${id}:${charId}`,
          who: name(charId),
          facts: `${kept.length} of ${agenda.sessions.length} sessions${
            missed.length > 0 ? ` · misses ${missed.join(', ')}` : ''
          }`
        }
      })
    ]
  })
  // Who lives in each Greek house, from the profiles; a house with nobody of the roster is the
  // unnamed.
  for (const id of HOUSE_IDS) {
    const lived = game.chars.filter((charId) => game.charInfo[charId]?.house === id)
    const named = lived.map((charId) => game.characters[charId]?.firstName ?? charId)
    const offices = OFFICE_IDS.map((office) => {
      const holder = lived.find((charId) => game.charInfo[charId]?.office === office)
      return `${OFFICE_NAMES[office]} ${holder ? (game.characters[holder]?.firstName ?? holder) : 'unnamed'}`
    }).join(', ')
    groupRows.push({
      key: id,
      who: HOUSES[id].name,
      facts: `${HOUSES[id].nickname}, a ${HOUSES[id].kind}: ${
        named.length === 0 ? 'nobody from the roster' : `${named.length} of the roster (${named.join(', ')})`
      } · ${offices}`
    })
  }
  // The fraternities' own: when they meet, their rush events and whether he went, and the bid.
  for (const id of HOUSE_IDS) {
    const agenda = game.houseAgendas[id]
    if (!agenda) continue
    const meets = agenda.sessions.map(shiftSlotFullLabel).join(', ') || 'none'
    groupRows.push({
      key: `${id}:meetings`,
      who: `${HOUSES[id].nickname} meetings`,
      facts: `${meets}${agenda.leftOutSessions ? ` · ${agenda.leftOutSessions} left out` : ''}`
    })
    for (const event of rushEventsOf(id)) {
      const occasion = game.occasions.find((entry) => entry.id === event.id)
      const left = agenda.leftOutEvents?.find((entry) => entry.id === event.id)
      const when = occasion
        ? `${dated(occasion.startDate)}, ${occasion.time === 0 ? 'day' : 'night'}`
        : left
          ? 'left out: no free day'
          : 'no record'
      groupRows.push({
        key: `${id}:${event.id}`,
        who: occasion?.title ?? event.title,
        facts: `${when}${occasion ? (game.groupRush.attended.includes(event.id) ? ' · gone to' : ' · not gone to') : ''}`
      })
    }
  }
  // What the houses throw: the parties and the mixers that found a night, then the ones that did not.
  const houseNights = game.occasions
    .filter((entry) => ['party', 'mixer'].includes(houseEventOf(entry.id)?.kind ?? ''))
    .sort((one, other) => one.startDate - other.startDate)
  for (const entry of houseNights) {
    groupRows.push({
      key: entry.id,
      who: entry.title,
      facts: `${dated(entry.startDate)}, ${entry.time === 0 ? 'day' : 'night'}`
    })
  }
  for (const [id, agenda] of Object.entries(game.houseAgendas)) {
    for (const left of agenda?.leftOutEvents ?? []) {
      if (!['party', 'mixer'].includes(houseEventOf(left.id)?.kind ?? '')) continue
      groupRows.push({
        key: `${id}:${left.id}`,
        who: left.id,
        facts: 'left out: no free night'
      })
    }
  }
  if (game.groupHouse) {
    const standing = game.groupHouse
    groupRows.push({
      key: 'pledge',
      who: `Pledge of ${HOUSES[standing.id].nickname}`,
      facts: `${standing.strikes} missed, ${standing.attended} of ${standing.held} meetings judged went to, judged through slot ${standing.settledThrough}`
    })
  }
  if (game.groupDropped) {
    groupRows.push({
      key: 'dropped',
      who: 'Put out of a pledge',
      facts: `${HOUSES[game.groupDropped.house].nickname}, on day ${game.groupDropped.day}`
    })
  }
  const bid = game.groupRush.bid
  if (bid) {
    groupRows.push({
      key: 'bid',
      who: 'The bid',
      facts: `invited: ${bid.invited.map((id) => HOUSES[id].nickname).join(', ') || 'none'} · clashed: ${bid.clashed.map((id) => HOUSES[id].nickname).join(', ') || 'none'} · scores ${Object.entries(bid.scores).map(([id, score]) => `${HOUSES[id as HouseId].nickname} ${score}`).join(', ')} · ${bid.answer === undefined ? 'waiting for his answer' : bid.answer === null ? 'he turned them down' : `he pledged ${HOUSES[bid.answer].nickname}`}`
    })
  }
  if (groupRows.length === 0) {
    groupRows.push({ key: 'none', who: 'No groups', facts: 'This game formed none.' })
  }

  return [
    {
      title: 'Roster counts',
      rows: counts.map(([who, facts]) => ({ key: who, who, facts }))
    },
    {
      title: 'Breakthrough meter',
      rows: game.chars.map((charId) => {
        const info = game.charInfo[charId]
        const memories = dedupedMemoriesFor(info)
        const undated = memories.filter((memory) => memory.time === undefined).length
        const uses = info?.breakthroughUses ?? []
        const lastUse = lastBreakthroughUse(uses)
        return {
          key: charId,
          who: name(charId),
          facts: `meter ${breakthroughMeterNow(info, charId, game.sceneBreakthroughs, game)} of ${METER_MAX} · ${undated} of ${memories.length} memories without a half of the day${
            lastUse
              ? ` · ${uses.length} uses, last on ${dated(lastUse.date)}, ${lastUse.time === 0 ? 'day' : 'night'}, ${uses[uses.length - 1]?.outcome ?? 'no result'}`
              : ''
          }${info?.nameKnown ? '' : ' · name not known'}`
        }
      })
    },
    {
      title: 'Left out of the week',
      wide: true,
      rows: !recorded
        ? [{ key: 'none', who: 'No record', facts: 'This game was dealt before the week kept it.' }]
        : leftOutRows.length > 0
          ? leftOutRows
          : [{ key: 'none', who: 'Nothing left out', facts: 'The deal placed every haunt and shift.' }]
    },
    {
      title: 'Groups',
      wide: true,
      rows: groupRows
    },
    {
      title: 'Facts',
      rows: game.chars.map((charId) => {
        const character = game.characters[charId]
        const about = game.facts.filter((fact) => fact.about === charId).length
        return {
          key: charId,
          who: name(charId),
          facts: `${factsKnownBy(charId, game.facts).length} facts known · ${about} about ${
            character ? pronounsOf(character.gender).object : 'them'
          }`
        }
      })
    },
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
