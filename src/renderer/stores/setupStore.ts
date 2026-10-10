import { create } from 'zustand'
import type { AppError, ComfyPickOutcome, InstallProgress, SetupStatus } from '@shared/types'
import { useUiStore } from './uiStore'

/** Live per-component install state, keyed by `SetupComponent.id`. */
export interface ComponentProgress {
  step: string
  percent?: number
  bytesDone?: number
  bytesTotal?: number
  done?: boolean
  error?: AppError
}

/** One progress event as the row holds it; both listeners below map alike. */
function progressOf(event: InstallProgress): ComponentProgress {
  return {
    step: event.step,
    percent: event.percent,
    bytesDone: event.bytesDone,
    bytesTotal: event.bytesTotal,
    done: event.done,
    error: event.error
  }
}

interface SetupStoreState {
  status: SetupStatus | null
  checking: boolean
  installing: boolean
  progress: Record<string, ComponentProgress>
  /** What the last pick of another game's ComfyUI came to, until the next one; the screen words `invalid`. */
  pickOutcome: ComfyPickOutcome | null

  /** Asks for another game's folder, and uses its ComfyUI if it is one; verifies again after. */
  chooseComfyRoot: () => Promise<void>
  /** Goes back to this game's own ComfyUI, and verifies again. */
  useOwnComfy: () => Promise<void>
  /** Runs the startup verify pipeline. Called on boot and on user refresh. */
  refresh: () => Promise<void>
  /** Runs the install pipeline; per-component failures surface in progress. */
  install: () => Promise<void>
  /** Reveals the folder a hand-downloaded model belongs in. */
  openModelFolder: (componentId: string) => Promise<void>
  /**
   * Hashes what the player put in that folder and adopts it if it is the pinned file.
   * Reports through the row, never an error modal.
   */
  verifyModel: (componentId: string) => Promise<void>
}

/**
 * Owns every `setup:*` channel.
 */
export const useSetupStore = create<SetupStoreState>((set, get) => ({
  status: null,
  checking: false,
  installing: false,
  progress: {},
  pickOutcome: null,

  chooseComfyRoot: async () => {
    const result = await window.api.setup.chooseComfyRoot()
    if (!result.ok) {
      useUiStore.getState().showError(result.error)
      return
    }
    if (result.data === 'canceled') return
    set({ pickOutcome: result.data })
    if (result.data === 'chosen' || result.data === 'ownAgain') await get().refresh()
  },

  useOwnComfy: async () => {
    const result = await window.api.setup.useOwnComfy()
    if (!result.ok) {
      useUiStore.getState().showError(result.error)
      return
    }
    set({ pickOutcome: null })
    await get().refresh()
  },

  refresh: async () => {
    set({ checking: true })
    const result = await window.api.setup.getStatus()
    // A fresh verify supersedes the previous run's telemetry.
    set({ checking: false, progress: {} })
    if (!result.ok) {
      useUiStore.getState().showFatalError(result.error)
      return
    }
    set({ status: result.data })
  },

  install: async () => {
    if (get().installing) return

    // Cleared so the view can tell "installed earlier" from "installing now".
    set({ installing: true, progress: {} })

    const unsubscribe = window.api.setup.onInstallProgress((event: InstallProgress) => {
      set((state) => ({
        progress: { ...state.progress, [event.componentId]: progressOf(event) }
      }))
    })

    try {
      const result = await window.api.setup.runInstall()
      if (!result.ok) {
        useUiStore.getState().showError(result.error)
        return
      }

      set({ status: result.data.status })
    } finally {
      unsubscribe()
      set({ installing: false })
    }
  },

  openModelFolder: async (componentId) => {
    const result = await window.api.setup.openModelFolder(componentId)
    if (!result.ok) useUiStore.getState().showError(result.error)
  },

  verifyModel: async (componentId) => {
    if (get().installing) return
    // Rides `installing`: hashing a 6.46 GiB weight needs the same lockout an install does.
    set((state) => ({
      installing: true,
      progress: { ...state.progress, [componentId]: { step: 'Verifying' } }
    }))

    const unsubscribe = window.api.setup.onInstallProgress((event: InstallProgress) => {
      set((state) => ({
        progress: { ...state.progress, [event.componentId]: progressOf(event) }
      }))
    })

    try {
      const result = await window.api.setup.verifyModel(componentId)
      if (!result.ok) {
        set((state) => ({
          progress: {
            ...state.progress,
            [componentId]: { step: 'Failed', done: true, error: result.error }
          }
        }))
        return
      }

      // The row now answers from the fresh status, so its progress entry is dropped.
      set((state) => {
        const { [componentId]: _cleared, ...progress } = state.progress
        return { status: result.data, progress }
      })
    } finally {
      unsubscribe()
      set({ installing: false })
    }
  }
}))
