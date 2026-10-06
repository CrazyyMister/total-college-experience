/**
 * What a contact's Memories card carries below her memories: the facts she knows and the scenes
 * she was in, each row opening its own edit, and the button that writes a new fact.
 */
import { Fragment, useState, type JSX } from 'react'
import { AnimatePresence, motion } from 'motion/react'

import { encounterEntriesOf } from '@shared/encounters'
import { FACT_CATEGORY_LABELS, factsKnownBy } from '@shared/facts'
import { secondPerson } from '@shared/readerVoice'
import { FACT_ABOUT_READER, type Fact } from '@shared/types'
import { factSentence } from '../prompts/facts'
import { placeOf } from '../prompts/encounters'
import { formatShortGameDate } from '../prompts/gameDate'
import { UNKNOWN_NAME, useGameStore } from '../stores/gameStore'
import type { ScreenTheme } from './clockTheme'
import { EditEncounterModal } from './EditEncounterModal'
import { EditFactModal } from './EditFactModal'
import { gestures, quietLift, quietPress } from './motion'
import { MoonIcon, PencilIcon, SunIcon } from './screenIcons'

/** The facts she knows, newest first, with the button that adds one. */
export function FactsSection({
  charId,
  theme
}: {
  charId: string
  theme: ScreenTheme
}): JSX.Element {
  const characters = useGameStore((s) => s.characters)
  const charInfo = useGameStore((s) => s.charInfo)
  const facts = useGameStore((s) => s.facts)
  // The fact open in the panel; `'new'` is the panel that writes one.
  const [editing, setEditing] = useState<Fact | 'new' | null>(null)

  // Newest first, and a fact about somebody the reader cannot name is left out, as it is
  // everywhere else.
  const known = factsKnownBy(charId, facts)
    .reverse()
    .flatMap((fact) => {
      if (fact.about !== FACT_ABOUT_READER && !charInfo[fact.about]?.nameKnown) return []
      const sentence = factSentence(fact, characters)
      return sentence ? [{ fact, sentence }] : []
    })

  return (
    <div className="vu-contact-field">
      <div className="vu-contact-section-head">
        <h4 className="vu-contact-sub">Facts</h4>
        <motion.button
          id={`facts-add-${charId}`}
          className="vu-pill vu-contact-section-add"
          type="button"
          {...gestures(false, quietLift, quietPress)}
          onClick={() => setEditing('new')}
        >
          Add fact
        </motion.button>
      </div>
      {known.length === 0 ? (
        <p className="vu-contact-empty">Nothing yet.</p>
      ) : (
        <div className="vu-contact-memories">
          {known.map(({ fact, sentence }) => (
            <Fragment key={fact.id}>
              <span className="vu-contact-when">{formatShortGameDate(fact.date)}</span>
              <span>
                “{secondPerson(sentence)}”
                <span className="vu-contact-memory-cat">{FACT_CATEGORY_LABELS[fact.category]}</span>
                {fact.kind === 'said' ? (
                  <span className="vu-sticker vu-contact-memory-sticker">Only said</span>
                ) : null}
              </span>
              <motion.button
                className="vu-square vu-contact-memory-edit"
                type="button"
                aria-label="Edit fact"
                {...gestures(false, quietLift, quietPress)}
                onClick={() => setEditing(fact)}
              >
                <PencilIcon />
              </motion.button>
            </Fragment>
          ))}
        </div>
      )}

      <AnimatePresence propagate>
        {editing !== null && (
          <EditFactModal
            key="edit-fact"
            theme={theme}
            charId={charId}
            fact={editing === 'new' ? undefined : editing}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/** The scenes she was in, newest first, each with the recap she was given or a note she was not. */
export function EncountersSection({
  charId,
  name,
  theme
}: {
  charId: string
  name: string
  theme: ScreenTheme
}): JSX.Element {
  const characters = useGameStore((s) => s.characters)
  const charInfo = useGameStore((s) => s.charInfo)
  const encounters = useGameStore((s) => s.encounters)
  const [editing, setEditing] = useState<ReturnType<typeof encounterEntriesOf>[number] | null>(null)

  const entries = encounterEntriesOf(charId, encounters)
  /** Another person's first name as the reader may read it. */
  const nameOf = (other: string): string =>
    charInfo[other]?.nameKnown ? (characters[other]?.firstName ?? UNKNOWN_NAME) : UNKNOWN_NAME

  return (
    <div className="vu-contact-field">
      <h4 className="vu-contact-sub">Encounters</h4>
      {entries.length === 0 ? (
        <p className="vu-contact-empty">Nothing yet.</p>
      ) : (
        <div className="vu-contact-memories">
          {entries.map((entry) => {
            const { date, time, encounter } = entry
            const others = encounter.who.filter((other) => other !== charId).map(nameOf)
            const meta = [
              ...(encounter.where ? [placeOf(encounter.where)] : []),
              ...(others.length > 0 ? [`with ${others.join(', ')}`] : [])
            ].join(' · ')
            return (
              <Fragment key={`${date}-${time}`}>
                <span className="vu-contact-when">
                  {formatShortGameDate(date)}
                  {time === 1 ? (
                    <MoonIcon className="vu-contact-half-mark" strokeWidth={2.75} />
                  ) : (
                    <SunIcon className="vu-contact-half-mark" strokeWidth={2.75} />
                  )}
                </span>
                <span>
                  {meta ? <span className="vu-contact-memory-meta">{meta}</span> : null}
                  “{secondPerson(encounter.summary)}”
                  {encounter.saw.includes(charId) ? null : (
                    <span className="vu-sticker vu-contact-memory-sticker">Did not see it all</span>
                  )}
                </span>
                <motion.button
                  className="vu-square vu-contact-memory-edit"
                  type="button"
                  aria-label="Edit encounter"
                  {...gestures(false, quietLift, quietPress)}
                  onClick={() => setEditing(entry)}
                >
                  <PencilIcon />
                </motion.button>
              </Fragment>
            )
          })}
        </div>
      )}

      <AnimatePresence propagate>
        {editing !== null && (
          <EditEncounterModal
            key="edit-encounter"
            theme={theme}
            charId={charId}
            name={name}
            date={editing.date}
            time={editing.time}
            encounter={editing.encounter}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
