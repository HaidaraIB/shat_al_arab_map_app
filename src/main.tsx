import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { AuthProvider, RequireAuth } from './lib/auth.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RequireAuth>
        <App />
      </RequireAuth>
    </AuthProvider>
  </StrictMode>,
)
