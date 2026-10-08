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

describe('displaySpriteRef in her team\'s session', () => {
  const all = ['pe', 'swim', 'uniform', 'winter'] as const

  it('puts the team set on her usual clothes, then her PE wear, then what she would wear anyway', () => {
    expect(displaySpriteRef('happy', undefined, [...all], SPRING, 'uniform')).toBe('happy_uniform')
    expect(displaySpriteRef('happy', undefined, ['pe', 'winter'], SPRING, 'uniform')).toBe('happy_pe')
    expect(displaySpriteRef('happy', undefined, ['winter'], SPRING, 'uniform')).toBe('happy')
  })

  it('beats winter in a session, and loses to nothing but a lock or the set the writer chose', () => {
    expect(displaySpriteRef('happy', undefined, [...all], WINTER, 'uniform')).toBe('happy_uniform')
    expect(displaySpriteRef('happy', undefined, [...all], WINTER, 'swim')).toBe('happy_swim')
    expect(displaySpriteRef('happy', undefined, ['pe', 'winter'], WINTER, 'swim')).toBe('happy_pe')
    expect(displaySpriteRef('happy', undefined, ['winter'], WINTER, 'swim')).toBe('happy_winter')
    expect(displaySpriteRef('happy_nude', undefined, [...all], WINTER, 'uniform')).toBe('happy_nude')
    expect(displaySpriteRef('happy', 'nude', [...all, 'nude'], WINTER, 'uniform')).toBe('happy_nude')
  })

  it('treats the default lock as her day clothes: session, then winter, then usual', () => {
    expect(displaySpriteRef('happy_pe', 'default', [...all], WINTER, 'uniform')).toBe('happy_uniform')
    expect(displaySpriteRef('happy_pe', 'default', [...all], WINTER, null)).toBe('happy_winter')
    expect(displaySpriteRef('happy_pe', 'default', [...all], SPRING, null)).toBe('happy')
  })

  it('is what she wears with no team: the same as before the session existed', () => {
    expect(displaySpriteRef('happy', undefined, [...all], WINTER)).toBe('happy_winter')
  })
})
