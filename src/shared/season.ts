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
