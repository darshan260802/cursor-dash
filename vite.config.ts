import path from 'node:path'
import {defineConfig} from 'vite'
import react, {reactCompilerPreset} from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from "@tailwindcss/vite";

const backendPort = process.env.CURSOR_DASH_API_PORT || 7788

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        tailwindcss(),
        react(),
        babel({presets: [reactCompilerPreset()]})
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    server: {
        proxy: {
            '/api': `http://127.0.0.1:${backendPort}`,
        },
    },
})
