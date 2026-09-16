import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages: сайт публикуется в подкаталог /oneoneeight/
  base: '/oneoneeight/',
  build: {
    rollupOptions: {
      output: {
        // Вендоры — отдельными чанками: параллельная загрузка по HTTP/2
        // и кэширование независимо от кода приложения
        advancedChunks: {
          groups: [
            { name: 'firebase', test: /node_modules\/(firebase|@firebase)\// },
            { name: 'react', test: /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|@remix-run)\// },
            { name: 'motion', test: /node_modules\/(motion|framer-motion)\// },
          ],
        },
      },
    },
  },
})
