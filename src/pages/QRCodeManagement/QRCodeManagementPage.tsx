// Version: 2.1.0
// QR Code Management Page - Generate and manage QR codes for restaurant tables
// Features: Restaurant selection, table list, QR code generation, regeneration, download functionality
// Updated: Changed restaurant display format to show name, address, and city for better distinction

import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  Grid,
  Button,
  CircularProgress,
  Alert,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material'
import { QrCode, Download, Add, Refresh, Warning } from '@mui/icons-material'
import type { Restaurant, TableWithQRCode } from '../../types/database'
import { getAllRestaurants } from '../../services/restaurantService'
import {
  getTablesWithQRCodes,
  generateQRCodeForTable,
  generateQRCodeImage,
  downloadQRCode,
  createTable,
  regenerateQRCodeForTable,
} from '../../services/qrcodeService'

export default function QRCodeManagementPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string>('')
  const [tables, setTables] = useState<TableWithQRCode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatingQRCodeForTable, setGeneratingQRCodeForTable] = useState<string | null>(null)
  const [qrCodeImages, setQrCodeImages] = useState<Record<string, string>>({})

  // Dialog for adding new table
  const [addTableDialogOpen, setAddTableDialogOpen] = useState(false)
  const [newTableNumber, setNewTableNumber] = useState<string>('A1')
  const [creatingTable, setCreatingTable] = useState(false)

  // Dialog for regenerating QR code
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false)
  const [tableToRegenerate, setTableToRegenerate] = useState<TableWithQRCode | null>(null)
  const [regeneratingQRCode, setRegeneratingQRCode] = useState(false)

  // Load restaurants on mount
  useEffect(() => {
    loadRestaurants()
  }, [])

  // Load tables when restaurant is selected
  useEffect(() => {
    if (selectedRestaurantId) {
      loadTables()
    } else {
      setTables([])
    }
  }, [selectedRestaurantId])

  const loadRestaurants = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getAllRestaurants()
      setRestaurants(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load restaurants')
    } finally {
      setLoading(false)
    }
  }

  const loadTables = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getTablesWithQRCodes(selectedRestaurantId)
      setTables(data)

      // Generate QR code images for existing QR codes
      const images: Record<string, string> = {}
      for (const table of data) {
        if (table.echo_qrcode) {
          images[table.id] = await generateQRCodeImage(table.echo_qrcode.qr_code_value)
        }
      }
      setQrCodeImages(images)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tables')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateQRCode = async (tableId: string) => {
    try {
      setGeneratingQRCodeForTable(tableId)
      setError(null)

      const { qrCodeData, imageUrl } = await generateQRCodeForTable(tableId)

      // Update the table in the list
      setTables((prevTables) =>
        prevTables.map((table) =>
          table.id === tableId
            ? { ...table, echo_qrcode: qrCodeData }
            : table
        )
      )

      // Save the image URL
      setQrCodeImages((prev) => ({ ...prev, [tableId]: imageUrl }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate QR code')
    } finally {
      setGeneratingQRCodeForTable(null)
    }
  }

  const handleDownloadQRCode = (tableId: string, tableNumber: string) => {
    const imageUrl = qrCodeImages[tableId]
    if (imageUrl) {
      const restaurant = restaurants.find((r) => r.id === selectedRestaurantId)
      const filename = `${restaurant?.name || 'restaurant'}-table-${tableNumber}-qrcode.png`
      downloadQRCode(imageUrl, filename)
    }
  }

  const handleAddTable = async () => {
    try {
      setCreatingTable(true)
      setError(null)

      await createTable(selectedRestaurantId, newTableNumber)

      // Reload tables
      await loadTables()

      // Close dialog and reset form
      setAddTableDialogOpen(false)
      setNewTableNumber('A1')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create table')
    } finally {
      setCreatingTable(false)
    }
  }

  const handleOpenRegenerateDialog = (table: TableWithQRCode) => {
    setTableToRegenerate(table)
    setRegenerateDialogOpen(true)
  }

  const handleRegenerateQRCode = async () => {
    if (!tableToRegenerate || !tableToRegenerate.echo_qrcode) {
      return
    }

    try {
      setRegeneratingQRCode(true)
      setError(null)

      const existingQRCode = tableToRegenerate.echo_qrcode
      const { qrCodeData, imageUrl } = await regenerateQRCodeForTable(
        tableToRegenerate.id,
        existingQRCode.id
      )

      // Update the table in the list
      setTables((prevTables) =>
        prevTables.map((table) =>
          table.id === tableToRegenerate.id
            ? { ...table, echo_qrcode: qrCodeData }
            : table
        )
      )

      // Update the image URL
      setQrCodeImages((prev) => ({ ...prev, [tableToRegenerate.id]: imageUrl }))

      // Close dialog
      setRegenerateDialogOpen(false)
      setTableToRegenerate(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate QR code')
    } finally {
      setRegeneratingQRCode(false)
    }
  }

  const selectedRestaurant = restaurants.find((r) => r.id === selectedRestaurantId)

  return (
    <>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          二维码管理
        </Typography>
        <Typography variant="body1" color="text.secondary">
          为每个餐厅的每个桌子生成和管理二维码
        </Typography>
      </Box>

      {/* Restaurant Selection */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <FormControl fullWidth>
            <InputLabel>选择餐厅</InputLabel>
            <Select
              value={selectedRestaurantId}
              onChange={(e) => setSelectedRestaurantId(e.target.value)}
              label="选择餐厅"
            >
              {restaurants.map((restaurant) => (
                <MenuItem key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}{restaurant.address && `, ${restaurant.address}`}{restaurant.city && `, ${restaurant.city}`}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Tables Grid */}
      {selectedRestaurantId && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h5">
              {selectedRestaurant?.name} - 桌位列表
            </Typography>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => setAddTableDialogOpen(true)}
            >
              添加桌位
            </Button>
          </Box>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : tables.length === 0 ? (
            <Alert severity="info">该餐厅暂无桌位，请先添加桌位。</Alert>
          ) : (
            <Grid container spacing={3}>
              {tables.map((table) => {
                const hasQRCode = !!table.echo_qrcode
                const qrCodeImage = qrCodeImages[table.id]
                const isGenerating = generatingQRCodeForTable === table.id

                return (
                  <Grid item xs={12} sm={6} md={4} key={table.id}>
                    <Card>
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                          <Typography variant="h6">桌号 {table.table_number}</Typography>
                          <Chip
                            label={hasQRCode ? '已生成' : '未生成'}
                            color={hasQRCode ? 'success' : 'default'}
                            size="small"
                          />
                        </Box>

                        {qrCodeImage && (
                          <Box
                            sx={{
                              mb: 2,
                              textAlign: 'center',
                              p: 2,
                              bgcolor: 'background.default',
                              borderRadius: 1,
                            }}
                          >
                            <img
                              src={qrCodeImage}
                              alt={`Table ${table.table_number} QR Code`}
                              style={{ width: '100%', maxWidth: 200 }}
                            />
                          </Box>
                        )}

                        <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column' }}>
                          {!hasQRCode ? (
                            <Button
                              variant="contained"
                              startIcon={isGenerating ? <CircularProgress size={20} /> : <QrCode />}
                              onClick={() => handleGenerateQRCode(table.id)}
                              disabled={isGenerating}
                              fullWidth
                            >
                              {isGenerating ? '生成中...' : '生成二维码'}
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="contained"
                                startIcon={<Download />}
                                onClick={() => handleDownloadQRCode(table.id, table.table_number)}
                                fullWidth
                              >
                                下载二维码
                              </Button>
                              <Button
                                variant="outlined"
                                color="warning"
                                startIcon={<Refresh />}
                                onClick={() => handleOpenRegenerateDialog(table)}
                                fullWidth
                              >
                                重新生成
                              </Button>
                            </>
                          )}
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                )
              })}
            </Grid>
          )}
        </>
      )}

      {/* Add Table Dialog */}
      <Dialog open={addTableDialogOpen} onClose={() => setAddTableDialogOpen(false)}>
        <DialogTitle>添加新桌位</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="桌号 (格式: A1, B2, C3)"
            type="text"
            fullWidth
            value={newTableNumber}
            onChange={(e) => setNewTableNumber(e.target.value.toUpperCase())}
            placeholder="A1"
            helperText="请输入字母+数字组合，例如：A1, B2, C3"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddTableDialogOpen(false)}>取消</Button>
          <Button
            onClick={handleAddTable}
            variant="contained"
            disabled={creatingTable}
          >
            {creatingTable ? '创建中...' : '确认添加'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Regenerate QR Code Confirmation Dialog */}
      <Dialog
        open={regenerateDialogOpen}
        onClose={() => !regeneratingQRCode && setRegenerateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Warning color="error" />
          重新生成二维码确认
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            <strong>警告：此操作不可撤销！</strong>
          </Alert>
          <Typography variant="body1" paragraph>
            您即将为 <strong>桌号 {tableToRegenerate?.table_number}</strong> 重新生成二维码。
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            重新生成二维码将会：
          </Typography>
          <Box component="ul" sx={{ color: 'text.secondary', pl: 2 }}>
            <li>
              <Typography variant="body2">删除旧的二维码记录</Typography>
            </li>
            <li>
              <Typography variant="body2">生成全新的二维码</Typography>
            </li>
            <li>
              <Typography variant="body2" color="error.main" fontWeight="bold">
                使桌子上已打印的旧二维码失效
              </Typography>
            </li>
            <li>
              <Typography variant="body2" color="error.main" fontWeight="bold">
                需要重新打印并更换实体二维码
              </Typography>
            </li>
          </Box>
          <Alert severity="warning" sx={{ mt: 2 }}>
            <Typography variant="body2">
              请确保您已准备好重新打印并更换桌子上的二维码，否则顾客将无法扫码。
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRegenerateDialogOpen(false)} disabled={regeneratingQRCode}>
            取消
          </Button>
          <Button
            onClick={handleRegenerateQRCode}
            variant="contained"
            color="error"
            disabled={regeneratingQRCode}
            startIcon={regeneratingQRCode ? <CircularProgress size={20} /> : <Refresh />}
          >
            {regeneratingQRCode ? '重新生成中...' : '确认重新生成'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
