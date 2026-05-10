import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { AuthProvider, RequireAuth } from './lib/auth.tsx'
import { ToastProvider } from './components/ui/Toast.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <RequireAuth>
          <App />
        </RequireAuth>
      </ToastProvider>
    </AuthProvider>
  </StrictMode>,
)
