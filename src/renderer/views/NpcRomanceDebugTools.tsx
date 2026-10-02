import { useEffect, useState, type JSX } from 'react'
import { PHOTO_KINDS, type PhotoKind } from '@shared/photos'
import { motion } from 'motion/react'
import { SelectField } from '../components/SelectField'
import { useGameStore } from '../stores/gameStore'
import {
  debugAffection,
  debugAffinity,
  debugAgeBreakup,
  debugAgeEncouraged,
  debugAgeWingman,
  debugAgeHeld,
  debugBetrayed,
  debugBlocked,
  debugCouple,
  debugCrush,
  debugDiscover,
  debugDriftBack,
  debugLeakCrush,
  debugLover,
  debugMeet,
  debugWingman,
  type DebugResult
} from '../stores/npcRomanceDebugActions'
import {
  debugArmPhoto,
  debugDeletePhotos,
  debugForceInvitation,
  debugHomeForPhotos,
  photoRowsOf
} from '../stores/photoDebugActions'
import { usePhotoStore } from '../stores/photoStore'
import { gestures, lift, press } from './motion'

/** The development build's test buttons for the roster's romance, under the read-out. */

export interface NpcRomanceDebugToolsProps {
  /** Called after a button wrote something, so the read-out above redraws. */
  onChanged: () => void
}

/** One button and what it does with the pickers' values. */
interface Tool {
  label: string
  run: (x: string, y: string, n: number) => DebugResult
}

const TOOLS: readonly Tool[] = [
  { label: 'Crush of X on Y, N days old', run: (x, y, n) => debugCrush(x, y, n) },
  { label: 'Couple X and Y', run: (x, y) => debugCouple(x, y) },
  { label: 'Affinity of X and Y = N', run: (x, y, n) => debugAffinity(x, y, n) },
  { label: 'Affection of X for the reader = N', run: (x, _y, n) => debugAffection(x, n) },
  { label: 'Make X the reader’s lover', run: (x) => debugLover(x, true) },
  { label: 'End X’s dating with the reader', run: (x) => debugLover(x, false) },
  { label: 'X learned today he cheated', run: (x) => debugBetrayed(x, true) },
  { label: 'Clear X’s betrayal', run: (x) => debugBetrayed(x, false) },
  { label: 'X’s drift began N days earlier', run: (x, _y, n) => debugDriftBack(x, n) },
  { label: 'X’s kept crush is N days older', run: (x, _y, n) => debugAgeHeld(x, n) },
  { label: 'The reader discovers X’s crush', run: (x) => debugDiscover(x) },
  { label: 'The next scene leaks X’s crush', run: (x) => debugLeakCrush(x) },
  { label: 'X blocks the reader', run: (x) => debugBlocked(x, true) },
  { label: 'X unblocks the reader', run: (x) => debugBlocked(x, false) },
  { label: 'Reader talks X up to Y', run: (x, y) => debugWingman('talked_up', x, y) },
  { label: 'Reader badmouths X to Y', run: (x, y) => debugWingman('talked_down', x, y) },
  {
    label: 'Reader urges X to confess to Y',
    run: (x, y) => debugWingman('encouraged_confession', x, y)
  },
  { label: 'Reader tells Y of X’s crush', run: (x, y) => debugWingman('revealed_crush', x, y) },
  { label: 'X and Y spend this slot together', run: (x, y) => debugMeet(x, y) },
  { label: 'X’s encouragement is N days older', run: (x, _y, n) => debugAgeEncouraged(x, n) },
  { label: 'X’s wingman actions are N days older', run: (x, _y, n) => debugAgeWingman(x, n) },
  { label: 'X & Y’s breakup is N days older', run: (x, y, n) => debugAgeBreakup(x, y, n) }
]

/** Pickers for the two characters and the number, and a button for each thing to set up. */
export function NpcRomanceDebugTools({ onChanged }: NpcRomanceDebugToolsProps): JSX.Element {
  const { chars, characters } = useGameStore.getState()
  const options = chars.flatMap((charId) => {
    const character = characters[charId]
    return character
      ? [
          {
            value: charId,
            label: `${character.firstName} ${character.lastName} (${character.gender === 'man' ? 'man' : 'woman'})`
          }
        ]
      : []
  })
  const [x, setX] = useState(options[0]?.value ?? '')
  const [y, setY] = useState(options[1]?.value ?? options[0]?.value ?? '')
  const [n, setN] = useState('10')
  const [result, setResult] = useState<DebugResult | null>(null)

  const run = (tool: Tool): void => {
    setResult(tool.run(x, y, Number(n) || 0))
    onChanged()
  }

  const [kind, setKind] = useState<PhotoKind>('selfie')
  // The photo files the playthrough holds, re-read whenever a button may have changed them.
  const [files, setFiles] = useState<ReadonlySet<string>>(new Set())
  const [filesTick, setFilesTick] = useState(0)
  // Subscribed, so a job's state moving redraws the read-out.
  usePhotoStore((s) => s.views)
  useEffect(() => {
    const playthroughId = useGameStore.getState().playthroughId
    if (!playthroughId) return
    let live = true
    void window.api.photos.files(playthroughId).then((found) => {
      if (live && found.ok) setFiles(new Set(found.data))
    })
    return () => {
      live = false
    }
  }, [x, filesTick])

  return (
    <section className="vu-romance-debug-section">
      <h3 className="vu-romance-debug-title">Test buttons</h3>
      <div className="vu-romance-debug-pickers">
        <SelectField id="romance-debug-x" label="X" value={x} onChange={setX} options={options} />
        <SelectField id="romance-debug-y" label="Y" value={y} onChange={setY} options={options} />
        <label className="vu-field" htmlFor="romance-debug-n">
          <span className="vu-field-label">N</span>
          <input
            id="romance-debug-n"
            className="vu-input"
            type="number"
            value={n}
            onChange={(e) => setN(e.target.value)}
          />
        </label>
      </div>
      <div className="vu-romance-debug-tools">
        {TOOLS.map((tool) => (
          <motion.button
            key={tool.label}
            className="vu-btn vu-paper vu-btn--panel"
            type="button"
            {...gestures(false, lift, press)}
            onClick={() => run(tool)}
          >
            {tool.label}
          </motion.button>
        ))}
      </div>
      <h3 className="vu-romance-debug-title">Photos in X’s conversation</h3>
      <ul className="vu-rows">
        {photoRowsOf(x, files).map((row) => (
          <li key={row.key} className="vu-row vu-romance-debug-row vu-romance-debug-row--wide">
            <span className="vu-romance-debug-facts">{row.text}</span>
          </li>
        ))}
      </ul>
      <div className="vu-romance-debug-pickers">
        <SelectField
          id="romance-debug-photo-kind"
          label="Photo"
          value={kind}
          onChange={(value) => setKind(value as PhotoKind)}
          options={PHOTO_KINDS.map((one) => ({ value: one, label: one }))}
        />
      </div>
      <div className="vu-romance-debug-tools">
        <motion.button
          className="vu-btn vu-paper vu-btn--panel"
          type="button"
          {...gestures(false, lift, press)}
          onClick={() => {
            setResult(debugArmPhoto(x, kind))
            setFilesTick((tick) => tick + 1)
          }}
        >
          X’s next reply sends a {kind} photo
        </motion.button>
        <motion.button
          className="vu-btn vu-paper vu-btn--panel"
          type="button"
          {...gestures(false, lift, press)}
          onClick={() => setResult(debugForceInvitation(x, null))}
        >
          X invites the reader at the next ending
        </motion.button>
        <motion.button
          className="vu-btn vu-paper vu-btn--panel"
          type="button"
          {...gestures(false, lift, press)}
          onClick={() => setResult(debugForceInvitation(x, kind))}
        >
          X’s next-ending invitation carries a {kind} photo
        </motion.button>
        <motion.button
          className="vu-btn vu-paper vu-btn--panel"
          type="button"
          {...gestures(false, lift, press)}
          onClick={() => setResult(debugHomeForPhotos(x))}
        >
          X is at home this slot
        </motion.button>
        <motion.button
          className="vu-btn vu-paper vu-btn--panel"
          type="button"
          {...gestures(false, lift, press)}
          onClick={() => {
            void debugDeletePhotos(x).then((deleted) => {
              setResult(deleted)
              setFilesTick((tick) => tick + 1)
            })
          }}
        >
          Delete X’s photo files
        </motion.button>
      </div>
      {result && (
        <p
          className={`vu-romance-debug-result${result.ok ? '' : ' vu-romance-debug-result--refused'}`}
          role="status"
        >
          {result.text}
        </p>
      )}
    </section>
  )
}
