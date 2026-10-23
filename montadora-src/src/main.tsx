import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
createRoot(document.getElementById('root')!).render(<StrictMode><nav aria-label="DTF UV Studio" className="studio-nav"><strong>DTF UV Studio</strong><a href="../">Calculadora e orçamentos</a><a href="./" aria-current="page">Montadora de artes</a></nav><App /></StrictMode>)
