import type { OutfitSet } from './types'

/**
 * The first day of spring: Monday, March 16, when classes resume after the Sunday the spring
 * break leavers are back (`SPRING_BREAK_RETURN` is day 55, and shared code cannot import it from
 * the prompts). The one place the date is written; every reader of the season asks `seasonAt`.
 */
const SEASON_CUTOFF_DAY = 56

/** The season a game day falls in. Days before the semester are winter. */
export function seasonAt(date: number): 'winter' | 'spring' {
  return date < SEASON_CUTOFF_DAY ? 'winter' : 'spring'
}

/**
 * Whether a character wears her winter set on `date`: it is winter and the set is fully
 * rendered, which is what `ready` (her ready sets) says. Tags alone are not enough. The stage,
 * the scene's `Main Outfit:` line and the phone photos all ask this, so they cannot disagree.
 */
export function wearsWinter(date: number, ready: readonly OutfitSet[] | undefined): boolean {
  return seasonAt(date) === 'winter' && ready?.includes('winter') === true
}
