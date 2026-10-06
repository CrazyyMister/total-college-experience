/**
 * The courses the reader may major in, chosen on New Game's roster screen. Append-only: a
 * playthrough stores the exact name, so a later stage can recognise it in any save. The
 * courses an NPC studies are free text and have nothing to do with this list.
 */
export const COURSES = [
  'Business Administration',
  'Economics',
  'Psychology',
  'Communications',
  'English Literature',
  'History',
  'Political Science',
  'Computer Science',
  'Mechanical Engineering',
  'Biology',
  'Nursing',
  'Kinesiology',
  'Fine Arts',
  'Music',
  'Film Studies'
] as const

export type Course = (typeof COURSES)[number]

/** A name as it is compared: trimmed, runs of whitespace collapsed to one space, lowercased. */
function squashedName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Whether two names are the same course, differing at most in case and spacing. */
export function sameCourseName(a: string, b: string): boolean {
  return squashedName(a) === squashedName(b)
}

/** The list's own name for what a save or a field holds, or null where it is not on the list. */
export function courseOf(value: unknown): Course | null {
  if (typeof value !== 'string') return null
  return COURSES.find((course) => course === value) ?? null
}
