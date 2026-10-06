import { readFileSync } from 'fs'
import { resolve } from 'path'
import { it } from 'vitest'
import { readCharacterRecord } from '@shared/characterRules'
import { rollInitialNpcRelationships, settleNpcPairs } from '@shared/npcRelationships'
import {
  emptyNpcRomance,
  settleNpcRomance,
  type NpcRomanceMap,
  type NpcRomanceTally
} from '@shared/npcRomance'
import type { Character, Gender, GameSave, PlaythroughRecord, TimeSlot } from '@shared/types'
import { useGameStore } from '../../src/renderer/stores/gameStore'
import {
  applyNpcOverlay,
  rollNpcOverlayNow,
  rollSlotEncounterGroups
} from '../../src/renderer/stores/loop/npc'
import { weekdayOf } from '../../src/renderer/prompts/gameDate'
import { GRADUATION_DATE } from '../../src/renderer/prompts/occasions'

/**
 * Plays the roster's off-screen semester with no writer and no reader: every slot's overlay,
 * lectures and run-ins through the game's own rolls, the affinity settle, then the romance
 * settle, from day 0 to graduation. Runs on the test playthrough's roster, schedules and
 * occasions, once as its cast is and once per scenario that turns some of them into men.
 */

const RUNS = 30

const ROOT = resolve(__dirname, '../..')
const FOLDER = resolve(ROOT, 'testsave/1790392968199')

/** Who becomes what, by roster position; everybody unlisted stays a woman attracted to men. */
interface Scenario {
  name: string
  identities: { gender: Gender; attractedTo: Gender }[]
}

const man = (attractedTo: Gender) => ({ gender: 'man' as const, attractedTo })

const SCENARIOS: Scenario[] = [
  { name: 'Elenco como está (12 mulheres atraídas por homens)', identities: [] },
  {
    name: '4 homens (3 por mulheres, 1 por homens) + 1 mulher por mulheres',
    identities: [
      man('woman'),
      man('woman'),
      man('woman'),
      man('man'),
      { gender: 'woman', attractedTo: 'woman' }
    ]
  },
  {
    name: '8 homens (6 por mulheres, 2 por homens)',
    identities: [
      man('woman'),
      man('woman'),
      man('woman'),
      man('woman'),
      man('woman'),
      man('woman'),
      man('man'),
      man('man')
    ]
  }
]

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

/** The test playthrough's record, a save from its spring break, and its cast from the assets. */
function loadPlaythrough(): {
  record: PlaythroughRecord
  save: GameSave
  characters: Record<string, Character>
} {
  const record = readJson<PlaythroughRecord>(resolve(FOLDER, 'playthrough.json'))
  const save = readJson<GameSave>(resolve(FOLDER, 'manual03.json'))
  const characters: Record<string, Character> = {}
  for (const charId of record.chars) {
    const path = resolve(ROOT, 'assets/characters', charId, 'character.json')
    characters[charId] = readCharacterRecord(readJson<unknown>(path), path).character
  }
  return { record, save, characters }
}

/** Totals over one semester. */
interface SemesterResult extends NpcRomanceTally {
  couplesAtEnd: number
  mostCouples: number
  firstCoupleDay: number | null
}

function playSemester(scenario: Scenario): SemesterResult {
  const { record, save, characters } = loadPlaythrough()
  record.chars.forEach((charId, i) => {
    const identity = scenario.identities[i]
    if (identity) characters[charId] = { ...characters[charId], ...identity }
  })

  const game = useGameStore.getState()
  game.loadSave({ ...save, playthroughId: 'sim', saveId: 'sim' }, record, characters)
  const roster = record.chars.map((charId) => ({
    charId,
    year: useGameStore.getState().charInfo[charId]?.year ?? 1
  }))
  useGameStore.setState({
    cast: [],
    npcRelationships: rollInitialNpcRelationships(roster),
    npcRomance: emptyNpcRomance(),
    weekendOutings: {},
    outingSlots: {}
  })

  const result: SemesterResult = {
    crushes: 0,
    declarations: 0,
    accepted: 0,
    rejected: 0,
    fights: 0,
    breakups: 0,
    couplesAtEnd: 0,
    mostCouples: 0,
    firstCoupleDay: null
  }
  let romance: NpcRomanceMap = emptyNpcRomance()

  for (let date = 0; date < GRADUATION_DATE; date++) {
    for (const time of [0, 1] as TimeSlot[]) {
      useGameStore.setState({ date, time })
      applyNpcOverlay(rollNpcOverlayNow(date, time))
      const groups = rollSlotEncounterGroups()
      const state = useGameStore.getState()
      const settled = settleNpcPairs({
        date,
        relationships: state.npcRelationships,
        cast: [],
        groups,
        characters: state.characters
      })
      const out = settleNpcRomance({
        date,
        time,
        endsWeek: weekdayOf(date) === 0 && time === 1,
        relationships: settled,
        romance: state.npcRomance,
        groups,
        cast: [],
        readerLovers: [],
        characters: state.characters
      })
      romance = out.romance
      useGameStore.setState({ npcRelationships: out.relationships, npcRomance: romance })

      for (const key of Object.keys(out.tally) as (keyof NpcRomanceTally)[]) {
        result[key] += out.tally[key]
      }
      const couples = Object.keys(romance.couples).length
      result.mostCouples = Math.max(result.mostCouples, couples)
      if (out.tally.accepted > 0 && result.firstCoupleDay === null) result.firstCoupleDay = date
    }
  }
  result.couplesAtEnd = Object.keys(romance.couples).length
  return result
}

function average(values: number[]): string {
  if (values.length === 0) return '—'
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)
}

it(
  'plays the semester and reports what happened',
  () => {
    const lines: string[] = [`\nRomance entre NPCs — média de ${RUNS} semestres por cenário\n`]
    for (const scenario of SCENARIOS) {
      const runs = Array.from({ length: RUNS }, () => playSemester(scenario))
      const of = (key: keyof SemesterResult): string =>
        average(runs.map((run) => run[key] as number))
      const formed = runs.reduce((sum, run) => sum + run.accepted, 0)
      const ended = runs.reduce((sum, run) => sum + run.breakups, 0)
      const firsts = runs.flatMap((run) => (run.firstCoupleDay === null ? [] : [run.firstCoupleDay]))
      lines.push(
        `■ ${scenario.name}`,
        `  paixões ${of('crushes')} · declarações ${of('declarations')} · aceitas ${of('accepted')} · recusadas ${of('rejected')}`,
        `  brigas ${of('fights')} · términos ${of('breakups')} · casais no fim ${of('couplesAtEnd')} · máximo simultâneo ${of('mostCouples')}`,
        `  casais que terminaram: ${formed === 0 ? '—' : `${Math.round((ended / formed) * 100)}%`}` +
          ` · primeiro casal no dia ${average(firsts)} (em ${firsts.length} de ${RUNS} semestres)`,
        ''
      )
    }
    process.stdout.write(lines.join('\n') + '\n')
  },
  600_000
)
