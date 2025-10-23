// Version: 2.6.0
// Questionnaire Editor Page - Create and edit questionnaires with flexible question types
// Features: Dynamic question builder, multiple choice with 2-5 options, text input, drag-and-drop reordering
// Updated: Complete redesign to support different question types (multiple_choice, text_input) with JSONB storage
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
      showNotification(err instanceof Error ? err.message : 'Failed to load data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadTables = async (restaurantId: string) => {
    try {
      const tablesData = await getTablesWithQRCodes(restaurantId)
      setTables(tablesData)
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Failed to load tables', 'error')
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
      // Load questions from JSONB field, fallback to legacy fields if empty
      if (questionnaire.questions && questionnaire.questions.length > 0) {
        setQuestions(questionnaire.questions.sort((a, b) => a.order - b.order))
      } else {
        // Convert legacy format to new format
        setQuestions([
          {
            id: 'q1',
            text: questionnaire.question_1 || '',
            type: 'text_input',
            order: 1,
          },
          {
            id: 'q2',
            text: questionnaire.question_2 || '',
            type: 'text_input',
            order: 2,
          },
          {
            id: 'q3',
            text: questionnaire.question_3 || '',
            type: 'text_input',
            order: 3,
          },
        ])
      }
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
        showNotification(validation.error || 'Invalid questions', 'error')
        return
      }

      // Prepare data for submission
      const questionnaireData = {
        title: formData.title,
        description: formData.description,
        is_active: formData.is_active,
        questions: questions,
        // Keep legacy fields for backward compatibility (use first 3 questions)
        question_1: questions[0]?.text || '',
        question_2: questions[1]?.text || '',
        question_3: questions[2]?.text || '',
      }

      if (editingQuestionnaire) {
        // Update existing
        await updateQuestionnaire(editingQuestionnaire.id, questionnaireData)
        showNotification('Questionnaire updated successfully!', 'success')
      } else {
        // Create new
        await createQuestionnaire(questionnaireData)
        showNotification('Questionnaire created successfully!', 'success')
      }

      await loadData()
      handleCloseEditor()
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Failed to save questionnaire', 'error')
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
          showNotification('Please select a restaurant', 'warning')
          return
        }
        const result = await assignQuestionnaireToRestaurant(
          selectedRestaurantId,
          selectedQuestionnaireForAssignment.id
        )

        // Show detailed success message
        let successMessage = `Successfully assigned questionnaire to ${result.assignedCount} table(s)!`
        if (result.skippedCount > 0) {
          const skippedTableList = result.skippedTables.map(t => t.table_number).join(', ')
          successMessage += ` (Skipped ${result.skippedCount} table(s) that already have assignments: ${skippedTableList})`
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
          showNotification('Please select a table', 'warning')
          return
        }
        const table = tables.find((t) => t.id === selectedTableId)
        if (!table) {
          showNotification('Table not found', 'error')
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
          showNotification('Table has no QR code, please generate one first', 'warning')
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
      showNotification('Questionnaire assigned successfully!', 'success')
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Failed to assign questionnaire', 'error')
    } finally {
      setAssigning(false)
    }
  }

  const handleRemoveAssignment = async (assignmentId: string, questionnaireId: string, restaurantName: string, tableNumber: string) => {
    if (!confirm(`Remove this questionnaire assignment from ${restaurantName} - Table ${tableNumber}?`)) {
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

      showNotification('Assignment removed successfully!', 'success')
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Failed to remove assignment', 'error')
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
        `Remove ALL ${tableCount} questionnaire assignments from ${restaurantName}?\n\nThis will delete assignments for all tables in this restaurant.`
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
        `Successfully removed ${removedCount} assignment${removedCount !== 1 ? 's' : ''} from ${restaurantName}!`,
        'success'
      )
    } catch (err) {
      showNotification(
        err instanceof Error ? err.message : 'Failed to remove restaurant assignments',
        'error'
      )
    }
  }

  const renderQuestionTypeLabel = (type: QuestionType) => {
    return type === 'multiple_choice' ? 'Multiple Choice' : 'Text Input'
  }

  return (
    <>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Questionnaire Editor
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Create and edit questionnaires with flexible question types
        </Typography>
      </Box>

      {/* Add New Button */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" startIcon={<Add />} onClick={() => handleOpenEditor()}>
          Create New Questionnaire
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
        <Alert severity="info">No questionnaires found. Create your first one!</Alert>
      ) : (
        <Grid container spacing={3}>
          {questionnaires.map((questionnaire) => {
            const displayQuestions =
              questionnaire.questions && questionnaire.questions.length > 0
                ? questionnaire.questions
                : [
                    { id: 'q1', text: questionnaire.question_1, type: 'text_input' as QuestionType, order: 1 },
                    { id: 'q2', text: questionnaire.question_2, type: 'text_input' as QuestionType, order: 2 },
                    { id: 'q3', text: questionnaire.question_3, type: 'text_input' as QuestionType, order: 3 },
                  ]

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
                        label={questionnaire.is_active ? 'Active' : 'Inactive'}
                        color={questionnaire.is_active ? 'success' : 'default'}
                        size="small"
                      />
                    </Box>

                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        Questions ({displayQuestions.length}):
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
                                    ? `Options: ${question.options.map((o) => o.label).join(', ')}`
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
                        Assignments:
                      </Typography>
                      {(() => {
                        const questionnaireAssignments = assignments.get(questionnaire.id) || []
                        if (questionnaireAssignments.length === 0) {
                          return (
                            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                              Not assigned to any tables
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
                                      label={`${assignment.tables.length} table${assignment.tables.length !== 1 ? 's' : ''}`}
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
                                      title="Delete all assignments for this restaurant"
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
                                            Table {table.table_number}
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
                                            title="Delete this table assignment"
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
                        Edit
                      </Button>
                      <Button
                        size="small"
                        startIcon={<Assignment />}
                        onClick={() => handleOpenAssignment(questionnaire)}
                      >
                        Assign
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
          {editingQuestionnaire ? 'Edit Questionnaire' : 'Create New Questionnaire'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Basic Info */}
            <TextField
              label="Questionnaire Title"
              fullWidth
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
            <TextField
              label="Description (optional)"
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
              label="Active"
            />

            <Divider />

            {/* Questions Builder */}
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Questions</Typography>
                <Button
                  size="small"
                  startIcon={<Add />}
                  onClick={handleAddQuestion}
                  variant="outlined"
                >
                  Add Question
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
                            label={`Question ${index + 1}`}
                            fullWidth
                            value={question.text}
                            onChange={(e) =>
                              handleUpdateQuestion(question.id, { text: e.target.value })
                            }
                            required
                          />
                          <FormControl sx={{ minWidth: 150 }}>
                            <InputLabel>Type</InputLabel>
                            <Select
                              value={question.type}
                              onChange={(e) =>
                                handleUpdateQuestion(question.id, {
                                  type: e.target.value as QuestionType,
                                })
                              }
                              label="Type"
                            >
                              <MenuItem value="text_input">Text Input</MenuItem>
                              <MenuItem value="multiple_choice">Multiple Choice</MenuItem>
                            </Select>
                          </FormControl>
                        </Box>

                        {/* Multiple Choice Options */}
                        {question.type === 'multiple_choice' && (
                          <Box sx={{ ml: 2, mt: 2 }}>
                            <Typography variant="subtitle2" gutterBottom>
                              Answer Options (2-5)
                            </Typography>
                            <Stack spacing={1}>
                              {question.options?.map((option, optIndex) => (
                                <Box key={optIndex} sx={{ display: 'flex', gap: 1 }}>
                                  <TextField
                                    size="small"
                                    label="Label"
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
                                    label="Value"
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
                                  Add Option
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
          <Button onClick={handleCloseEditor}>Cancel</Button>
          <Button
            onClick={handleSaveQuestionnaire}
            variant="contained"
            disabled={saving || !formData.title || questions.length === 0}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Assignment Dialog */}
      <Dialog open={assignmentDialogOpen} onClose={handleCloseAssignment} maxWidth="sm" fullWidth>
        <DialogTitle>Assign Questionnaire</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Typography variant="body2" color="text.secondary">
              Assign "{selectedQuestionnaireForAssignment?.title}" to:
            </Typography>

            {/* Scope Selection */}
            <FormControl fullWidth>
              <InputLabel>Assignment Scope</InputLabel>
              <Select
                value={assignmentScope}
                onChange={(e) => {
                  setAssignmentScope(e.target.value as AssignmentScope)
                  setSelectedTableId('')
                }}
                label="Assignment Scope"
              >
                <MenuItem value="restaurant">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <RestaurantIcon fontSize="small" />
                    Entire Restaurant (All Tables)
                  </Box>
                </MenuItem>
                <MenuItem value="table">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TableBar fontSize="small" />
                    Specific Table
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>

            {/* Restaurant Selection */}
            <FormControl fullWidth>
              <InputLabel>Select Restaurant</InputLabel>
              <Select
                value={selectedRestaurantId}
                onChange={(e) => setSelectedRestaurantId(e.target.value)}
                label="Select Restaurant"
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
                <InputLabel>Select Table</InputLabel>
                <Select
                  value={selectedTableId}
                  onChange={(e) => setSelectedTableId(e.target.value)}
                  label="Select Table"
                >
                  {tables.map((table) => (
                    <MenuItem key={table.id} value={table.id}>
                      Table {table.table_number}
                      {!table.echo_qrcode && (
                        <Chip label="No QR Code" size="small" color="warning" sx={{ ml: 1 }} />
                      )}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAssignment}>Cancel</Button>
          <Button
            onClick={handleAssignQuestionnaire}
            variant="contained"
            disabled={
              assigning ||
              !selectedRestaurantId ||
              (assignmentScope === 'table' && !selectedTableId)
            }
          >
            {assigning ? 'Assigning...' : 'Confirm Assignment'}
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
