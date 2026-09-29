import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

/** The hand-run simulations, apart from the suite: they report numbers and assert nothing. */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    environment: 'node',
    include: ['scripts/sim/**/*.sim.ts']
  }
})
