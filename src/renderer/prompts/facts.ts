import { pronounsOf } from '@shared/pronouns'
import { FACT_ABOUT_READER, type Character, type CharInfo, type Fact } from '@shared/types'
import { companyOf } from './encounters'

/**
 * A fact as a sentence: who it is about, then its words; one only said opens "<Name> said that
 * <she> …". Null when the person it is about is not in `people`.
 */
export function factSentence(
  fact: Fact,
  people: Readonly<Record<string, Character>>
): string | null {
  const subject = fact.about === FACT_ABOUT_READER ? undefined : people[fact.about]
  if (fact.about !== FACT_ABOUT_READER && !subject) return null
  const name = subject ? subject.firstName : 'The reader'
  if (fact.kind === 'happened') return `${name} ${fact.text}`
  return `${name} said that ${subject ? pronounsOf(subject.gender).subject : 'he'} ${fact.text}`
}

/** The note a secret carries: who in the scene, by the code's reckoning, must not hear it. */
function secretNote(
  fact: Fact,
  holder: Character,
  cast: readonly Character[],
  people: Readonly<Record<string, Character>>,
  charInfo: Readonly<Record<string, CharInfo>>
): string {
  const outsiders = cast
    .filter((other) => other.charId !== holder.charId && !fact.knownBy.includes(other.charId))
    .map((other) => other.charId)
  if (outsiders.length === 0) return ' (A secret.)'
  return ` (A secret: never bring it up or let it show in front of ${companyOf(outsiders, people, charInfo)}, who do not know it.)`
}

/**
 * The facts a character knows under their own heading, oldest first; none, no heading. A fact
 * only said is told as her hearing it said, never as true, and a secret names who in the scene
 * must not be let in on it.
 */
export function factLines(
  character: Character,
  facts: readonly Fact[],
  cast: readonly Character[],
  people: Readonly<Record<string, Character>>,
  charInfo: Readonly<Record<string, CharInfo>>
): string[] {
  const lines = facts.flatMap((fact) => {
    const sentence = factSentence(fact, people)
    if (!sentence) return []
    const note =
      fact.category === 'secrets' ? secretNote(fact, character, cast, people, charInfo) : ''
    return [`- ${sentence}.${note}`]
  })
  if (lines.length === 0) return []
  const p = pronounsOf(character.gender)
  return [
    `${character.firstName}'s Facts:`,
    `What ${p.subject} knows about the people around ${p.object}, from what ${p.subject} has seen and been told. A fact that says someone "said that" is only their word: ${p.subject} cannot know it is true or that it happened.`,
    ...lines
  ]
}
