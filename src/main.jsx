import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary'
import { installGlobalErrorLogging } from './lib/errorLog'

// Pasang penangkap error global sebelum render: error JS, Promise gagal, dan
// respons Supabase 4xx/5xx (penolakan RLS per peran) tercatat ke error_log.
installGlobalErrorLogging()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
