// Version: 1.1.0
// Login page component
// v1.1.0: Added "Forgot Password?" functionality with email dialog

import React, { useState } from 'react'
import {
  Box,
  Button,
  Container,
  TextField,
  Typography,
  Paper,
  Alert,
  IconButton,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material'
import { Visibility, VisibilityOff } from '@mui/icons-material'
import { useAuth } from '../../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { sendPasswordResetEmail } from '../../services/authService'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Forgot password dialog state
  const [showForgotPasswordDialog, setShowForgotPasswordDialog] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSuccess, setResetSuccess] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [sendingReset, setSendingReset] = useState(false)

  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { error } = await signIn(email, password)

      if (error) {
        setError(error.message)
        setPassword('') // Clear password on error
      } else {
        // Successful login - navigate to home
        navigate('/')
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = () => {
    setResetEmail(email) // Pre-fill with current email if entered
    setResetSuccess(false)
    setResetError(null)
    setShowForgotPasswordDialog(true)
  }

  const handleSendResetEmail = async () => {
    if (!resetEmail) {
      setResetError('Please enter your email address')
      return
    }

    setSendingReset(true)
    setResetError(null)

    try {
      const { error } = await sendPasswordResetEmail(resetEmail, window.location.origin)

      if (error) {
        setResetError(error.message)
      } else {
        setResetSuccess(true)
      }
    } catch (err) {
      setResetError('Failed to send reset email. Please try again.')
    } finally {
      setSendingReset(false)
    }
  }

  const handleCloseDialog = () => {
    setShowForgotPasswordDialog(false)
    setResetEmail('')
    setResetSuccess(false)
    setResetError(null)
  }

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <Typography variant="h4" component="h1" gutterBottom align="center">
            Admin Login
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            gutterBottom
            align="center"
            sx={{ mb: 3 }}
          >
            EchoOfSmartICE Management Panel
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              label="Email"
              type="email"
              fullWidth
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
              autoComplete="email"
              autoFocus
              disabled={loading}
            />

            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              fullWidth
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              autoComplete="current-password"
              disabled={loading}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ mt: 3 }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>

            <Button
              fullWidth
              variant="text"
              onClick={handleForgotPassword}
              disabled={loading}
              sx={{ mt: 1 }}
            >
              Forgot Password?
            </Button>
          </Box>
        </Paper>
      </Box>

      {/* Forgot Password Dialog */}
      <Dialog open={showForgotPasswordDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Reset Password</DialogTitle>
        <DialogContent>
          {resetSuccess ? (
            <Alert severity="success" sx={{ mt: 2 }}>
              Password reset email sent! Please check your inbox and follow the instructions.
            </Alert>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, mt: 1 }}>
                Enter your email address and we'll send you a link to reset your password.
              </Typography>

              {resetError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {resetError}
                </Alert>
              )}

              <TextField
                label="Email"
                type="email"
                fullWidth
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                autoFocus
                disabled={sendingReset}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleSendResetEmail()
                  }
                }}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          {resetSuccess ? (
            <Button onClick={handleCloseDialog}>Close</Button>
          ) : (
            <>
              <Button onClick={handleCloseDialog} disabled={sendingReset}>
                Cancel
              </Button>
              <Button
                onClick={handleSendResetEmail}
                variant="contained"
                disabled={sendingReset}
              >
                {sendingReset ? 'Sending...' : 'Send Reset Email'}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </Container>
  )
}
