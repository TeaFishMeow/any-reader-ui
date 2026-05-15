import ReactDOM from 'react-dom/client'
import { App } from './App'
import { applyTheme, themeMode, themeStyle } from './lib/theme'
import 'katex/dist/katex.min.css'
import './index.css'

applyTheme(themeMode(), themeStyle())

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />)
