import { describe, expect, it, vi } from 'vitest'
import {
  buildClassPrompt,
  validateClassDraft,
  type ClassGenReply
} from '../src/renderer/prompts/classPrompt'
import { freeClassCode } from '../src/shared/classes'
import { character } from './fixtures'

/**
 * The class-catalog validator's code-collision repair — two courses under one
 * code would overwrite each other in the save's `classes` record, since a
 * course code is that record's key.
 */

describe('validateClassDraft', () => {
  it('renumbers a duplicate catalog code instead of failing the reply', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const roster = [character({ charId: 'char-1', firstName: 'Sarah', lastName: 'Rose' })]
    const draft: ClassGenReply = {
      characters: {
        sarah_rose: {
          major: 'Biology',
          majorClassesTaken: 2,
          interestClass: { code: 'MUS 150', name: 'Choir', description: 'Singing.' }
        }
      },
      classes: [
        {
          code: 'BIO 210',
          name: 'Cell Biology',
          description: 'Cells.',
          category: 'major',
          major: 'Biology',
          kind: 'lecture'
        },
        {
          code: 'BIO 210',
          name: 'Genetics',
          description: 'Genes.',
          category: 'major',
          major: 'Biology',
          kind: 'lecture'
        }
      ]
    }

    const out = validateClassDraft(draft, roster)
    expect(out.classes).toHaveLength(3)
    expect(out.classes[0].code).toBe('BIO 210')
    expect(out.classes[1].code).toBe('BIO 211')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('renumbers past an interest class that collides with the catalog', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const roster = [character({ charId: 'char-1', firstName: 'Sarah', lastName: 'Rose' })]
    const draft: ClassGenReply = {
      characters: {
        sarah_rose: {
          major: 'Biology',
          majorClassesTaken: 2,
          interestClass: { code: 'ART 101', name: 'Pots', description: 'Pots.' }
        }
      },
      classes: [
        {
          code: 'ART 101',
          name: 'Drawing',
          description: 'Drawing.',
          category: 'arts',
          kind: 'project'
        },
        {
          code: 'ART 102',
          name: 'Painting',
          description: 'Painting.',
          category: 'arts',
          kind: 'project'
        },
        {
          code: 'BIO 210',
          name: 'Cell Biology',
          description: 'Cells.',
          category: 'major',
          major: 'Biology',
          kind: 'lecture'
        }
      ]
    }

    const out = validateClassDraft(draft, roster)
    expect(out.classes).toHaveLength(4)
    const interest = out.classes.find((c) => c.category === 'interest')
    expect(interest?.code).toBe('ART 103')
    expect(new Set(out.classes.map((c) => c.code)).size).toBe(4)
    warn.mockRestore()
  })
})

/** A reply whose one student studies `npcMajor`, with the given number of major classes under each name. */
function replyWith(npcMajor: string, offered: Record<string, number>): ClassGenReply {
  const classes: ClassGenReply['classes'] = []
  for (const [major, count] of Object.entries(offered)) {
    for (let i = 0; i < count; i++) {
      classes.push({
        code: `${major.trim().slice(0, 3).toUpperCase()} ${100 + i}`,
        name: `${major} ${i}`,
        description: 'A course.',
        category: 'major',
        major,
        kind: 'lecture'
      })
    }
  }
  return {
    characters: {
      sarah_rose: {
        major: npcMajor,
        majorClassesTaken: 2,
        interestClass: { code: 'MUS 150', name: 'Choir', description: 'Singing.' }
      }
    },
    classes
  }
}

describe('validateClassDraft with the reader’s course', () => {
  const roster = [character({ charId: 'char-1', firstName: 'Sarah', lastName: 'Rose' })]
  const COURSE = 'Business Administration'

  it('accepts a reply that offers the course with its four classes', () => {
    const out = validateClassDraft(replyWith('Biology', { Biology: 4, [COURSE]: 4 }), roster, COURSE)
    expect(out.classes.filter((c) => c.major === COURSE)).toHaveLength(4)
  })

  it('refuses a reply that leaves the course out, or offers fewer than four of it', () => {
    expect(() => validateClassDraft(replyWith('Biology', { Biology: 4 }), roster, COURSE)).toThrow()
    expect(() =>
      validateClassDraft(replyWith('Biology', { Biology: 4, [COURSE]: 3 }), roster, COURSE)
    ).toThrow()
  })

  it('writes the list’s own name for a course that differs only in case and spacing, on a class and on a student', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const reply = replyWith(' Business  Administration ', {
      'business administration': 2,
      ' Business  Administration ': 2
    })
    // The two spellings would share codes; the repair renumbers them.
    const out = validateClassDraft(reply, roster, COURSE)
    expect(out.classes.filter((c) => c.major === COURSE)).toHaveLength(4)
    expect(out.characters.sarah_rose.major).toBe(COURSE)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('keeps an abbreviation as a course of its own', () => {
    const out = validateClassDraft(
      replyWith('Business Admin.', { 'Business Admin.': 4, [COURSE]: 4 }),
      roster,
      COURSE
    )
    expect(out.characters.sarah_rose.major).toBe('Business Admin.')
  })

  it('leaves the text above the divider as it is with no course', () => {
    // A course the fixed preamble never names, so its presence is the line's alone.
    const without = buildClassPrompt(roster).user
    const withCourse = buildClassPrompt(roster, 'Nursing').user
    expect(withCourse.split('---')[0]).toBe(without.split('---')[0])
    expect(withCourse).toContain('Nursing')
    expect(without).not.toContain('Nursing')
  })
})

describe('freeClassCode', () => {
  it('appends the first number to a bare code', () => {
    expect(freeClassCode('BIO', () => false)).toBe('BIO 101')
  })

  it('bumps a taken trailing number, width preserved', () => {
    expect(freeClassCode('CS 099', (c) => c === 'CS 099')).toBe('CS 100')
  })
})
