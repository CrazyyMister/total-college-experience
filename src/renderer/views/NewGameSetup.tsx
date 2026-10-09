import type { JSX } from 'react'
import { motion } from 'motion/react'
import { COURSES } from '@shared/courses'
import type { TeamChoice } from '@shared/groups'
import { CheckField } from '../components/CheckField'
import { SelectField } from '../components/SelectField'
import { TitleTab } from '../components/TitleTab'
import { dealt, gestures, lift, panelUnderTab, press } from './motion'
import '../vu_styles/NewGameSetup.css'

/** The sections arrive one after another once the step has landed. */
const SECTIONS_IN = dealt(0.2, 0.08)

/** One team or house the roster can fill: who may be asked, and what has been asked so far. */
export interface TeamOffer {
  id: string
  /** The card's title. */
  title: string
  /** What the card says it is for. */
  hint: string
  /** The roster's people who may belong, in roster order. */
  candidates: ReadonlyArray<{ charId: string; label: string; elsewhere?: string }>
  /** The most it can hold; the count runs from none to this, and from the group's least up. */
  min: number
  max: number
  /** Why the team will not be what was asked for, when it will not; shown on the card. */
  notice?: string
  /** It exists whoever joins, and left alone it is drawn: a team he can try out for, or a house. */
  always?: boolean
  /** One of those that nothing has been asked of. */
  auto?: boolean
  choice: TeamChoice
}

/** The counts a card offers: its least to its most, and the one held when it is outside them. */
function countsOf(team: TeamOffer): number[] {
  const range = Array.from({ length: Math.max(0, team.max - team.min + 1) }, (_, at) => team.min + at)
  const held = team.choice.count
  return held > 0 && !range.includes(held) ? [...range, held].sort((a, b) => a - b) : range
}

export interface NewGameSetupProps {
  /** Somebody on the roster can be his ex, or one is already chosen. */
  exOffered: boolean
  /** What the ex button says: who is chosen, or the offer to choose. */
  exLabel: string
  /** The course he majors in, by its name on the shared list; empty for none. */
  course: string
  /** Every team the roster has enough people for. */
  teams: readonly TeamOffer[]
  /** The four Greek houses, which exist whoever of the roster lives in them. */
  houses: readonly TeamOffer[]
  /** The start is under way: nothing here may change. */
  dead: boolean
  onOpenEx: () => void
  onCourse: (course: string) => void
  /** Null puts a team he can try out for back to drawn. */
  onTeam: (id: string, choice: TeamChoice | null) => void
  /** Null puts a house back to drawn. */
  onHouse: (id: string, choice: TeamChoice | null) => void
}

/**
 * New Game's second step: what he may bring to the game besides the roster, one card to a
 * section in a column that scrolls. Every block that adds a choice to New Game adds a card here.
 */
export function NewGameSetup({
  exOffered,
  exLabel,
  course,
  teams,
  houses,
  dead,
  onOpenEx,
  onCourse,
  onTeam,
  onHouse
}: NewGameSetupProps): JSX.Element {
  const cards = [
    ...teams.map((offer) => ({ offer, prefix: 'team', onChange: onTeam })),
    ...houses.map((offer) => ({ offer, prefix: 'house', onChange: onHouse }))
  ]
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

        {cards.map(({ offer: team, prefix, onChange }) => (
          <motion.section
            key={`${prefix}-${team.id}`}
            className="vu-gamesetup-card vu-paper"
            variants={panelUnderTab}
          >
            <TitleTab>{team.title}</TitleTab>
            <SelectField
              id={`new-game-${prefix}-${team.id}`}
              label="Members"
              hint={team.hint}
              value={team.auto ? 'auto' : String(team.choice.count)}
              onChange={(value) =>
                onChange(
                  team.id,
                  value === 'auto'
                    ? null
                    : {
                        count: Number(value),
                        picked: team.choice.picked.slice(0, Number(value))
                      }
                )
              }
              disabled={dead}
              options={[
                ...(team.always
                  ? [
                      {
                        value: 'auto',
                        label:
                          team.max >= team.min
                            ? `Drawn (${team.min} to ${team.max})`
                            : 'Nobody from the roster'
                      },
                      { value: '0', label: 'None from the roster' }
                    ]
                  : [{ value: '0', label: 'No team' }]),
                ...countsOf(team).map((count) => ({
                  value: String(count),
                  label: `${count} from the roster`
                }))
              ]}
            />
            {team.notice && <p className="vu-field-hint">{team.notice}</p>}
            {team.choice.count > 0 && (
              <div className="vu-gamesetup-checks">
                {team.candidates.map((candidate) => {
                  const checked = team.choice.picked.includes(candidate.charId)
                  return (
                    <CheckField
                      key={candidate.charId}
                      id={`new-game-${prefix}-${team.id}-${candidate.charId}`}
                      label={
                        candidate.elsewhere
                          ? `${candidate.label} (${candidate.elsewhere})`
                          : candidate.label
                      }
                      checked={checked}
                      disabled={
                        dead ||
                        candidate.elsewhere !== undefined ||
                        (!checked && team.choice.picked.length >= team.choice.count)
                      }
                      onChange={(on) =>
                        onChange(team.id, {
                          count: team.choice.count,
                          picked: on
                            ? [...team.choice.picked, candidate.charId]
                            : team.choice.picked.filter((id) => id !== candidate.charId)
                        })
                      }
                    />
                  )
                })}
              </div>
            )}
          </motion.section>
        ))}
      </motion.div>
      <div className="vu-scroll-fade" />
    </div>
  )
}
