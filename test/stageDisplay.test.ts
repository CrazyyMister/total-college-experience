import { describe, expect, it } from 'vitest'
import { displaySpriteRef } from '../src/renderer/stores/stageDisplay'

/**
 * The wardrobe lock is applied at draw time and never written down, so what it resolves to is
 * the only thing standing between a locked stage and a sprite that has no file.
 */

/** Day 55 is the last of winter; day 56 is the first of spring. */
const WINTER = 55
const SPRING = 56

describe('displaySpriteRef', () => {
  it('moves a sprite into a locked set only where that set is rendered', () => {
    expect(displaySpriteRef('happy', 'custom1', ['custom1'], SPRING)).toBe('happy_custom1')
    expect(displaySpriteRef('happy', 'custom1', [], SPRING)).toBe('happy')
  })

  it('strips the suffix under the default lock', () => {
    expect(displaySpriteRef('happy_pe', 'default', ['pe'], SPRING)).toBe('happy')
  })

  it('leaves a CG alone under any lock', () => {
    expect(displaySpriteRef('sex', 'custom1', ['custom1'], WINTER)).toBe('sex')
    expect(displaySpriteRef('sex', 'default', ['pe', 'winter'], WINTER)).toBe('sex')
  })

  it('puts her usual clothes in her winter set only while it is winter and rendered', () => {
    expect(displaySpriteRef('happy', undefined, ['winter'], WINTER)).toBe('happy_winter')
    expect(displaySpriteRef('happy', 'default', ['pe', 'winter'], WINTER)).toBe('happy_winter')
    expect(displaySpriteRef('happy', undefined, [], WINTER)).toBe('happy')
    expect(displaySpriteRef('happy', undefined, ['winter'], SPRING)).toBe('happy')
    expect(displaySpriteRef('happy_pe', undefined, ['pe', 'winter'], WINTER)).toBe('happy_pe')
    expect(displaySpriteRef('happy', 'pe', ['pe', 'winter'], WINTER)).toBe('happy_pe')
  })
})
