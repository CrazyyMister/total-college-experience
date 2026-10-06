import type { JSX } from 'react'
import { motion } from 'motion/react'
import { COURSES } from '@shared/courses'
import { SelectField } from '../components/SelectField'
import { TitleTab } from '../components/TitleTab'
import { dealt, gestures, lift, panelUnderTab, press } from './motion'
import '../vu_styles/NewGameSetup.css'

/** The sections arrive one after another once the step has landed. */
const SECTIONS_IN = dealt(0.2, 0.08)

export interface NewGameSetupProps {
  /** Somebody on the roster can be his ex, or one is already chosen. */
  exOffered: boolean
  /** What the ex button says: who is chosen, or the offer to choose. */
  exLabel: string
  /** The course he majors in, by its name on the shared list; empty for none. */
  course: string
  /** The start is under way: nothing here may change. */
  dead: boolean
  onOpenEx: () => void
  onCourse: (course: string) => void
}

/**
 * New Game's second step: what he may bring to the game besides the roster, one card to a
 * section in a column that scrolls. Every block that adds a choice to New Game adds a card here.
 */
export function NewGameSetup({
  exOffered,
  exLabel,
  course,
  dead,
  onOpenEx,
  onCourse
}: NewGameSetupProps): JSX.Element {
  return (
    <div className="vu-scroll-box vu-gamesetup">
      <motion.div
        className="vu-gamesetup-scroll"
        variants={SECTIONS_IN}
        initial="hidden"
        animate="shown"
      >
        {/* Absent while nobody on the roster can be his ex and none is chosen. */}
        {exOffered && (
          <motion.section
            className="vu-gamesetup-card vu-paper"
            variants={panelUnderTab}
          >
            <TitleTab>Ex</TitleTab>
            <p className="vu-field-hint">A girl of the roster he dated before the semester.</p>
            <motion.button
              id="new-game-ex-open"
              className="vu-btn vu-btn--outline vu-btn--panel vu-paper vu-gamesetup-ex"
              {...gestures(dead, lift, press)}
              disabled={dead}
              onClick={onOpenEx}
            >
              {exLabel}
            </motion.button>
          </motion.section>
        )}

        <motion.section
          className="vu-gamesetup-card vu-paper"
          variants={panelUnderTab}
        >
          <TitleTab>Course</TitleTab>
          <SelectField
            id="new-game-course"
            label="Course"
            hint="What the reader studies; its four classes are marked in the registrar."
            value={course}
            onChange={onCourse}
            disabled={dead}
            options={[
              { value: '', label: 'No course' },
              ...COURSES.map((name) => ({ value: name, label: name }))
            ]}
          />
        </motion.section>
      </motion.div>
      <div className="vu-scroll-fade" />
    </div>
  )
}
