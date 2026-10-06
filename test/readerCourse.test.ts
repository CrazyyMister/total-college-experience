import { describe, expect, it } from 'vitest'
import { courseOf, COURSES } from '@shared/courses'
import { DEFAULT_PLAYER_STATS } from '@shared/playerStats'
import { readerText } from '../src/renderer/prompts/setting'

/**
 * The reader's course reaches every prompt through the `READER` block; a game with none must
 * read exactly as one did before the field existed.
 */

describe('readerText with a course', () => {
  const without = readerText('Seth', 'Hawke', DEFAULT_PLAYER_STATS)

  it('says nothing of a course when there is none', () => {
    expect(readerText('Seth', 'Hawke', DEFAULT_PLAYER_STATS, { course: undefined })).toBe(without)
    expect(without).not.toContain('majors')
  })

  it('adds one sentence for the course, and nothing else', () => {
    const withCourse = readerText('Seth', 'Hawke', DEFAULT_PLAYER_STATS, { course: 'Nursing' })
    expect(withCourse.replace(' He majors in Nursing.', '')).toBe(without)
  })
})

describe('courseOf', () => {
  it('knows only the list’s exact names', () => {
    for (const course of COURSES) expect(courseOf(course)).toBe(course)
    expect(courseOf('nursing')).toBeNull()
    expect(courseOf(undefined)).toBeNull()
  })
})
