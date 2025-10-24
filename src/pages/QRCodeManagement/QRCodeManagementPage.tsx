// Version: 2.6.0
// QR Code Management Page - Generate and manage QR codes for restaurant tables
// Features: Restaurant selection, table list, QR code generation, regeneration, download functionality, table deletion
// v2.6.0: Improved button layout - regenerate and delete buttons now side-by-side in one row
// v2.5.0: Added delete table functionality with confirmation dialog and CASCADE delete handling
// v2.4.0: Removed input format restrictions - now supports Chinese characters and any format for table numbers
// v2.3.0: Fixed critical bug - echo_qrcode is a single object (not array) for 1:1 relationships, updated all references
// v2.2.0: Fixed bug - hasQRCode check now properly validates echo_qrcode array length instead of just checking truthiness
// v2.1.0: Changed restaurant display format to show name, address, and city for better distinction

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
import { QrCode, Download, Add, Refresh, Warning, Delete } from '@mui/icons-material'
import type { Restaurant, TableWithQRCode } from '../../types/database'
import { getAllRestaurants } from '../../services/restaurantService'
import {
  getTablesWithQRCodes,
  generateQRCodeForTable,
  generateQRCodeImage,
  downloadQRCode,
  createTable,
  regenerateQRCodeForTable,
  deleteTable,
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
  const [newTableNumber, setNewTableNumber] = useState<string>('')
  const [creatingTable, setCreatingTable] = useState(false)

  // Dialog for regenerating QR code
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false)
  const [tableToRegenerate, setTableToRegenerate] = useState<TableWithQRCode | null>(null)
  const [regeneratingQRCode, setRegeneratingQRCode] = useState(false)

  // Dialog for deleting table
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [tableToDelete, setTableToDelete] = useState<TableWithQRCode | null>(null)
  const [deletingTable, setDeletingTable] = useState(false)

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
        // echo_qrcode is a single object (not array) for 1:1 relationships
        if (table.echo_qrcode && table.echo_qrcode.qr_code_value) {
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

      // Update the table in the list (echo_qrcode is a single object, not array)
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
      setNewTableNumber('')
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
    // echo_qrcode is a single object (not array) for 1:1 relationships
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

      // Update the table in the list (echo_qrcode is a single object, not array)
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

  const handleOpenDeleteDialog = (table: TableWithQRCode) => {
    setTableToDelete(table)
    setDeleteDialogOpen(true)
  }

  const handleDeleteTable = async () => {
    if (!tableToDelete) {
      return
    }

    try {
      setDeletingTable(true)
      setError(null)

      await deleteTable(tableToDelete.id)

      // Remove table from local state
      setTables((prevTables) => prevTables.filter((table) => table.id !== tableToDelete.id))

      // Remove QR code image from local state
      setQrCodeImages((prev) => {
        const updated = { ...prev }
        delete updated[tableToDelete.id]
        return updated
      })

      // Close dialog
      setDeleteDialogOpen(false)
      setTableToDelete(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete table')
    } finally {
      setDeletingTable(false)
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
                // echo_qrcode is a single object (not array) for 1:1 relationships
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
                            <>
                              <Button
                                variant="contained"
                                startIcon={isGenerating ? <CircularProgress size={20} /> : <QrCode />}
                                onClick={() => handleGenerateQRCode(table.id)}
                                disabled={isGenerating}
                                fullWidth
                              >
                                {isGenerating ? '生成中...' : '生成二维码'}
                              </Button>
                              <Button
                                variant="outlined"
                                color="error"
                                startIcon={<Delete />}
                                onClick={() => handleOpenDeleteDialog(table)}
                                fullWidth
                              >
                                删除桌位
                              </Button>
                            </>
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
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                                <Button
                                  variant="outlined"
                                  color="warning"
                                  startIcon={<Refresh />}
                                  onClick={() => handleOpenRegenerateDialog(table)}
                                  sx={{ flex: 1 }}
                                >
                                  重新生成
                                </Button>
                                <Button
                                  variant="outlined"
                                  color="error"
                                  startIcon={<Delete />}
                                  onClick={() => handleOpenDeleteDialog(table)}
                                  sx={{ flex: 1 }}
                                >
                                  删除桌位
                                </Button>
                              </Box>
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
            label="桌号"
            type="text"
            fullWidth
            value={newTableNumber}
            onChange={(e) => setNewTableNumber(e.target.value)}
            placeholder="例如：包间123、A1、8号桌"
            helperText="支持中文、字母、数字及任意组合，同一餐厅内不能重复"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddTableDialogOpen(false)}>取消</Button>
          <Button
            onClick={handleAddTable}
            variant="contained"
            disabled={creatingTable || !newTableNumber.trim()}
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

      {/* Delete Table Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => !deletingTable && setDeleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Warning color="error" />
          删除桌位确认
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            <strong>警告：此操作不可撤销！所有数据将永久删除！</strong>
          </Alert>
          <Typography variant="body1" paragraph>
            您即将删除 <strong>桌号 {tableToDelete?.table_number}</strong>。
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            删除桌位将会永久删除以下所有数据：
          </Typography>
          <Box component="ul" sx={{ color: 'text.secondary', pl: 2 }}>
            <li>
              <Typography variant="body2" color="error.main" fontWeight="bold">
                桌位记录
              </Typography>
            </li>
            <li>
              <Typography variant="body2" color="error.main" fontWeight="bold">
                关联的二维码
              </Typography>
            </li>
            <li>
              <Typography variant="body2" color="error.main" fontWeight="bold">
                所有问卷分配记录
              </Typography>
            </li>
            <li>
              <Typography variant="body2" color="error.main" fontWeight="bold">
                该桌位的所有顾客反馈数据
              </Typography>
            </li>
          </Box>
          <Alert severity="error" sx={{ mt: 2 }}>
            <Typography variant="body2" fontWeight="bold">
              删除后无法恢复！请确认您真的要删除这个桌位及其所有历史数据。
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deletingTable}>
            取消
          </Button>
          <Button
            onClick={handleDeleteTable}
            variant="contained"
            color="error"
            disabled={deletingTable}
            startIcon={deletingTable ? <CircularProgress size={20} /> : <Delete />}
          >
            {deletingTable ? '删除中...' : '确认删除'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
