// Version: 3.0.0
// Questionnaire Editor Page - Create and edit questionnaires with flexible question types
// Features: Dynamic question builder, multiple choice with 2-5 options, text input, drag-and-drop reordering
// Updated: Complete redesign to support different question types (multiple_choice, text_input) with JSONB storage
// v3.0.0: BREAKING CHANGE - Removed legacy field support (question_1/2/3). Now uses JSONB exclusively. Cleaned up all fallback logic.
// v2.7.0: Translated all UI text to Chinese for better Chinese user experience
// v2.6.0: IMPROVED UX - Restaurant-wide assignments now show detailed success messages with assigned/skipped table counts
// v2.5.0: Added collapsible restaurant sections in assignments with bulk delete functionality
//         - Restaurants are now foldable/expandable by clicking the header
//         - Added DeleteSweep button to remove all assignments for entire restaurant at once
//         - Shows table count badge on each restaurant
//         - Individual table delete buttons still available when expanded
// v2.4.0: Added placeholder text to Label and Value fields; removed default values for both (now empty strings)
//         Label placeholder: "答案"
//         Value placeholder: "数据标识（如：情绪1-5，同义词则留空）"
// v2.3.1: Fixed popup toast z-index issue by wrapping Snackbar in Portal - now appears above Dialog backdrop
// v2.3.0: Added dual notification system - messages appear both as inline alerts AND popup toasts for better visibility
// v2.2.1: Fixed UI not updating immediately after assignment - now refetches assignments to show changes without page refresh
// v2.2.0: Added remove assignment functionality with delete icons; restaurant display now shows address and city
// v2.1.0: Added always-visible assignments section showing which restaurants/tables have each questionnaire assigned
// v2.0.2: Changed default option labels and values to Chinese (label: '选项 1', value: '答案1')
// v2.0.1: Fixed HTML DOM nesting error in ListItemText by setting component='div' for primaryTypographyProps

import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  Switch,
  FormControlLabel,
  Divider,
  Paper,
  Stack,
  Snackbar,
  Portal,
} from '@mui/material'
import {
  Add,
  Edit,
  Delete,
  Assignment,
  Restaurant as RestaurantIcon,
  TableBar,
  DragIndicator,
  RemoveCircleOutline,
  AddCircle,
  ExpandMore,
  ExpandLess,
  DeleteSweep,
} from '@mui/icons-material'
import type {
  Restaurant,
  EchoQuestionnaire,
  TableWithQRCode,
  Question,
  QuestionType,
  QuestionOption,
  QuestionnaireAssignment,
} from '../../types/database'
import { getAllRestaurants } from '../../services/restaurantService'
import { getTablesWithQRCodes } from '../../services/qrcodeService'
import {
  getAllQuestionnaires,
  createQuestionnaire,
  updateQuestionnaire,
  assignQuestionnaireToQRCode,
  assignQuestionnaireToRestaurant,
  validateQuestions,
  getAssignmentsForQuestionnaire,
  removeAssignment,
  removeRestaurantAssignments,
} from '../../services/questionnaireService'

type AssignmentScope = 'restaurant' | 'table'

export default function QuestionnaireEditorPage() {
  const [questionnaires, setQuestionnaires] = useState<EchoQuestionnaire[]>([])
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [loading, setLoading] = useState(false)

  // Inline alert state (replaces old error state)
  const [inlineAlert, setInlineAlert] = useState<{
    show: boolean
    message: string
    severity: 'success' | 'error' | 'warning' | 'info'
  }>({
    show: false,
    message: '',
    severity: 'info',
  })

  const [assignments, setAssignments] = useState<Map<string, QuestionnaireAssignment[]>>(new Map())

  // Track which restaurants are expanded (stores restaurant IDs)
  const [expandedRestaurants, setExpandedRestaurants] = useState<Set<string>>(new Set())

  // Snackbar/Toast notification state
  const [snackbar, setSnackbar] = useState<{
    open: boolean
    message: string
    severity: 'success' | 'error' | 'warning' | 'info'
  }>({
    open: false,
    message: '',
    severity: 'info',
  })

  // Editor dialog state
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingQuestionnaire, setEditingQuestionnaire] = useState<EchoQuestionnaire | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    is_active: true,
  })
  const [questions, setQuestions] = useState<Question[]>([])
  const [saving, setSaving] = useState(false)

  // Assignment dialog state
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [selectedQuestionnaireForAssignment, setSelectedQuestionnaireForAssignment] =
    useState<EchoQuestionnaire | null>(null)
  const [assignmentScope, setAssignmentScope] = useState<AssignmentScope>('restaurant')
  const [selectedRestaurantId, setSelectedRestaurantId] = useState('')
  const [tables, setTables] = useState<TableWithQRCode[]>([])
  const [selectedTableId, setSelectedTableId] = useState('')
  const [assigning, setAssigning] = useState(false)

  // Helper function to show notifications in BOTH inline alert AND popup toast
  const showNotification = (message: string, severity: 'success' | 'error' | 'warning' | 'info') => {
    // Show in inline alert location (top of page)
    setInlineAlert({
      show: true,
      message,
      severity,
    })

    // ALSO show in popup toast
    setSnackbar({
      open: true,
      message,
      severity,
    })
  }

  const handleCloseInlineAlert = () => {
    setInlineAlert({ ...inlineAlert, show: false })
  }

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false })
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedRestaurantId && assignmentScope === 'table') {
      loadTables(selectedRestaurantId)
    }
  }, [selectedRestaurantId, assignmentScope])

  const loadData = async () => {
    try {
      setLoading(true)
      setInlineAlert({ show: false, message: '', severity: 'info' })
      const [questionnairesData, restaurantsData] = await Promise.all([
        getAllQuestionnaires(),
        getAllRestaurants(),
      ])
      setQuestionnaires(questionnairesData)
      setRestaurants(restaurantsData)

      // Fetch assignments for all questionnaires
      const assignmentsMap = new Map<string, QuestionnaireAssignment[]>()
      await Promise.all(
        questionnairesData.map(async (q) => {
          try {
            const assignmentData = await getAssignmentsForQuestionnaire(q.id)
            assignmentsMap.set(q.id, assignmentData)
          } catch (err) {
            // If fetching assignments fails for one questionnaire, continue with others
            console.error(`Failed to load assignments for questionnaire ${q.id}:`, err)
            assignmentsMap.set(q.id, [])
          }
        })
      )
      setAssignments(assignmentsMap)
    } catch (err) {
      showNotification(err instanceof Error ? err.message : '加载数据失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadTables = async (restaurantId: string) => {
    try {
      const tablesData = await getTablesWithQRCodes(restaurantId)
      setTables(tablesData)
    } catch (err) {
      showNotification(err instanceof Error ? err.message : '加载餐桌失败', 'error')
    }
  }

  const handleOpenEditor = (questionnaire?: EchoQuestionnaire) => {
    if (questionnaire) {
      setEditingQuestionnaire(questionnaire)
      setFormData({
        title: questionnaire.title,
        description: questionnaire.description || '',
        is_active: questionnaire.is_active,
      })
      // Load questions from JSONB field
      setQuestions(questionnaire.questions.sort((a, b) => a.order - b.order))
    } else {
      setEditingQuestionnaire(null)
      setFormData({
        title: '',
        description: '',
        is_active: true,
      })
      setQuestions([
        {
          id: generateQuestionId(),
          text: '',
          type: 'text_input',
          order: 1,
        },
      ])
    }
    setEditorOpen(true)
  }

  const handleCloseEditor = () => {
    setEditorOpen(false)
    setEditingQuestionnaire(null)
    setQuestions([])
  }

  const generateQuestionId = () => {
    return `q${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  const handleAddQuestion = () => {
    const newQuestion: Question = {
      id: generateQuestionId(),
      text: '',
      type: 'text_input',
      order: questions.length + 1,
    }
    setQuestions([...questions, newQuestion])
  }

  const handleRemoveQuestion = (questionId: string) => {
    const filtered = questions.filter((q) => q.id !== questionId)
    // Reorder remaining questions
    const reordered = filtered.map((q, index) => ({ ...q, order: index + 1 }))
    setQuestions(reordered)
  }

  const handleUpdateQuestion = (questionId: string, updates: Partial<Question>) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === questionId) {
          const updated = { ...q, ...updates }
          // If type changed to text_input, remove options
          if (updated.type === 'text_input') {
            delete updated.options
          }
          // If type changed to multiple_choice and no options, add default options
          if (updated.type === 'multiple_choice' && !updated.options) {
            updated.options = [
              { label: '', value: '' },
              { label: '', value: '' },
            ]
          }
          return updated
        }
        return q
      })
    )
  }

  const handleAddOption = (questionId: string) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === questionId && q.type === 'multiple_choice') {
          const options = q.options || []
          if (options.length < 5) {
            return {
              ...q,
              options: [
                ...options,
                { label: '', value: '' },
              ],
            }
          }
        }
        return q
      })
    )
  }

  const handleRemoveOption = (questionId: string, optionIndex: number) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === questionId && q.type === 'multiple_choice' && q.options) {
          return {
            ...q,
            options: q.options.filter((_, index) => index !== optionIndex),
          }
        }
        return q
      })
    )
  }

  const handleUpdateOption = (
    questionId: string,
    optionIndex: number,
    updates: Partial<QuestionOption>
  ) => {
    setQuestions(
      questions.map((q) => {
        if (q.id === questionId && q.type === 'multiple_choice' && q.options) {
          return {
            ...q,
            options: q.options.map((opt, index) =>
              index === optionIndex ? { ...opt, ...updates } : opt
            ),
          }
        }
        return q
      })
    )
  }

  const handleSaveQuestionnaire = async () => {
    try {
      setSaving(true)
      setInlineAlert({ show: false, message: '', severity: 'info' })

      // Validate questions
      const validation = validateQuestions(questions)
      if (!validation.valid) {
        showNotification(validation.error || '问题格式无效', 'error')
        return
      }

      // Prepare data for submission
      const questionnaireData = {
        title: formData.title,
        description: formData.description,
        is_active: formData.is_active,
        questions: questions,
      }

      if (editingQuestionnaire) {
        // Update existing
        await updateQuestionnaire(editingQuestionnaire.id, questionnaireData)
        showNotification('问卷更新成功！', 'success')
      } else {
        // Create new
        await createQuestionnaire(questionnaireData)
        showNotification('问卷创建成功！', 'success')
      }

      await loadData()
      handleCloseEditor()
    } catch (err) {
      showNotification(err instanceof Error ? err.message : '保存问卷失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleOpenAssignment = (questionnaire: EchoQuestionnaire) => {
    setSelectedQuestionnaireForAssignment(questionnaire)
    setAssignmentDialogOpen(true)
    setSelectedRestaurantId('')
    setSelectedTableId('')
  }

  const handleCloseAssignment = () => {
    setAssignmentDialogOpen(false)
    setSelectedQuestionnaireForAssignment(null)
    setSelectedRestaurantId('')
    setSelectedTableId('')
  }

  const handleAssignQuestionnaire = async () => {
    if (!selectedQuestionnaireForAssignment) return

    try {
      setAssigning(true)
      setInlineAlert({ show: false, message: '', severity: 'info' })

      if (assignmentScope === 'restaurant') {
        if (!selectedRestaurantId) {
          showNotification('请选择餐厅', 'warning')
          return
        }
        const result = await assignQuestionnaireToRestaurant(
          selectedRestaurantId,
          selectedQuestionnaireForAssignment.id
        )

        // Show detailed success message
        let successMessage = `成功分配问卷到 ${result.assignedCount} 个餐桌！`
        if (result.skippedCount > 0) {
          const skippedTableList = result.skippedTables.map(t => t.table_number).join(', ')
          successMessage += ` (已跳过 ${result.skippedCount} 个已有分配的餐桌：${skippedTableList})`
        }

        // Refresh assignments and close dialog
        const updatedAssignments = await getAssignmentsForQuestionnaire(
          selectedQuestionnaireForAssignment.id
        )
        setAssignments((prev) => {
          const newMap = new Map(prev)
          newMap.set(selectedQuestionnaireForAssignment.id, updatedAssignments)
          return newMap
        })

        handleCloseAssignment()
        showNotification(successMessage, 'success')
        return
      } else {
        // table scope
        if (!selectedTableId) {
          showNotification('请选择餐桌', 'warning')
          return
        }
        const table = tables.find((t) => t.id === selectedTableId)
        if (!table) {
          showNotification('未找到餐桌', 'error')
          return
        }

        // Handle both object and array formats for echo_qrcode
        let qrcodeId: string | null = null
        const qrcode = table.echo_qrcode
        if (qrcode) {
          if (Array.isArray(qrcode) && qrcode.length > 0) {
            qrcodeId = qrcode[0]?.id || null
          } else if (typeof qrcode === 'object' && 'id' in qrcode) {
            qrcodeId = qrcode.id
          }
        }

        if (!qrcodeId) {
          showNotification('该餐桌没有二维码，请先生成', 'warning')
          return
        }

        await assignQuestionnaireToQRCode(
          qrcodeId,
          selectedQuestionnaireForAssignment.id
        )
      }

      // Refresh assignments for this questionnaire to update UI immediately
      const updatedAssignments = await getAssignmentsForQuestionnaire(
        selectedQuestionnaireForAssignment.id
      )
      setAssignments((prev) => {
        const newMap = new Map(prev)
        newMap.set(selectedQuestionnaireForAssignment.id, updatedAssignments)
        return newMap
      })

      handleCloseAssignment()
      showNotification('问卷分配成功！', 'success')
    } catch (err) {
      showNotification(err instanceof Error ? err.message : '分配问卷失败', 'error')
    } finally {
      setAssigning(false)
    }
  }

  const handleRemoveAssignment = async (assignmentId: string, questionnaireId: string, restaurantName: string, tableNumber: string) => {
    if (!confirm(`确定要移除 ${restaurantName} - 餐桌 ${tableNumber} 的问卷分配吗？`)) {
      return
    }

    try {
      setInlineAlert({ show: false, message: '', severity: 'info' })
      await removeAssignment(assignmentId)

      // Refresh assignments for this questionnaire
      const updatedAssignments = await getAssignmentsForQuestionnaire(questionnaireId)
      setAssignments((prev) => {
        const newMap = new Map(prev)
        newMap.set(questionnaireId, updatedAssignments)
        return newMap
      })

      showNotification('分配移除成功！', 'success')
    } catch (err) {
      showNotification(err instanceof Error ? err.message : '移除分配失败', 'error')
    }
  }

  const handleToggleRestaurant = (restaurantId: string) => {
    setExpandedRestaurants((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(restaurantId)) {
        newSet.delete(restaurantId)
      } else {
        newSet.add(restaurantId)
      }
      return newSet
    })
  }

  const handleRemoveRestaurantAssignments = async (
    questionnaireId: string,
    restaurantId: string,
    restaurantName: string,
    tableCount: number
  ) => {
    if (
      !confirm(
        `确定要移除 ${restaurantName} 的所有 ${tableCount} 个问卷分配吗？\n\n这将删除该餐厅所有餐桌的分配。`
      )
    ) {
      return
    }

    try {
      setInlineAlert({ show: false, message: '', severity: 'info' })
      const removedCount = await removeRestaurantAssignments(questionnaireId, restaurantId)

      // Refresh assignments for this questionnaire
      const updatedAssignments = await getAssignmentsForQuestionnaire(questionnaireId)
      setAssignments((prev) => {
        const newMap = new Map(prev)
        newMap.set(questionnaireId, updatedAssignments)
        return newMap
      })

      showNotification(
        `成功从 ${restaurantName} 移除了 ${removedCount} 个分配！`,
        'success'
      )
    } catch (err) {
      showNotification(
        err instanceof Error ? err.message : '移除餐厅分配失败',
        'error'
      )
    }
  }

  const renderQuestionTypeLabel = (type: QuestionType) => {
    return type === 'multiple_choice' ? '多选题' : '文本输入'
  }

  return (
    <>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          问卷编辑器
        </Typography>
        <Typography variant="body1" color="text.secondary">
          创建和编辑具有灵活问题类型的问卷
        </Typography>
      </Box>

      {/* Add New Button */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" startIcon={<Add />} onClick={() => handleOpenEditor()}>
          创建新问卷
        </Button>
      </Box>

      {/* Inline Alert Display - shows all message types (success, error, warning, info) */}
      {inlineAlert.show && (
        <Alert severity={inlineAlert.severity} sx={{ mb: 3 }} onClose={handleCloseInlineAlert}>
          {inlineAlert.message}
        </Alert>
      )}

      {/* Questionnaires List */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : questionnaires.length === 0 ? (
        <Alert severity="info">未找到问卷。创建您的第一个问卷吧！</Alert>
      ) : (
        <Grid container spacing={3}>
          {questionnaires.map((questionnaire) => {
            const displayQuestions = questionnaire.questions

            return (
              <Grid item xs={12} key={questionnaire.id}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                      <Box>
                        <Typography variant="h6">{questionnaire.title}</Typography>
                        {questionnaire.description && (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            {questionnaire.description}
                          </Typography>
                        )}
                      </Box>
                      <Chip
                        label={questionnaire.is_active ? '启用' : '禁用'}
                        color={questionnaire.is_active ? 'success' : 'default'}
                        size="small"
                      />
                    </Box>

                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        问题 ({displayQuestions.length}):
                      </Typography>
                      <List dense>
                        {displayQuestions
                          .sort((a, b) => a.order - b.order)
                          .map((question, index) => (
                            <ListItem key={question.id}>
                              <ListItemText
                                primary={
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="body2">
                                      {index + 1}. {question.text}
                                    </Typography>
                                    <Chip
                                      label={renderQuestionTypeLabel(question.type)}
                                      size="small"
                                      variant="outlined"
                                      sx={{ height: 20 }}
                                    />
                                  </Box>
                                }
                                secondary={
                                  question.type === 'multiple_choice' && question.options
                                    ? `选项：${question.options.map((o) => o.label).join('、')}`
                                    : null
                                }
                                primaryTypographyProps={{ variant: 'body2', component: 'div' }}
                                secondaryTypographyProps={{ variant: 'caption' }}
                              />
                            </ListItem>
                          ))}
                      </List>
                    </Box>

                    {/* Assignments Section */}
                    <Box sx={{ mb: 2, bgcolor: 'grey.50', p: 2, borderRadius: 1 }}>
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        已分配：
                      </Typography>
                      {(() => {
                        const questionnaireAssignments = assignments.get(questionnaire.id) || []
                        if (questionnaireAssignments.length === 0) {
                          return (
                            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                              未分配到任何餐桌
                            </Typography>
                          )
                        }
                        return (
                          <List dense disablePadding>
                            {questionnaireAssignments.map((assignment) => {
                              // Format restaurant name with address and city
                              const restaurantDisplay = [
                                assignment.restaurant_name,
                                assignment.restaurant_address,
                                assignment.restaurant_city,
                              ]
                                .filter(Boolean)
                                .join(', ')

                              const isExpanded = expandedRestaurants.has(assignment.restaurant_id)

                              return (
                                <ListItem key={assignment.restaurant_id} sx={{ py: 0.5, px: 0, flexDirection: 'column', alignItems: 'flex-start' }}>
                                  {/* Restaurant header with expand/collapse and bulk delete */}
                                  <Box
                                    sx={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 1,
                                      width: '100%',
                                      mb: isExpanded ? 0.5 : 0,
                                      cursor: 'pointer',
                                      '&:hover': { bgcolor: 'action.hover' },
                                      borderRadius: 1,
                                      px: 1,
                                      py: 0.5,
                                    }}
                                    onClick={() => handleToggleRestaurant(assignment.restaurant_id)}
                                  >
                                    {/* Expand/Collapse Icon */}
                                    {isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}

                                    <RestaurantIcon fontSize="small" color="action" />

                                    <Typography variant="body2" sx={{ flex: 1 }}>
                                      <strong>{restaurantDisplay}</strong>
                                    </Typography>

                                    {/* Table count badge */}
                                    <Chip
                                      label={`${assignment.tables.length} 个餐桌`}
                                      size="small"
                                      sx={{ height: 20, fontSize: '0.7rem' }}
                                    />

                                    {/* Bulk delete button */}
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={(e) => {
                                        e.stopPropagation() // Prevent toggling when clicking delete
                                        handleRemoveRestaurantAssignments(
                                          questionnaire.id,
                                          assignment.restaurant_id,
                                          assignment.restaurant_name,
                                          assignment.tables.length
                                        )
                                      }}
                                      sx={{ ml: 1 }}
                                      title="删除该餐厅的所有分配"
                                    >
                                      <DeleteSweep fontSize="small" />
                                    </IconButton>
                                  </Box>

                                  {/* Individual table assignments - only show when expanded */}
                                  {isExpanded && (
                                    <Box sx={{ pl: 4, width: '100%', mt: 0.5 }}>
                                      {assignment.tables.map((table) => (
                                        <Box
                                          key={table.qrcode_id}
                                          sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            py: 0.25
                                          }}
                                        >
                                          <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <TableBar fontSize="small" sx={{ fontSize: '0.9rem' }} />
                                            餐桌 {table.table_number}
                                          </Typography>
                                          <IconButton
                                            size="small"
                                            color="error"
                                            onClick={() => handleRemoveAssignment(
                                              table.assignment_id,
                                              questionnaire.id,
                                              assignment.restaurant_name,
                                              table.table_number
                                            )}
                                            sx={{ ml: 1 }}
                                            title="删除该餐桌的分配"
                                          >
                                            <Delete fontSize="small" />
                                          </IconButton>
                                        </Box>
                                      ))}
                                    </Box>
                                  )}
                                </ListItem>
                              )
                            })}
                          </List>
                        )
                      })()}
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        startIcon={<Edit />}
                        onClick={() => handleOpenEditor(questionnaire)}
                      >
                        编辑
                      </Button>
                      <Button
                        size="small"
                        startIcon={<Assignment />}
                        onClick={() => handleOpenAssignment(questionnaire)}
                      >
                        分配
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            )
          })}
        </Grid>
      )}

      {/* Editor Dialog */}
      <Dialog open={editorOpen} onClose={handleCloseEditor} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingQuestionnaire ? '编辑问卷' : '创建新问卷'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Basic Info */}
            <TextField
              label="问卷标题"
              fullWidth
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
            <TextField
              label="描述（可选）"
              fullWidth
              multiline
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                />
              }
              label="启用"
            />

            <Divider />

            {/* Questions Builder */}
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">问题</Typography>
                <Button
                  size="small"
                  startIcon={<Add />}
                  onClick={handleAddQuestion}
                  variant="outlined"
                >
                  添加问题
                </Button>
              </Box>

              <Stack spacing={2}>
                {questions.map((question, index) => (
                  <Paper key={question.id} sx={{ p: 2, bgcolor: 'grey.50' }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 2 }}>
                      <DragIndicator sx={{ color: 'text.disabled', mt: 1 }} />
                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                          <TextField
                            label={`问题 ${index + 1}`}
                            fullWidth
                            value={question.text}
                            onChange={(e) =>
                              handleUpdateQuestion(question.id, { text: e.target.value })
                            }
                            required
                          />
                          <FormControl sx={{ minWidth: 150 }}>
                            <InputLabel>类型</InputLabel>
                            <Select
                              value={question.type}
                              onChange={(e) =>
                                handleUpdateQuestion(question.id, {
                                  type: e.target.value as QuestionType,
                                })
                              }
                              label="类型"
                            >
                              <MenuItem value="text_input">文本输入</MenuItem>
                              <MenuItem value="multiple_choice">多选题</MenuItem>
                            </Select>
                          </FormControl>
                        </Box>

                        {/* Multiple Choice Options */}
                        {question.type === 'multiple_choice' && (
                          <Box sx={{ ml: 2, mt: 2 }}>
                            <Typography variant="subtitle2" gutterBottom>
                              答案选项（2-5个）
                            </Typography>
                            <Stack spacing={1}>
                              {question.options?.map((option, optIndex) => (
                                <Box key={optIndex} sx={{ display: 'flex', gap: 1 }}>
                                  <TextField
                                    size="small"
                                    label="标签"
                                    value={option.label}
                                    onChange={(e) =>
                                      handleUpdateOption(question.id, optIndex, {
                                        label: e.target.value,
                                      })
                                    }
                                    placeholder="答案"
                                    sx={{ flex: 1 }}
                                  />
                                  <TextField
                                    size="small"
                                    label="值"
                                    value={option.value}
                                    onChange={(e) =>
                                      handleUpdateOption(question.id, optIndex, {
                                        value: e.target.value,
                                      })
                                    }
                                    placeholder="数据标识（如：情绪1-5，同义词则留空）"
                                    sx={{ flex: 1 }}
                                  />
                                  <IconButton
                                    size="small"
                                    onClick={() => handleRemoveOption(question.id, optIndex)}
                                    disabled={question.options!.length <= 2}
                                    color="error"
                                  >
                                    <RemoveCircleOutline />
                                  </IconButton>
                                </Box>
                              ))}
                              {(question.options?.length || 0) < 5 && (
                                <Button
                                  size="small"
                                  startIcon={<AddCircle />}
                                  onClick={() => handleAddOption(question.id)}
                                  sx={{ alignSelf: 'flex-start' }}
                                >
                                  添加选项
                                </Button>
                              )}
                            </Stack>
                          </Box>
                        )}
                      </Box>
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveQuestion(question.id)}
                        disabled={questions.length <= 1}
                        color="error"
                      >
                        <Delete />
                      </IconButton>
                    </Box>
                  </Paper>
                ))}
              </Stack>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEditor}>取消</Button>
          <Button
            onClick={handleSaveQuestionnaire}
            variant="contained"
            disabled={saving || !formData.title || questions.length === 0}
          >
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Assignment Dialog */}
      <Dialog open={assignmentDialogOpen} onClose={handleCloseAssignment} maxWidth="sm" fullWidth>
        <DialogTitle>分配问卷</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Typography variant="body2" color="text.secondary">
              将"{selectedQuestionnaireForAssignment?.title}"分配到：
            </Typography>

            {/* Scope Selection */}
            <FormControl fullWidth>
              <InputLabel>分配范围</InputLabel>
              <Select
                value={assignmentScope}
                onChange={(e) => {
                  setAssignmentScope(e.target.value as AssignmentScope)
                  setSelectedTableId('')
                }}
                label="分配范围"
              >
                <MenuItem value="restaurant">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <RestaurantIcon fontSize="small" />
                    整个餐厅（所有餐桌）
                  </Box>
                </MenuItem>
                <MenuItem value="table">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TableBar fontSize="small" />
                    指定餐桌
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>

            {/* Restaurant Selection */}
            <FormControl fullWidth>
              <InputLabel>选择餐厅</InputLabel>
              <Select
                value={selectedRestaurantId}
                onChange={(e) => setSelectedRestaurantId(e.target.value)}
                label="选择餐厅"
              >
                {restaurants.map((restaurant) => (
                  <MenuItem key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}
                    {restaurant.address && `, ${restaurant.address}`}
                    {restaurant.city && `, ${restaurant.city}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Table Selection (only if scope is table) */}
            {assignmentScope === 'table' && selectedRestaurantId && (
              <FormControl fullWidth>
                <InputLabel>选择餐桌</InputLabel>
                <Select
                  value={selectedTableId}
                  onChange={(e) => setSelectedTableId(e.target.value)}
                  label="选择餐桌"
                >
                  {tables.map((table) => (
                    <MenuItem key={table.id} value={table.id}>
                      餐桌 {table.table_number}
                      {!table.echo_qrcode && (
                        <Chip label="无二维码" size="small" color="warning" sx={{ ml: 1 }} />
                      )}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAssignment}>取消</Button>
          <Button
            onClick={handleAssignQuestionnaire}
            variant="contained"
            disabled={
              assigning ||
              !selectedRestaurantId ||
              (assignmentScope === 'table' && !selectedTableId)
            }
          >
            {assigning ? '分配中...' : '确认分配'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Popup Toast Notification - rendered in Portal to body for proper z-index stacking */}
      <Portal>
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
          sx={{
            zIndex: 99999, // Force to be on top of everything
            marginTop: '80px', // Position it below the header/navbar
          }}
        >
          <Alert
            onClose={handleCloseSnackbar}
            severity={snackbar.severity}
            variant="filled"
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Portal>
    </>
  )
}
