// Version: 2.0.0
// Main application component with routing and authentication
// v2.0.0: Added authentication with protected routes and password recovery handling

import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { useEffect } from 'react'
import { theme } from './theme/theme'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { supabase } from './services/supabase'
import MainLayout from './components/Layout/MainLayout'
import QRCodeManagementPage from './pages/QRCodeManagement/QRCodeManagementPage'
import QuestionnaireEditorPage from './pages/QuestionnaireEditor/QuestionnaireEditorPage'
import { LoginPage } from './components/Auth/LoginPage'
import { ResetPasswordPage } from './components/Auth/ResetPasswordPage'
import { Box, CircularProgress } from '@mui/material'

// Protected route wrapper - redirects to login if not authenticated
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <CircularProgress />
      </Box>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

// Password recovery listener - redirects to reset page when password recovery link is clicked
function PasswordRecoveryListener() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, _session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User clicked password reset link - redirect to reset password page immediately
        console.log('PASSWORD_RECOVERY event detected, redirecting to /reset-password')
        navigate('/reset-password', { replace: true })
      }
    })

    return () => subscription.unsubscribe()
  }, [navigate])

  // Also check URL hash on mount for recovery type
  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('type=recovery')) {
      console.log('Recovery token detected in URL, navigating to /reset-password')
      navigate('/reset-password', { replace: true })
    }
  }, [location, navigate])

  return null
}

function AppRoutes() {
  const { session } = useAuth()

  return (
    <>
      <PasswordRecoveryListener />
      <Routes>
        {/* Public routes */}
        <Route
          path="/login"
          element={session ? <Navigate to="/qrcode-management" replace /> : <LoginPage />}
        />

        {/* Password reset - accessible to both authenticated and unauthenticated users */}
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Protected admin routes */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <MainLayout>
                <Routes>
                  <Route path="/" element={<Navigate to="/qrcode-management" replace />} />
                  <Route path="/qrcode-management" element={<QRCodeManagementPage />} />
                  <Route path="/questionnaire-editor" element={<QuestionnaireEditorPage />} />
                </Routes>
              </MainLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  )
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </Router>
    </ThemeProvider>
  )
}

export default App
