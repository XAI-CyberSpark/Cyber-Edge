import { uiText } from '@/i18n';
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/typography.css'
import './styles/icon-motion.css'
import App from './App.tsx'
import { SiteAccessGate } from './components/ui/SiteAccessGate.tsx'
import { AppProvider } from './context/AppContext.tsx'

const AvatarPreviewPage = lazy(() => import('./components/pages/AvatarPreviewPage.tsx'))
const isAvatarPreview = new URLSearchParams(window.location.search).get('preview') === 'avatar'
const DeveloperDocsPage = lazy(() => import('./components/pages/DeveloperDocsPage.tsx'))
const isDeveloperDocs = /^\/docs\/?$/.test(window.location.pathname)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SiteAccessGate>{isDeveloperDocs ? (
      <Suspense fallback={<div role="status">{uiText("正在加载文档…")}</div>}>
        <DeveloperDocsPage />
      </Suspense>
    ) : isAvatarPreview ? (
      <Suspense fallback={<div role="status">{uiText("正在加载动画对照…")}</div>}>
        <AvatarPreviewPage />
      </Suspense>
    ) : (
      <AppProvider>
        <App />
      </AppProvider>
    )}</SiteAccessGate>
  </StrictMode>,
)
