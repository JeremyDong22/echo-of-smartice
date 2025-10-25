// Version: 1.4.0
// Reset password page component
// Handles password reset after user clicks email link
// v1.4.0: Localized to Chinese and added background image for consistent design
// v1.3.0: Cleaned up debug logging after successful password recovery implementation
// v1.2.0: Added verbose console logging for debugging password recovery flow
// v1.1.0: Added session verification and waiting logic for recovery token processing

import React, { useState, useEffect } from 'react'
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
  CircularProgress,
} from '@mui/material'
import { Visibility, VisibilityOff } from '@mui/icons-material'
import { updatePassword } from '../../services/authService'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  const navigate = useNavigate()
  const { session } = useAuth()

  // Wait for Supabase to create session from recovery token
  useEffect(() => {
    let timeoutId: NodeJS.Timeout

    // Check if session exists
    if (session) {
      setSessionReady(true)
      setCheckingSession(false)
      setError(null)
    } else {
      // Wait up to 10 seconds for session to be created from URL hash
      timeoutId = setTimeout(() => {
        if (!session) {
          setCheckingSession(false)
          setError(
            'Auth session missing! The reset link may have expired or already been used. Please request a new password reset email.'
          )
        }
      }, 10000)
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [session])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validation
    if (newPassword.length < 6) {
      setError('密码长度至少为 6 个字符')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不匹配')
      return
    }

    setLoading(true)

    try {
      const { error } = await updatePassword(newPassword)

      if (error) {
        setError(error.message)
      } else {
        setSuccess(true)
        // Redirect to login after 2 seconds
        setTimeout(() => {
          navigate('/login')
        }, 2000)
      }
    } catch (err) {
      setError('密码更新失败，请重试')
    } finally {
      setLoading(false)
    }
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
            重置密码
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            gutterBottom
            align="center"
            sx={{ mb: 3 }}
          >
            请在下方输入您的新密码
          </Typography>

          {/* Show loading while checking for session */}
          {checkingSession && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', my: 4 }}>
              <CircularProgress size={40} sx={{ mb: 2 }} />
              <Typography variant="body2" color="text.secondary">
                正在验证重置链接...
              </Typography>
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              密码更新成功！正在跳转到登录页面...
            </Alert>
          )}

          {!success && !checkingSession && sessionReady && (
            <Box component="form" onSubmit={handleSubmit}>
              <TextField
                label="新密码"
                type={showPassword ? 'text' : 'password'}
                fullWidth
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                margin="normal"
                autoFocus
                disabled={loading}
                helperText="至少 6 个字符"
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

              <TextField
                label="确认新密码"
                type={showPassword ? 'text' : 'password'}
                fullWidth
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                margin="normal"
                disabled={loading}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading}
                sx={{ mt: 3 }}
              >
                {loading ? '更新中...' : '更新密码'}
              </Button>
            </Box>
          )}
        </Paper>
      </Container>
    </Box>
  )
}
