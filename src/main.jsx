import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerServiceWorker } from './lib/registerServiceWorker'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registered from here rather than an inline script in index.html so it can be limited to
// production builds. In development the worker would cache dev assets and serve stale
// modules back over Vite's hot updates.
registerServiceWorker()
