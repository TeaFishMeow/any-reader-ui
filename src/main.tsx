import ReactDOM from 'react-dom/client'
import { LocalReaderApp } from './LocalReaderApp'
import { I18nProvider } from './i18n/I18nProvider'
import { ThemeProvider, initializeThemeDocumentState } from './theme/useTheme'
import './index.css'
import './local-reader.css'

initializeThemeDocumentState()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ThemeProvider>
    <I18nProvider>
      <LocalReaderApp />
    </I18nProvider>
  </ThemeProvider>
)
