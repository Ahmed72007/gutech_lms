import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { router } from '@/app/router'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { queryClient } from '@/lib/query-client'
import '@/lib/supabase'
import '@/styles/globals.css'

function ThemedToaster() {
  return <Toaster richColors closeButton position="top-center" toastOptions={{ className: 'font-sans' }} theme={document.documentElement.classList.contains('dark') ? 'dark' : 'light'} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <ThemedToaster />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
