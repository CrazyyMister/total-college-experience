/**
 * The one seam between a character's image and a URL an `<img>` can take: main serves her
 * folder over `charimg://`.
 */

/** The URL for one of a character's images; `version` busts the cache after a regeneration. */
export function imageUrl(charId: string, rel: string, version = 0, staged = false): string {
  return `charimg://${charId}/${staged ? 'staging/' : ''}${rel}?v=${version}`
}
