import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // pdfmake, its fonts and html-to-docx are large but only load on first export.
    chunkSizeWarningLimit: 2000,
  },
})
