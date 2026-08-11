import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router'
import './index.css'
import App from './App.tsx'
import Overview from './routes/Overview.tsx'
import Live from './routes/Live.tsx'
import Sessions from './routes/Sessions.tsx'
import Analytics from './routes/Analytics.tsx'
import CodeAuthorship from './routes/CodeAuthorship.tsx'
import Workspaces from './routes/Workspaces.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      // The SSE stream (useLiveUpdates) is the primary freshness signal;
      // this interval is the safety net for when it's reconnecting or the
      // browser throttled it in a background tab.
      refetchInterval: 15_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<App />}>
            <Route index element={<Overview />} />
            <Route path="live" element={<Live />} />
            <Route path="sessions" element={<Sessions />} />
            <Route path="sessions/:id" element={<Sessions />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="code-authorship" element={<CodeAuthorship />} />
            <Route path="workspaces" element={<Workspaces />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
