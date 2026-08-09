import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router'
import './index.css'
import App from './App.tsx'
import Overview from './routes/Overview.tsx'
import Sessions from './routes/Sessions.tsx'
import Analytics from './routes/Analytics.tsx'
import CodeAuthorship from './routes/CodeAuthorship.tsx'
import Workspaces from './routes/Workspaces.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
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
