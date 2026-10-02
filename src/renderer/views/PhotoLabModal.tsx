import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { buildPhotoPrompts, photoDraft, type PhotoChoice } from '@shared/imagePrompt'
import { LOCATIONS, ROOM_LOCATION } from '@shared/locations'
import { expressionRel } from '@shared/characterFiles'
import { CUSTOM_OUTFIT_SLOTS, outfitLabelOf, outfitTagsFor } from '@shared/outfits'
import {
  isAdultPhoto,
  PHOTO_GROUP_LABELS,
  PHOTO_GROUP_ORDER,
  PHOTO_KINDS,
  PHOTO_PLACES,
  photoOutfitAt,
  photoShowsHer,
  type PhotoGroups,
  type PhotoKind,
  type PhotoOutfit
} from '@shared/photos'
import { fullNameOf, randomSeed, type Character } from '@shared/types'
import { WEATHER_KINDS, type Weather } from '@shared/weather'
import { CheckField } from '../components/CheckField'
import { ChipListInput } from '../components/ChipListInput'
import { SelectField } from '../components/SelectField'
import { TitleTab } from '../components/TitleTab'
import { useModalShell } from '../components/useModalShell'
import { imageUrl } from '../stores/imageUrl'
import { useJobStore } from '../stores/jobStore'
import { gestures, lift, panelUnderTab, press, quietLift, quietPress, veilIn } from './motion'
import '../vu_styles/PhotoLab.css'

/**
 * The development build's photo lab: a photo of any woman on the shelf, drawn from tags it
 * shows and lets the player rewrite, into a folder of its own and never into her folder.
 */

/** The job group every lab render is queued under, as main names it. */
const PHOTO_LAB_GROUP = 'photo-lab'

/** How many seeds the batch button draws at once. */
const BATCH_SEEDS = 4

/** What each kind is called in its select. */
const KIND_LABELS: Record<PhotoKind, string> = {
  selfie: 'Selfie',
  mirror: 'Mirror',
  food: 'Food',
  place: 'Place',
  sexy: 'Sexy',
  nude: 'Nude'
}

/** What each sky is called. */
const WEATHER_LABELS: Record<Weather, string> = {
  clear: 'Clear',
  rain: 'Rain',
  storm: 'Storm'
}

/** One render the lab asked for, as the grid shows it. */
interface LabShot {
  id: string
  seed: number
  /** What was chosen, said in one line. */
  label: string
  state: 'waiting' | 'done' | 'failed'
  url?: string
  bootMs?: number | null
  renderMs?: number
  error?: string
}

/** What a place is called in the select: her own room, or the place's own label. */
function placeLabelOf(placeId: string): string {
  if (placeId === ROOM_LOCATION) return 'Her room'
  const label = LOCATIONS.find((location) => location.id === placeId)?.label ?? placeId
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** Every place a photo can be taken, her room first and the rest by name. */
const PLACE_OPTIONS = [
  { value: ROOM_LOCATION, label: placeLabelOf(ROOM_LOCATION) },
  ...Object.keys(PHOTO_PLACES)
    .filter((placeId) => placeId !== ROOM_LOCATION)
    .map((placeId) => ({ value: placeId, label: placeLabelOf(placeId) }))
    .sort((a, b) => a.label.localeCompare(b.label))
]

/** The sets she can be photographed in: her main outfit, PE wear, the swimsuit and her own. */
function outfitOptionsOf(character: Character): { value: PhotoOutfit; label: string }[] {
  return [
    { value: 'main', label: 'Main outfit' },
    { value: 'pe', label: outfitLabelOf(character, 'pe') },
    { value: 'swim', label: outfitLabelOf(character, 'swim') },
    ...CUSTOM_OUTFIT_SLOTS.filter((slot) => outfitTagsFor(character, slot).length > 0).map(
      (slot) => ({ value: slot, label: outfitLabelOf(character, slot) })
    )
  ]
}

/** The choice moved to a new place, wearing what is worn there where she has it. */
function atPlace(choice: PhotoChoice, character: Character, placeId: string): PhotoChoice {
  const worn = photoOutfitAt(placeId)
  const has = outfitOptionsOf(character).some((option) => option.value === worn)
  return { ...choice, place: placeId, outfit: has ? worn : 'main' }
}

/** A name part the lab's file names accept: lowercase letters, digits and underscores. */
function slugOf(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'x'
}

/** Seconds, to one decimal. */
function secondsOf(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

export interface PhotoLabModalProps {
  theme: 'day' | 'night'
  /** Everybody who could be drawn: the women of the shelf, shipped cast included. */
  characters: readonly Character[]
  /** Whether the two adult kinds may be offered at all. */
  nsfwAllowed: boolean
  onClose: () => void
}

/** The photo lab: choices, the tags they make, and the renders they came back as. */
export function PhotoLabModal({
  theme,
  characters,
  nsfwAllowed,
  onClose
}: PhotoLabModalProps): JSX.Element | null {
  const kinds = PHOTO_KINDS.filter((kind) => nsfwAllowed || !isAdultPhoto(kind))

  const [charId, setCharId] = useState(characters[0]?.charId ?? '')
  const character = characters.find((one) => one.charId === charId) ?? characters[0]
  const [choice, setChoice] = useState<PhotoChoice>(() => ({
    kind: 'selfie',
    outfit: 'main',
    place: ROOM_LOCATION,
    night: false,
    weather: 'clear'
  }))
  const [groups, setGroups] = useState<PhotoGroups | null>(() =>
    character ? photoDraft(character, choice) : null
  )
  const [seedText, setSeedText] = useState(() => String(randomSeed()))
  const [refine, setRefine] = useState(true)
  const [shots, setShots] = useState<LabShot[]>([])
  const [viewing, setViewing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const jobs = useJobStore((s) => s.jobs)

  // Every picture this visit decoded, released when the lab closes.
  const urls = useRef<string[]>([])
  useEffect(
    () => () => {
      for (const url of urls.current) URL.revokeObjectURL(url)
      // Closing the lab drops whatever it still had queued.
      void window.api.jobs.cancelGroup(PHOTO_LAB_GROUP)
      useJobStore.getState().clearGroup(PHOTO_LAB_GROUP)
    },
    []
  )

  const prompts = useMemo(() => (groups ? buildPhotoPrompts(groups) : null), [groups])

  /** Takes a new choice, or a new character, and redraws every group from it. */
  const choose = (next: PhotoChoice, who: Character | undefined = character): void => {
    setChoice(next)
    setGroups(who ? photoDraft(who, next) : null)
  }

  /** Queues one render of the groups as they stand, under `seed`. */
  const render = async (seed: number): Promise<void> => {
    if (!character || !groups) return
    const her = photoShowsHer(choice.kind)
    const id = crypto.randomUUID()
    const adult = isAdultPhoto(choice.kind)
    const stem = [
      slugOf(character.firstName),
      choice.kind,
      slugOf(choice.place),
      choice.night ? 'night' : 'day',
      choice.weather,
      ...(refine ? ['refined'] : [])
    ].join('-')
    const label = [
      KIND_LABELS[choice.kind],
      placeLabelOf(choice.place),
      choice.night ? 'night' : 'day',
      WEATHER_LABELS[choice.weather],
      ...(refine ? ['refined'] : [])
    ].join(' · ')
    const outfitLabel =
      outfitOptionsOf(character).find((one) => one.value === choice.outfit)?.label ??
      choice.outfit
    const notes = [
      `Character: ${fullNameOf(character)}`,
      `Kind: ${KIND_LABELS[choice.kind]}`,
      ...(her && !adult ? [`Outfit: ${outfitLabel}`] : []),
      `Place: ${placeLabelOf(choice.place)}`,
      `Time: ${choice.night ? 'night' : 'day'}`,
      `Weather: ${WEATHER_LABELS[choice.weather]}`,
      `Tags edited: ${JSON.stringify(groups) === JSON.stringify(photoDraft(character, choice)) ? 'no' : 'yes'}`
    ]

    setShots((prev) => [{ id, seed, label, state: 'waiting' }, ...prev])
    const result = await window.api.photoLab.render({
      id,
      stem,
      prompts: buildPhotoPrompts(groups),
      seed,
      refine,
      notes
    })
    if (!result.ok) {
      const error = result.error.code === 'CANCELLED' ? 'Cancelled' : result.error.message
      setShots((prev) =>
        prev.map((shot) => (shot.id === id ? { ...shot, state: 'failed', error } : shot))
      )
      return
    }
    const bytes = await window.api.photoLab.read(result.data.file)
    if (!bytes.ok) {
      setShots((prev) =>
        prev.map((shot) =>
          shot.id === id ? { ...shot, state: 'failed', error: bytes.error.message } : shot
        )
      )
      return
    }
    const url = URL.createObjectURL(new Blob([bytes.data], { type: 'image/png' }))
    urls.current.push(url)
    setShots((prev) =>
      prev.map((shot) =>
        shot.id === id
          ? {
              ...shot,
              state: 'done',
              url,
              bootMs: result.data.bootMs,
              renderMs: result.data.renderMs
            }
          : shot
      )
    )
  }

  const { host, overlayProps } = useModalShell(onClose)
  if (!host) return null

  const seedValid = seedText.length > 0
  const dead = !character || !groups
  const viewed = shots.find((shot) => shot.id === viewing)
  const her = photoShowsHer(choice.kind)

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
        className="vu-photolab vu-paper"
        role="dialog"
        aria-modal="true"
        aria-label="Photo lab"
        variants={panelUnderTab}
      >
        <TitleTab>Photo lab</TitleTab>

        <div className="vu-photolab-choices">
          <SelectField
            id="photolab-character"
            label="Character"
            value={character?.charId ?? ''}
            options={characters.map((one) => ({ value: one.charId, label: fullNameOf(one) }))}
            onChange={(value) => {
              const who = characters.find((one) => one.charId === value)
              setCharId(value)
              if (who) choose(atPlace(choice, who, choice.place), who)
            }}
          />
          <SelectField
            id="photolab-kind"
            label="Kind"
            value={choice.kind}
            options={kinds.map((kind) => ({ value: kind, label: KIND_LABELS[kind] }))}
            onChange={(value) => choose({ ...choice, kind: value as PhotoKind })}
          />
          {her && !isAdultPhoto(choice.kind) && character && (
            <SelectField
              id="photolab-outfit"
              label="Outfit"
              value={choice.outfit}
              options={outfitOptionsOf(character)}
              onChange={(value) => choose({ ...choice, outfit: value as PhotoOutfit })}
            />
          )}
          <SelectField
            id="photolab-place"
            label="Place"
            value={choice.place}
            options={PLACE_OPTIONS}
            onChange={(value) => character && choose(atPlace(choice, character, value))}
          />
          <SelectField
            id="photolab-time"
            label="Time"
            value={choice.night ? 'night' : 'day'}
            options={[
              { value: 'day', label: 'Day' },
              { value: 'night', label: 'Night' }
            ]}
            onChange={(value) => choose({ ...choice, night: value === 'night' })}
          />
          <SelectField
            id="photolab-weather"
            label="Weather"
            value={choice.weather}
            options={WEATHER_KINDS.map((weather) => ({
              value: weather,
              label: WEATHER_LABELS[weather]
            }))}
            onChange={(value) => choose({ ...choice, weather: value as Weather })}
          />
          <label className="vu-field" htmlFor="photolab-seed">
            <span className="vu-field-label">Seed</span>
            <input
              id="photolab-seed"
              className="vu-input vu-photolab-seed"
              type="text"
              inputMode="numeric"
              value={seedText}
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, '').slice(0, 16)
                if (next === '' || Number(next) <= Number.MAX_SAFE_INTEGER) setSeedText(next)
              }}
            />
          </label>
        </div>

        <div className="vu-photolab-main">
          <div className="vu-scroll-box vu-photolab-tags-box">
            <div className="vu-photolab-tags">
              <CheckField
                id="photolab-refine"
                label="Refine pass"
                note="Redraws the frame at a larger size before the face pass, as a sprite's base frame is."
                checked={refine}
                onChange={setRefine}
              />
              {groups &&
                PHOTO_GROUP_ORDER.map((key) => (
                  <label key={key} className="vu-field" htmlFor={`photolab-${key}`}>
                    <span className="vu-field-label">{PHOTO_GROUP_LABELS[key]}</span>
                    <ChipListInput
                      id={`photolab-${key}`}
                      values={groups[key]}
                      onChange={(next) =>
                        setGroups((prev) => (prev ? { ...prev, [key]: next } : prev))
                      }
                      placeholder="Enter or comma to add a tag"
                    />
                  </label>
                ))}
              {prompts && (
                <div className="vu-photolab-final">
                  <span className="vu-field-label">Sent as</span>
                  <p className="vu-photolab-prompt">{prompts.positive.replace(/,\n\n/g, ', ')}</p>
                  <span className="vu-field-label">Negative</span>
                  <p className="vu-photolab-prompt">{prompts.negative}</p>
                  <span className="vu-field-label">Face pass</span>
                  <p className="vu-photolab-prompt">
                    {prompts.detailerPositive.replace(/,\n\n/g, ', ')}
                  </p>
                </div>
              )}
            </div>
            <div className="vu-scroll-fade" />
          </div>

          <div className="vu-scroll-box vu-photolab-shots-box">
            <div className="vu-photolab-shots">
              {/* Her neutral sprite, for telling whether the photos are of her. */}
              {character && (
                <div className="vu-photolab-reference">
                  <img src={imageUrl(character.charId, expressionRel('neutral'))} alt="" />
                  <span className="vu-gallery-caption">{fullNameOf(character)}</span>
                </div>
              )}
              {shots.length === 0 ? (
                <p className="vu-empty vu-empty--flush">Nothing rendered yet.</p>
              ) : (
                <>
                  <p className="vu-hint">Click a picture to see it at full size.</p>
                  <ul className="vu-gallery-grid vu-photolab-grid">
                    {shots.map((shot) => {
                      const step = jobs[`${PHOTO_LAB_GROUP}:${shot.id}`]
                      const waiting =
                        step?.status === 'running' ? (step.step ?? 'Rendering') : 'Queued'
                      return (
                        <li key={shot.id} className="vu-gallery-item">
                          {shot.state === 'done' && shot.url ? (
                            <button
                              type="button"
                              className="vu-gallery-cell vu-photolab-cell"
                              aria-label={`See seed ${shot.seed} at full size`}
                              onClick={() => setViewing(shot.id)}
                            >
                              <img className="vu-gallery-img" src={shot.url} alt="" />
                            </button>
                          ) : (
                            <div className="vu-gallery-cell vu-gallery-cell--empty vu-photolab-cell">
                              <span className="vu-gallery-empty">
                                {shot.state === 'failed' ? 'FAILED' : waiting.toUpperCase()}
                              </span>
                            </div>
                          )}
                          <span className="vu-gallery-caption">{shot.label}</span>
                          <span className="vu-photolab-meta">
                            {`seed ${shot.seed}`}
                            {shot.state === 'done' && shot.renderMs !== undefined
                              ? ` · ${secondsOf(shot.renderMs)}${
                                  shot.bootMs != null
                                    ? ` · ComfyUI start ${secondsOf(shot.bootMs)}`
                                    : ''
                                }`
                              : ''}
                          </span>
                          {shot.error && <span className="vu-photolab-error">{shot.error}</span>}
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </div>
            <div className="vu-scroll-fade" />
          </div>
        </div>

        <div className="vu-foot">
          <motion.button
            id="photolab-close"
            className="vu-btn vu-btn--quiet"
            type="button"
            {...gestures(false, quietLift, quietPress)}
            onClick={onClose}
          >
            Close
          </motion.button>
          <motion.button
            id="photolab-folder"
            className="vu-btn vu-btn--quiet"
            type="button"
            {...gestures(false, quietLift, quietPress)}
            onClick={() => void window.api.photoLab.openFolder()}
          >
            Open folder
          </motion.button>
          <motion.button
            id="photolab-clear"
            className="vu-btn vu-btn--quiet"
            type="button"
            disabled={busy}
            {...gestures(busy, quietLift, quietPress)}
            onClick={() => {
              setBusy(true)
              void window.api.photoLab.clear().finally(() => setBusy(false))
            }}
          >
            Clear folder
          </motion.button>
          <motion.button
            id="photolab-reset"
            className="vu-btn vu-btn--quiet"
            type="button"
            disabled={dead}
            {...gestures(dead, quietLift, quietPress)}
            onClick={() => character && choose(choice)}
          >
            Reset tags
          </motion.button>
          <motion.button
            id="photolab-batch"
            className="vu-btn vu-btn--quiet"
            type="button"
            disabled={dead}
            {...gestures(dead, quietLift, quietPress)}
            onClick={() => {
              for (let i = 0; i < BATCH_SEEDS; i++) void render(randomSeed())
            }}
          >
            Render 4 seeds
          </motion.button>
          <motion.button
            id="photolab-render"
            className="vu-btn vu-btn--primary vu-btn--panel vu-paper"
            type="button"
            disabled={dead || !seedValid}
            {...gestures(dead || !seedValid, lift, press)}
            onClick={() => void render(Number(seedText))}
          >
            Render
          </motion.button>
        </div>

        {viewed?.url && (
          <button
            type="button"
            className="vu-photolab-view"
            aria-label="Close the full-size picture"
            onClick={() => setViewing(null)}
          >
            <img src={viewed.url} alt="" />
          </button>
        )}
      </motion.div>
    </motion.div>,
    host
  )
}
