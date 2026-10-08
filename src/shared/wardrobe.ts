import { wearsWinter } from './season'
import type { OutfitSet } from './types'

/**
 * The set that stands in place of her usual clothes right now, or null for her usual clothes.
 * `team` is the set her team puts her in while her scene is at the place of her team's session,
 * and null outside it. In a session she wears that set when it is fully rendered, her PE wear
 * when it is not, and otherwise what she would wear anyway: her winter set while it is winter.
 * The stage, the scene's `Main Outfit:` line and her phone photos all ask this, so they cannot
 * disagree.
 */
export function wornSetOf(
  date: number,
  ready: readonly OutfitSet[] | undefined,
  team: OutfitSet | null
): OutfitSet | null {
  if (team !== null) {
    if (ready?.includes(team)) return team
    if (ready?.includes('pe')) return 'pe'
  }
  return wearsWinter(date, ready) ? 'winter' : null
}
