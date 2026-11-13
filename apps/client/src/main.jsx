import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import { queryClient } from './api/queryClient.js'
import { captureTeamPasscodeFromUrl } from './api/demoIdentity.js'
import './index.css'

captureTeamPasscodeFromUrl()

const CHUNK_RELOAD_KEY = 'sheryai:chunk-reload-attempted'

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()

  if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === 'true') {
    console.error('Unable to load the latest application bundle.', event.payload)
    return
  }

  sessionStorage.setItem(CHUNK_RELOAD_KEY, 'true')
  window.location.reload()
})

window.addEventListener('load', () => {
  sessionStorage.removeItem(CHUNK_RELOAD_KEY)
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
