import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
export default defineConfig({
 root: resolve(import.meta.dirname),
 plugins: [react()],
 base: './',
 build: { outDir: resolve(import.meta.dirname, '../montadora'), emptyOutDir: true },
 server: { fs: { allow: [resolve(import.meta.dirname, '..')] } },
})
