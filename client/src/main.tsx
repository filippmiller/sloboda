import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#141414',
            border: '1px solid #222222',
            color: '#e0e0e0',
            fontFamily: "'Golos Text', sans-serif",
          },
        }}
      />
    </BrowserRouter>
  </StrictMode>,
)
