import { mayHaveAdultArt } from './characterRules'
import { isPosition } from './positions'
import { parseSpriteRef, spriteRef } from './outfits'
import type { Gender, OutfitSet, Position, SetTarget, SpriteRef } from './types'

/**
 * What the stage shows instead of the explicit images, when `noNsfwImages` is set, and which
 * render targets that setting withholds outright.
 */

/**
 * Whether a render target is withheld: the nude wardrobe and the CGs, under `noNsfwImages` or
 * for a character of a gender that has no adult art.
 */
export function sfwWithholds(target: SetTarget, noNsfwImages: boolean, gender: Gender): boolean {
  return (noNsfwImages || !mayHaveAdultArt(gender)) && (target === 'nude' || target === 'cgs')
}

/** Why a withheld set is locked, for the cover it is drawn behind. */
export function withheldReason(gender: Gender): string {
  return mayHaveAdultArt(gender) ? 'Hidden by SFW setting' : 'Not available for men'
}

/** The wardrobe a substitution keeps her in: whatever her sticky reference is already wearing. */
function keptSetOf(current: SpriteRef | undefined): OutfitSet | null {
  if (!current || isPosition(current)) return null
  const parsed = parseSpriteRef(current)
  if (!parsed || parsed.set === 'nude') return null
  return parsed.set
}

/**
 * A `sprite:` reference with the nude set taken out of it: her expression changes and her
 * clothes do not.
 */
export function sfwSpriteRefOf(ref: SpriteRef, current: SpriteRef | undefined): SpriteRef {
  const parsed = parseSpriteRef(ref)
  if (!parsed || parsed.set !== 'nude') return ref
  return spriteRef(parsed.emotion, keptSetOf(current))
}

/**
 * What stands in for a CG: the same girl in the same clothes, wearing the mood the CG was for.
 */
export function sfwCgRefOf(position: Position, current: SpriteRef | undefined): SpriteRef {
  return spriteRef(position.endsWith('_after') ? 'happy' : 'aroused', keptSetOf(current))
}
