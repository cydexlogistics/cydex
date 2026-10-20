import { createRoot } from 'react-dom/client'
import './index.css'
import { initPwa } from './lib/pwa'

// Service worker + install prompt (installable app)
initPwa()

const root = document.getElementById('root')!

// The Supabase settings are built into the site when it's built (Vite reads
// them at build time). If the build ran without them, say so on the page
// instead of crashing to a blank screen: on Vercel, add them under
// Settings -> Environment Variables and redeploy.
const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter(
  (name) => !import.meta.env[name as keyof ImportMetaEnv],
)

if (missing.length > 0) {
  root.innerHTML = `
    <div style="max-width:560px;margin:15vh auto;padding:24px;font-family:system-ui,sans-serif;line-height:1.5">
      <h1 style="font-size:20px;margin:0 0 12px">Cydex isn't set up on this deployment yet</h1>
      <p style="margin:0 0 12px">This build is missing: <strong>${missing.join(', ')}</strong>.</p>
      <p style="margin:0">Add them in the hosting settings (on Vercel: Settings &rarr; Environment Variables, for the
      environment being deployed), then redeploy. They're read when the site is built, so changing them needs a new deployment.</p>
    </div>`
  console.error(`Missing build settings: ${missing.join(', ')}`)
} else {
  // Loaded only once the settings are there (the Supabase client is created on import)
  import('./App.tsx').then(({ default: App }) => {
    createRoot(root).render(<App />)
  })
}
