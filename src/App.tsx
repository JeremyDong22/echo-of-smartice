// Version: 1.1.0
// Main application component with routing for admin panel
// Added MainLayout wrapper with navigation bar for easy page switching

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { theme } from './theme/theme'
import MainLayout from './components/Layout/MainLayout'
import QRCodeManagementPage from './pages/QRCodeManagement/QRCodeManagementPage'
import QuestionnaireEditorPage from './pages/QuestionnaireEditor/QuestionnaireEditorPage'

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <MainLayout>
          <Routes>
            <Route path="/" element={<Navigate to="/qrcode-management" replace />} />
            <Route path="/qrcode-management" element={<QRCodeManagementPage />} />
            <Route path="/questionnaire-editor" element={<QuestionnaireEditorPage />} />
          </Routes>
        </MainLayout>
      </Router>
    </ThemeProvider>
  )
}

export default App
