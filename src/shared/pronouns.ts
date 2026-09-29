import type { Gender } from './types'

/** The pronouns every line about one character is written with, by that character's gender. */
export interface Pronouns {
  /** she / he */
  subject: string
  /** her / him */
  object: string
  /** her / his, before a noun */
  possessive: string
  /** hers / his, standing alone */
  possessiveAlone: string
  /** herself / himself */
  reflexive: string
  /** She / He, opening a sentence */
  Subject: string
  /** Her / His, opening a sentence */
  Possessive: string
}

const WOMAN: Pronouns = {
  subject: 'she',
  object: 'her',
  possessive: 'her',
  possessiveAlone: 'hers',
  reflexive: 'herself',
  Subject: 'She',
  Possessive: 'Her'
}

const MAN: Pronouns = {
  subject: 'he',
  object: 'him',
  possessive: 'his',
  possessiveAlone: 'his',
  reflexive: 'himself',
  Subject: 'He',
  Possessive: 'His'
}

/** The pronouns a character of `gender` is written with. */
export function pronounsOf(gender: Gender): Pronouns {
  return gender === 'man' ? MAN : WOMAN
}

/** What a character of `gender` is called as one of their gender: "girl" or "guy". */
export function kindOf(gender: Gender, plural = false): string {
  if (gender === 'man') return plural ? 'guys' : 'guy'
  return plural ? 'girls' : 'girl'
}
