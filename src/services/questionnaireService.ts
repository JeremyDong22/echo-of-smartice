// Version: 2.3.0
// Service for managing questionnaires - creating, updating, and assigning questionnaires
// Updated: Added support for JSONB-based flexible questions with different types and options
// v2.3.0: Added validation to prevent duplicate questionnaire assignments to same QR code - enforces one questionnaire per table policy
// v2.2.0: Updated getAssignmentsForQuestionnaire() to include restaurant address and city; added removeAssignment() function
// v2.1.1: Fixed critical bug in assignQuestionnaireToRestaurant() - now queries echo_table instead of echo_qrcode to properly detect tables without QR codes
// v2.1.0: Added getAssignmentsForQuestionnaire() to fetch which restaurants/tables have a questionnaire assigned
// v2.0.0: Updated create/update functions to handle questions array with multiple_choice and text_input types

import { supabase } from './supabase'
import type {
  EchoQuestionnaire,
  EchoQRCodeQuestionnaire,
  QRCodeWithAssignments,
  Question,
  QuestionnaireAssignment,
} from '../types/database'

/**
 * Get all questionnaires
 */
export const getAllQuestionnaires = async (): Promise<EchoQuestionnaire[]> => {
  const { data, error } = await supabase
    .from('echo_questionnaire')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch questionnaires: ${error.message}`)
  }

  return data || []
}

/**
 * Get active questionnaires assigned to a QR code
 * Filters by both assignment-level and questionnaire-level is_active flags
 */
export const getQuestionnairesForQRCode = async (qrcodeId: string): Promise<EchoQuestionnaire[]> => {
  const { data, error } = await supabase
    .from('echo_qrcode_questionnaire')
    .select('echo_questionnaire(*)')
    .eq('qrcode_id', qrcodeId)
    .eq('is_active', true)
    .eq('echo_questionnaire.is_active', true)

  if (error) {
    throw new Error(`Failed to fetch questionnaires for QR code: ${error.message}`)
  }

  return data?.map((item: any) => item.echo_questionnaire) || []
}

/**
 * Get all QR code assignments for questionnaires in a restaurant
 */
export const getQuestionnaireAssignmentsForRestaurant = async (
  restaurantId: string
): Promise<QRCodeWithAssignments[]> => {
  const { data, error } = await supabase
    .from('echo_qrcode')
    .select(`
      *,
      echo_table!inner(restaurant_id),
      echo_qrcode_questionnaire(
        *,
        echo_questionnaire(*)
      )
    `)
    .eq('echo_table.restaurant_id', restaurantId)

  if (error) {
    throw new Error(`Failed to fetch questionnaire assignments: ${error.message}`)
  }

  return data || []
}

/**
 * Get all restaurant and table assignments for a specific questionnaire
 * Returns data grouped by restaurant showing which tables have this questionnaire assigned
 * Includes assignment_id for each table to enable deletion
 */
export const getAssignmentsForQuestionnaire = async (
  questionnaireId: string
): Promise<QuestionnaireAssignment[]> => {
  // Query the junction table to get all QR codes assigned to this questionnaire
  const { data, error } = await supabase
    .from('echo_qrcode_questionnaire')
    .select(`
      id,
      qrcode_id,
      echo_qrcode!inner(
        id,
        echo_table!inner(
          id,
          table_number,
          restaurant_id,
          roleplay_restaurants!inner(
            id,
            name,
            address,
            city
          )
        )
      )
    `)
    .eq('questionnaire_id', questionnaireId)
    .eq('is_active', true)

  if (error) {
    throw new Error(`Failed to fetch assignments for questionnaire: ${error.message}`)
  }

  // Group by restaurant
  const restaurantMap = new Map<string, QuestionnaireAssignment>()

  data?.forEach((assignment: any) => {
    const qrcode = assignment.echo_qrcode
    const table = qrcode.echo_table
    const restaurant = table.roleplay_restaurants

    if (!restaurantMap.has(restaurant.id)) {
      restaurantMap.set(restaurant.id, {
        restaurant_id: restaurant.id,
        restaurant_name: restaurant.name,
        restaurant_address: restaurant.address,
        restaurant_city: restaurant.city,
        tables: [],
      })
    }

    restaurantMap.get(restaurant.id)!.tables.push({
      table_id: table.id,
      table_number: table.table_number,
      qrcode_id: qrcode.id,
      assignment_id: assignment.id, // Include assignment ID for deletion
    })
  })

  // Convert map to array and sort tables by table_number
  return Array.from(restaurantMap.values()).map((restaurant) => ({
    ...restaurant,
    tables: restaurant.tables.sort((a, b) => {
      // Sort alphanumerically (handles both numeric and alphanumeric like A1, B2)
      const aNum = parseInt(a.table_number, 10)
      const bNum = parseInt(b.table_number, 10)
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return aNum - bNum
      }
      return a.table_number.localeCompare(b.table_number, undefined, { numeric: true })
    }),
  }))
}

/**
 * Create a new questionnaire
 * Supports both legacy format (question_1, question_2, question_3) and new JSONB format (questions array)
 */
export const createQuestionnaire = async (
  questionnaire: Omit<EchoQuestionnaire, 'id' | 'created_at' | 'updated_at'>
): Promise<EchoQuestionnaire> => {
  // Ensure questions array is provided, if not create empty array
  const questionnaireData = {
    ...questionnaire,
    questions: questionnaire.questions || [],
  }

  const { data, error } = await supabase
    .from('echo_questionnaire')
    .insert(questionnaireData)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create questionnaire: ${error.message}`)
  }

  return data
}

/**
 * Update an existing questionnaire
 * Supports both legacy format and new JSONB format
 */
export const updateQuestionnaire = async (
  questionnaireId: string,
  updates: Partial<Omit<EchoQuestionnaire, 'id' | 'created_at'>>
): Promise<EchoQuestionnaire> => {
  const { data, error } = await supabase
    .from('echo_questionnaire')
    .update(updates)
    .eq('id', questionnaireId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update questionnaire: ${error.message}`)
  }

  return data
}

/**
 * Validate question structure
 * Ensures questions array has valid format before saving
 */
export const validateQuestions = (questions: Question[]): { valid: boolean; error?: string } => {
  if (!Array.isArray(questions)) {
    return { valid: false, error: 'Questions must be an array' }
  }

  if (questions.length === 0) {
    return { valid: false, error: 'At least one question is required' }
  }

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]

    if (!q.id || typeof q.id !== 'string') {
      return { valid: false, error: `Question ${i + 1}: ID is required` }
    }

    if (!q.text || typeof q.text !== 'string' || q.text.trim() === '') {
      return { valid: false, error: `Question ${i + 1}: Text is required` }
    }

    if (!q.type || !['multiple_choice', 'text_input'].includes(q.type)) {
      return { valid: false, error: `Question ${i + 1}: Type must be 'multiple_choice' or 'text_input'` }
    }

    if (q.type === 'multiple_choice') {
      if (!q.options || !Array.isArray(q.options)) {
        return { valid: false, error: `Question ${i + 1}: Multiple choice questions must have options` }
      }

      if (q.options.length < 2 || q.options.length > 5) {
        return { valid: false, error: `Question ${i + 1}: Multiple choice must have 2-5 options` }
      }

      for (let j = 0; j < q.options.length; j++) {
        const opt = q.options[j]
        if (!opt.label || !opt.value) {
          return { valid: false, error: `Question ${i + 1}, Option ${j + 1}: Label and value are required` }
        }
      }
    }
  }

  return { valid: true }
}

/**
 * Check if a QR code already has active questionnaire assignments
 * Returns the existing assignments if found
 */
const checkExistingAssignments = async (qrcodeId: string): Promise<{
  hasAssignments: boolean
  existingQuestionnaires: string[]
}> => {
  const { data, error } = await supabase
    .from('echo_qrcode_questionnaire')
    .select('id, echo_questionnaire(title)')
    .eq('qrcode_id', qrcodeId)
    .eq('is_active', true)

  if (error) {
    throw new Error(`Failed to check existing assignments: ${error.message}`)
  }

  const questionnaires = data?.map((assignment: any) => assignment.echo_questionnaire?.title || 'Unknown') || []

  return {
    hasAssignments: data && data.length > 0,
    existingQuestionnaires: questionnaires,
  }
}

/**
 * Assign a questionnaire to a QR code
 * IMPORTANT: Enforces one questionnaire per table policy - will throw error if table already has an assignment
 */
export const assignQuestionnaireToQRCode = async (
  qrcodeId: string,
  questionnaireId: string,
  weight: number = 100
): Promise<EchoQRCodeQuestionnaire> => {
  // Check if this QR code already has active assignments
  const { hasAssignments, existingQuestionnaires } = await checkExistingAssignments(qrcodeId)

  if (hasAssignments) {
    throw new Error(
      `This table already has a questionnaire assigned: "${existingQuestionnaires.join(', ')}". ` +
      `Please remove the existing assignment before assigning a new one.`
    )
  }

  const { data, error } = await supabase
    .from('echo_qrcode_questionnaire')
    .insert({
      qrcode_id: qrcodeId,
      questionnaire_id: questionnaireId,
      is_active: true,
      weight,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to assign questionnaire: ${error.message}`)
  }

  return data
}

/**
 * Deactivate a questionnaire assignment (soft delete)
 * Sets is_active to false and records deactivation timestamp
 */
export const deactivateAssignment = async (assignmentId: string): Promise<void> => {
  const { error } = await supabase
    .from('echo_qrcode_questionnaire')
    .update({
      is_active: false,
      deactivated_at: new Date().toISOString(),
    })
    .eq('id', assignmentId)

  if (error) {
    throw new Error(`Failed to deactivate assignment: ${error.message}`)
  }
}

/**
 * Remove a questionnaire assignment (hard delete)
 * Permanently deletes the assignment from the database
 */
export const removeAssignment = async (assignmentId: string): Promise<void> => {
  const { error } = await supabase
    .from('echo_qrcode_questionnaire')
    .delete()
    .eq('id', assignmentId)

  if (error) {
    throw new Error(`Failed to remove assignment: ${error.message}`)
  }
}

/**
 * Assign a questionnaire to all tables in a restaurant
 * IMPORTANT: Enforces one questionnaire per table policy - will throw error if any table already has an assignment
 */
export const assignQuestionnaireToRestaurant = async (
  restaurantId: string,
  questionnaireId: string,
  weight: number = 100
): Promise<void> => {
  // First, get all tables for the restaurant with their QR codes
  const { data: tables, error: fetchError } = await supabase
    .from('echo_table')
    .select('id, table_number, echo_qrcode!table_id(id)')
    .eq('restaurant_id', restaurantId)

  if (fetchError) {
    throw new Error(`Failed to fetch tables: ${fetchError.message}`)
  }

  if (!tables || tables.length === 0) {
    throw new Error('No tables found for this restaurant')
  }

  // Filter tables that have QR codes
  const tablesWithQRCodes = tables.filter((table: any) => table.echo_qrcode && table.echo_qrcode.id)

  if (tablesWithQRCodes.length === 0) {
    throw new Error('No QR codes found for this restaurant. Please generate QR codes first.')
  }

  // Check if any tables already have questionnaire assignments
  const tablesWithAssignments: Array<{ table_number: string; questionnaires: string[] }> = []

  for (const table of tablesWithQRCodes) {
    if (!table.echo_qrcode) continue
    const { hasAssignments, existingQuestionnaires } = await checkExistingAssignments(table.echo_qrcode.id)
    if (hasAssignments) {
      tablesWithAssignments.push({
        table_number: table.table_number,
        questionnaires: existingQuestionnaires,
      })
    }
  }

  if (tablesWithAssignments.length > 0) {
    const tableList = tablesWithAssignments
      .map((t) => `Table ${t.table_number} (has "${t.questionnaires.join(', ')}")`)
      .join(', ')

    throw new Error(
      `Cannot assign questionnaire: ${tablesWithAssignments.length} table(s) already have assignments: ${tableList}. ` +
      `Please remove existing assignments first.`
    )
  }

  // Create assignments for all QR codes
  const assignments = tablesWithQRCodes.map((table: any) => ({
    qrcode_id: table.echo_qrcode.id,
    questionnaire_id: questionnaireId,
    is_active: true,
    weight,
  }))

  const { error: insertError } = await supabase
    .from('echo_qrcode_questionnaire')
    .insert(assignments)

  if (insertError) {
    throw new Error(`Failed to assign questionnaire to restaurant: ${insertError.message}`)
  }
}
