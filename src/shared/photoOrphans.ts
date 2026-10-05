import { photoFileName, readMessagePhoto } from './photos'

/** The part of a chat message that decides which photo files a save keeps alive. */
export interface PhotoMessage {
  id: string
  photo?: unknown
}

/** One save of a playthrough as the sweep reads it: its messages, or null where it did not read. */
export interface PhotoSave {
  saveId: string
  messages: readonly PhotoMessage[] | null
}

/** What a sweep of one playthrough decided: the orphans, or the save that stopped it. */
export type OrphanSweep = { orphans: string[] } | { refused: string }

/**
 * The `.png` files in a playthrough's photos folder that no save names, or the first save that
 * did not read, in which case nothing is an orphan. A photo field that does not read whole keeps
 * every file of its message, whatever its version or name.
 */
export function photoOrphans(saves: readonly PhotoSave[], files: readonly string[]): OrphanSweep {
  const named = new Set<string>()
  const keptMessages: string[] = []
  for (const save of saves) {
    if (save.messages === null) return { refused: save.saveId }
    for (const message of save.messages) {
      if (message.photo === undefined) continue
      const photo = readMessagePhoto(message.photo)
      const file =
        photo === null
          ? null
          : photoFileName({ messageId: message.id, seed: photo.seed, prompts: photo.prompts })
      if (file === null) keptMessages.push(`${message.id}-`)
      else named.add(file)
    }
  }
  return {
    orphans: files.filter(
      (file) =>
        file.endsWith('.png') &&
        !named.has(file) &&
        !keptMessages.some((prefix) => file.startsWith(prefix))
    )
  }
}
