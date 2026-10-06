import { describe, expect, it } from 'vitest'
import { breakthroughMeter } from '@shared/breakthrough'
import { canBeEx, exOf, exSeedOf } from '@shared/exGirlfriend'
import {
  affectionOf,
  behaviorLevelOf,
  emptyFlags,
  loveLifeBlurb,
  readerStandingOf
} from '@shared/relationship'
import { DEFAULT_PLAYER_STATS } from '@shared/playerStats'
import { EX_ENDERS, EX_TONES, type CharInfo, type ExChoice } from '@shared/types'
import { orientationPoolOf } from '../src/renderer/prompts/introScript'
import { relationshipLines } from '../src/renderer/prompts/relationship'
import { readerText } from '../src/renderer/prompts/setting'
import { character, charInfo, lcg } from './fixtures'

/**
 * What the game writes onto the reader's chosen ex before day 0: dates that stay inside the
 * summer and the year before, milestones that read as a finished relationship, memories with no
 * half of the day that leave her Breakthrough empty, and how warm or bitter she comes out.
 */

const MINA = character({ charId: 'mina', firstName: 'Mina', lastName: 'Park' })

describe('exSeedOf', () => {
  it('dates everything before day 0, in order, with the breakup in the summer before', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const out = exSeedOf(MINA, { tone: 'good', endedBy: 'her' }, lcg(seed))
      expect(out).not.toBeNull()
      const { memories, datingSince, brokeUpOn } = out!

      expect(brokeUpOn).toBeGreaterThanOrEqual(-232)
      expect(brokeUpOn).toBeLessThanOrEqual(-141)
      expect(datingSince).toBeGreaterThanOrEqual(-730)
      expect(datingSince).toBeLessThanOrEqual(-365)

      const dates = memories.map((memory) => memory.date)
      expect(dates.every((date) => date < 0)).toBe(true)
      expect(dates).toEqual([...dates].sort((a, b) => a - b))
      expect(Math.min(...dates)).toBeLessThan(datingSince)
      expect(Math.max(...dates)).toBe(brokeUpOn)
    }
  })

  it('leaves her broken up and out of every present relationship, with the milestones behind her', () => {
    const { flags, nameKnown } = exSeedOf(MINA, { tone: 'bad', endedBy: 'him' }, lcg(3))!
    expect(flags).toMatchObject({
      hasMet: true,
      gaveContactInfo: true,
      hasKissed: true,
      hadSex: true,
      brokenUp: 1,
      isLover: false,
      hasCrush: false,
      benefits: false,
      blocked: false
    })
    expect(nameKnown).toBe(true)
  })

  it('files no half of the day on any memory, so her Breakthrough meter is empty', () => {
    for (const tone of EX_TONES) {
      for (const endedBy of EX_ENDERS) {
        const { memories } = exSeedOf(MINA, { tone, endedBy }, lcg(5))!
        expect(memories.every((memory) => memory.time === undefined)).toBe(true)
        expect(breakthroughMeter(memories)).toBe(0)
      }
    }
  })

  it('files the breakup memory, and leaves her warm when it was good and cold when it was bad', () => {
    for (const endedBy of EX_ENDERS) {
      const good = exSeedOf(MINA, { tone: 'good', endedBy }, lcg(11))!
      const bad = exSeedOf(MINA, { tone: 'bad', endedBy }, lcg(11))!
      for (const seed of [good, bad]) {
        expect(seed.memories.some((memory) => memory.desc.startsWith('things ended'))).toBe(true)
      }
      expect(affectionOf(good.memories, 0)).toBeGreaterThan(0)
      expect(affectionOf(bad.memories, 0)).toBeLessThan(0)
    }
  })

  it('is the same for the same draws', () => {
    const choice = { tone: 'good', endedBy: 'both' } as const
    expect(exSeedOf(MINA, choice, lcg(9))).toEqual(exSeedOf(MINA, choice, lcg(9)))
  })

  it('is written only for a character who can be his romance', () => {
    const man = character({ charId: 'sam', gender: 'man', attractedTo: 'man' })
    const gay = character({ charId: 'ann', attractedTo: 'woman' })
    expect(canBeEx(MINA)).toBe(true)
    for (const other of [man, gay]) {
      expect(exSeedOf(other, { tone: 'good', endedBy: 'her' }, lcg(1))).toBeNull()
    }
  })
})

describe('exOf', () => {
  const choice: ExChoice = { charId: 'mina', tone: 'good', endedBy: 'her' }

  it('reads as no ex when the record names nobody this playthrough has or can use', () => {
    const roster = { mina: MINA }
    expect(exOf(choice, roster, ['mina'])).toEqual(choice)
    expect(exOf(undefined, roster, ['mina'])).toBeNull()
    expect(exOf(choice, roster, [])).toBeNull()
    expect(exOf(choice, {}, ['mina'])).toBeNull()
    expect(exOf({ ...choice, tone: 'odd' as never }, roster, ['mina'])).toBeNull()
  })
})

describe('behaviorLevelOf', () => {
  const ex = { ...emptyFlags(), brokenUp: 1 }

  it('writes an ex as an enemy at or below zero and a friend above it', () => {
    expect(behaviorLevelOf(ex, -20)).toBe('withEnemy')
    expect(behaviorLevelOf(ex, 0)).toBe('withEnemy')
    expect(behaviorLevelOf(ex, 1)).toBe('withFriends')
    expect(behaviorLevelOf(ex, 8)).toBe('withFriends')
    expect(behaviorLevelOf(ex, 40)).toBe('withFriends')
  })

  it('leaves a lover and a crush above an ex, and everybody else as they were', () => {
    expect(behaviorLevelOf({ ...ex, isLover: true }, -40)).toBe('withLover')
    expect(behaviorLevelOf({ ...ex, hasCrush: true }, -40)).toBe('withCrush')
    expect(behaviorLevelOf(emptyFlags(), -15)).toBe('withEnemy')
    expect(behaviorLevelOf(emptyFlags(), -14)).toBe('withStrangers')
    expect(behaviorLevelOf(emptyFlags(), 16)).toBe('withFriends')
  })
})

describe('an ex in the neutral band', () => {
  const lines = (flags: CharInfo['flags'], affection: number): string =>
    relationshipLines(MINA, flags, true, affection, DEFAULT_PLAYER_STATS).join('\n')
  const ex = { ...emptyFlags(), hasMet: true, hasKissed: true, hadSex: true, brokenUp: 1 }

  it('is told apart by which side of zero she stands on, and the kissed line is not about the future', () => {
    expect(lines(ex, 8)).toContain('is on good terms with the reader despite their breakup.')
    expect(lines(ex, -4)).toContain('still resents the reader over their breakup.')
    expect(lines(ex, 8)).not.toContain('not lovers yet')
  })

  it('leaves somebody who was never his as she was', () => {
    const stranger = { ...emptyFlags(), hasMet: true }
    expect(lines(stranger, 0)).toContain("doesn't particularly care about the reader.")
    expect(lines({ ...stranger, hasKissed: true }, 0)).toContain('not lovers yet')
  })
})

describe('the love life of the reader’s ex', () => {
  const sheet = character({ datingHistory: 'dated a poet', isVirgin: true })
  const flags = { hadSex: false }

  it('keeps her preference and kinks and drops her history and virginity, only for the ex', () => {
    const before = JSON.stringify(sheet)
    const asEx = loveLifeBlurb(sheet, flags, { origin: 'They dated.' })
    expect(asEx).toContain('They dated.')
    expect(asEx).toContain(sheet.datingPreference)
    expect(asEx).toContain(sheet.kinks)
    expect(asEx).not.toContain('dated a poet')
    expect(asEx).not.toContain('virgin')

    const other = loveLifeBlurb(sheet, flags)
    expect(other).toContain('dated a poet')
    expect(other).toContain('is a virgin')
    expect(JSON.stringify(sheet)).toBe(before)
  })
})

describe('the reader’s exes line', () => {
  it('says the year of a day before the semester, which the bare month and day would hide', () => {
    const seed = exSeedOf(MINA, { tone: 'good', endedBy: 'her' }, lcg(4))!
    const info: CharInfo = {
      ...charInfo(),
      flags: seed.flags,
      memories: seed.memories,
      datingSince: seed.datingSince,
      brokeUpOn: seed.brokeUpOn
    }
    const { exes } = readerStandingOf(['mina'], { mina: info }, { mina: 'Mina' })
    const line = readerText('Seth', 'Hawke', DEFAULT_PLAYER_STATS, { exes })
    expect(line).toMatch(/Mina from \w{3} \d+, 201\d to \w{3} \d+, 201\d/)
  })
})

describe('orientationPoolOf', () => {
  const years: Record<string, number> = { a: 1, b: 1, c: 3, ex: 1 }
  const yearOf = (id: string): number | undefined => years[id]

  it('never offers the ex, whether the pool is the freshmen or everyone', () => {
    expect(orientationPoolOf(['a', 'ex', 'c'], yearOf, 'ex')).toEqual({ pool: ['a'], leader: false })
    expect(orientationPoolOf(['ex', 'c'], yearOf, 'ex')).toEqual({ pool: ['c'], leader: true })
  })

  it('is as it was with no ex', () => {
    expect(orientationPoolOf(['a', 'ex', 'c'], yearOf)).toEqual({ pool: ['a', 'ex'], leader: false })
    expect(orientationPoolOf(['c'], yearOf)).toEqual({ pool: ['c'], leader: true })
  })
})
