import { describe, expect, it } from 'vitest'
import { blankSheet, isWritten, newCharacter, readCharacterRecord } from '@shared/characterRules'
import { EMOTIONS } from '@shared/emotions'
import { WOMAN } from './fixtures'

/**
 * `blankSheet` is the one place a Skip-LLM character becomes a sheet the player can open and
 * fill in by hand; a field it leaves wrong is one nothing downstream will ever catch.
 */

describe('blankSheet', () => {
  it('writes a blank, unbriefed sheet the player fills in by hand', () => {
    const character = newCharacter('Ann', 'Lee', WOMAN, {
      prompt: 'x',
      namesAreSuggestions: false,
      options: {},
      reference: false
    })

    const sheet = blankSheet(character, 'quiet', 'standing')

    expect(isWritten(sheet)).toBe(true)
    expect(sheet.personality).toBe('quiet')
    expect(sheet.pose).toBe('standing')
    expect(sheet.preferredStat).toBe('body')
    expect('brief' in sheet).toBe(false)
    for (const emotion of EMOTIONS) {
      expect(sheet.expressionTags[emotion].length).toBeGreaterThan(0)
    }
  })
})

/**
 * `readCharacterRecord` is how a record an older build wrote reaches this one; one read wrong
 * is a silent corruption nothing downstream catches.
 */

describe('readCharacterRecord', () => {
  /**
   * A written record at `schemaVersion`, with only the appearance the test gives her; one older
   * than version 4 carries no gender or attraction, as the builds that wrote it did not.
   */
  function stored(schemaVersion: number, baseAppearance: string[]): unknown {
    const { gender: _gender, attractedTo: _attractedTo, ...older } = newCharacter('Ann', 'Lee', WOMAN)
    return schemaVersion >= 4
      ? { ...newCharacter('Ann', 'Lee', WOMAN), schemaVersion, baseAppearance }
      : { ...older, schemaVersion, baseAppearance }
  }

  it('reads a version-2 record as version 4, the subject tags in front of her appearance', () => {
    const { character, upgraded } = readCharacterRecord(stored(2, ['long_hair']), 'x')

    expect(upgraded).toBe(true)
    expect(character.schemaVersion).toBe(4)
    expect(character.baseAppearance).toEqual(['1girl', 'mature_female', 'long_hair'])
    expect(character.gender).toBe('woman')
    expect(character.attractedTo).toBe('man')
  })

  it('adds only the subject tags a version-2 record lacks', () => {
    const { character } = readCharacterRecord(stored(2, ['mature_female', 'long_hair']), 'x')

    expect(character.baseAppearance).toEqual(['1girl', 'mature_female', 'long_hair'])
  })

  it('reads a version-3 record without 1boy as a woman drawn to men, her appearance untouched', () => {
    const { character, upgraded } = readCharacterRecord(stored(3, ['long_hair']), 'x')

    expect(upgraded).toBe(true)
    expect(character.schemaVersion).toBe(4)
    expect(character.gender).toBe('woman')
    expect(character.attractedTo).toBe('man')
    expect(character.baseAppearance).toEqual(['long_hair'])
  })

  it('reads a version-3 record with 1boy as a man drawn to women, led by a man’s subject tags alone', () => {
    const { character } = readCharacterRecord(
      stored(3, ['1girl', 'mature_female', '1boy', 'male_focus', 'short_hair']),
      'x'
    )

    expect(character.gender).toBe('man')
    expect(character.attractedTo).toBe('woman')
    expect(character.baseAppearance).toEqual(['1boy', 'male_focus', 'short_hair'])
  })

  it('leaves a version-4 record as it is', () => {
    const { character, upgraded } = readCharacterRecord(stored(4, ['long_hair']), 'x')

    expect(upgraded).toBe(false)
    expect(character.baseAppearance).toEqual(['long_hair'])
  })

  it('refuses a version-1 record by its version', () => {
    expect(() => readCharacterRecord(stored(1, ['long_hair']), 'x')).toThrowError(
      expect.objectContaining({ code: 'CHARACTER_SCHEMA_VERSION' })
    )
  })
})
