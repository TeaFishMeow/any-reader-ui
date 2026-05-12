import ReactDOM from 'react-dom/client'
import { App } from './App'
import { I18nProvider } from './i18n/I18nProvider'
import { AuthSessionProvider } from './lib/auth-session'
import { registerPwaServiceWorker } from './lib/pwa'
import { ThemeProvider, initializeThemeDocumentState } from './theme/useTheme'
import './index.css'

registerPwaServiceWorker()
initializeThemeDocumentState()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ThemeProvider>
    <I18nProvider>
      <AuthSessionProvider>
        <App />
      </AuthSessionProvider>
    </I18nProvider>
  </ThemeProvider>
)
