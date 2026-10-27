import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import '../../assets/brand.css'
import brandLogo from '../../assets/dtfuvmania-logo.jpg'
createRoot(document.getElementById('root')!).render(<StrictMode><nav aria-label="DTF UV Studio" className="studio-nav"><img className="brand-logo" src={brandLogo} alt="DTF UV Mania" /><strong>DTF UV Studio</strong><a href="../">Calculadora e orçamentos</a><a href="./" aria-current="page">Montadora de artes</a></nav><App /></StrictMode>)
