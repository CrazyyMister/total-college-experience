/** What this game is called. */
export const GAME_NAME = 'Total College Experience'

/** The version of Venus University this mod is built from. */
export const BASE_GAME_VERSION = '0.2.0'

/** The original game's page, where its developer publishes it. */
export const GAME_PAGE_URL = 'https://venus-dev.itch.io/venus-university'

/** Where this mod's source lives. */
export const MOD_SOURCE_URL = 'https://github.com/CrazyyMister/total-college-experience'

/** The community mod pack whose ideas Breakthrough and the encounters-and-facts memory follow. */
export const MAESTRO_MODS_URL = 'https://github.com/maestromods/maestros-community-mods'

/** Where a donation to the original's developer goes. */
export const KOFI_URL = 'https://ko-fi.com/venusdev'

/** The original's account on X. */
export const X_URL = 'https://x.com/venus_uni_game'

/** The version as the menu prints it: `1.0.0` is `v1.0`, and a patch shows only when it is not 0. */
export function modVersionLabel(version: string): string {
  const [major, minor = '0', patch = '0'] = version.split('.')
  return patch === '0' ? `v${major}.${minor}` : `v${major}.${minor}.${patch}`
}

/** The new-issue page of this mod's source, with the report's headings and the version in them. */
export function newIssueUrl(version: string): string {
  const body = [
    `**Version:** ${GAME_NAME} ${version} (based on Venus University ${BASE_GAME_VERSION})`,
    '**What happened:**',
    '**What you expected:**',
    '**Steps to reproduce:**',
    "(Attach the log you downloaded from the game's Feedback screen.)"
  ].join('\n\n')
  return `${MOD_SOURCE_URL}/issues/new?body=${encodeURIComponent(body)}`
}
