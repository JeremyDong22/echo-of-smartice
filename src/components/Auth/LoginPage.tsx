// Version: 1.2.0
// Login page component
// v1.2.0: Localized to Chinese and added background image for consistent design
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
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundImage: 'url(/background.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        bgcolor: '#1e3a5f',
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={3}
          sx={{
            p: 4,
            width: '100%',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            borderRadius: '16px',
          }}
        >
          <Typography variant="h4" component="h1" gutterBottom align="center">
            管理员登录
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            gutterBottom
            align="center"
            sx={{ mb: 3 }}
          >
            EchoOfSmartICE 管理后台
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              label="邮箱"
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
              label="密码"
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
                      aria-label="切换密码可见性"
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
              {loading ? '登录中...' : '登录'}
            </Button>

            <Button
              fullWidth
              variant="text"
              onClick={handleForgotPassword}
              disabled={loading}
              sx={{ mt: 1 }}
            >
              忘记密码？
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>

      {/* Forgot Password Dialog */}
      <Dialog open={showForgotPasswordDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>重置密码</DialogTitle>
        <DialogContent>
          {resetSuccess ? (
            <Alert severity="success" sx={{ mt: 2 }}>
              密码重置邮件已发送！请检查您的收件箱并按照说明操作。
            </Alert>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, mt: 1 }}>
                输入您的邮箱地址，我们将发送重置密码的链接给您。
              </Typography>

              {resetError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {resetError}
                </Alert>
              )}

              <TextField
                label="邮箱"
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
            <Button onClick={handleCloseDialog}>关闭</Button>
          ) : (
            <>
              <Button onClick={handleCloseDialog} disabled={sendingReset}>
                取消
              </Button>
              <Button
                onClick={handleSendResetEmail}
                variant="contained"
                disabled={sendingReset}
              >
                {sendingReset ? '发送中...' : '发送重置邮件'}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
  )
}
