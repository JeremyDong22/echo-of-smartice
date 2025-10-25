// Version: 1.2.0
// Main layout component with navigation bar for switching between admin pages
// v1.2.0: Added logout button with auth context integration

import { ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Container,
} from '@mui/material'
import { QrCode, EditNote, Logout } from '@mui/icons-material'
import { useAuth } from '../../contexts/AuthContext'

interface MainLayoutProps {
  children: ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { signOut } = useAuth()

  const isQRCodePage = location.pathname === '/qrcode-management'
  const isQuestionnairePage = location.pathname === '/questionnaire-editor'

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        backgroundImage: 'url(/background.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        bgcolor: '#1e3a5f', // Fallback color
      }}
    >
      {/* Transparent Navigation Bar with Glassmorphism */}
      <AppBar
        position="static"
        elevation={0}
        sx={{
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)', // Safari support
          borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
        }}
      >
        <Toolbar>
          <Typography
            variant="h6"
            component="div"
            sx={{
              flexGrow: 1,
              color: 'rgba(255, 255, 255, 0.95)',
              fontWeight: 700,
              letterSpacing: '1px',
            }}
          >
            Echo 管理后台
          </Typography>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              color="inherit"
              startIcon={<QrCode />}
              onClick={() => navigate('/qrcode-management')}
              sx={{
                color: 'rgba(255, 255, 255, 0.9)',
                background: isQRCodePage ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                backdropFilter: isQRCodePage ? 'blur(10px)' : 'none',
                border: isQRCodePage ? '1px solid rgba(255, 255, 255, 0.4)' : '1px solid transparent',
                borderRadius: '8px',
                '&:hover': {
                  background: 'rgba(255, 255, 255, 0.25)',
                  backdropFilter: 'blur(10px)',
                },
              }}
            >
              二维码管理
            </Button>
            <Button
              color="inherit"
              startIcon={<EditNote />}
              onClick={() => navigate('/questionnaire-editor')}
              sx={{
                color: 'rgba(255, 255, 255, 0.9)',
                background: isQuestionnairePage ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                backdropFilter: isQuestionnairePage ? 'blur(10px)' : 'none',
                border: isQuestionnairePage ? '1px solid rgba(255, 255, 255, 0.4)' : '1px solid transparent',
                borderRadius: '8px',
                '&:hover': {
                  background: 'rgba(255, 255, 255, 0.25)',
                  backdropFilter: 'blur(10px)',
                },
              }}
            >
              问卷编辑
            </Button>
            <Button
              color="inherit"
              startIcon={<Logout />}
              onClick={handleLogout}
              sx={{
                color: 'rgba(255, 255, 255, 0.9)',
                background: 'transparent',
                border: '1px solid transparent',
                borderRadius: '8px',
                '&:hover': {
                  background: 'rgba(255, 100, 100, 0.3)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                },
              }}
            >
              退出登录
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Main Content with Semi-transparent Container */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          py: 4,
        }}
      >
        <Container
          maxWidth="lg"
          sx={{
            background: 'rgba(255, 255, 255, 0.25)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
            minHeight: 'calc(100vh - 100px)',
            py: 4,
          }}
        >
          {children}
        </Container>
      </Box>
    </Box>
  )
}
