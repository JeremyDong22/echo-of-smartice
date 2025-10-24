// Version: 3.0.0
// Service for managing questionnaires - creating, updating, and assigning questionnaires
// Updated: Added support for JSONB-based flexible questions with different types and options
// v3.0.0: BREAKING CHANGE - Removed legacy field support. All questionnaires now use JSONB format exclusively. Updated documentation.
// v2.7.0: Changed validation - option.value is now optional (can be empty for synonymous options). Only label is required.
// v2.6.0: IMPROVED UX - assignQuestionnaireToRestaurant() now SKIPS tables with existing assignments instead of throwing error. Returns assignment statistics (assigned/skipped counts).
// v2.5.0: CRITICAL FIX - Supabase returns echo_qrcode as object (not array) for 1:1 relationships. Added getQRCodeId() helper to handle both formats. Fixes "No QR codes found" error.
// v2.4.2: Added detailed console.log debugging to assignQuestionnaireToRestaurant() to diagnose QR code detection issue
// v2.4.1: Fixed bug in assignQuestionnaireToRestaurant() - corrected Supabase query syntax by adding space in 'echo_qrcode!table_id (*)' and improved QR code filtering logic
// v2.4.0: Added removeRestaurantAssignments() to bulk delete all assignments for a questionnaire-restaurant combination
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
    const qrcode = Array.isArray(assignment.echo_qrcode) ? assignment.echo_qrcode[0] : assignment.echo_qrcode
    if (!qrcode) return
    const table = Array.isArray(qrcode.echo_table) ? qrcode.echo_table[0] : qrcode.echo_table
    if (!table) return
    const restaurant = Array.isArray(table.roleplay_restaurants) ? table.roleplay_restaurants[0] : table.roleplay_restaurants
    if (!restaurant) return

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
 * Uses JSONB format (questions array) for unlimited question support
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
 * Uses JSONB format (questions array) for unlimited question support
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
        if (!opt.label || opt.label.trim() === '') {
          return { valid: false, error: `Question ${i + 1}, Option ${j + 1}: Label is required` }
        }
        // Value is optional - can be empty for synonymous options
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
 * Remove all questionnaire assignments for a specific restaurant
 * Deletes all assignments for tables belonging to the specified restaurant
 * @param questionnaireId - The questionnaire ID
 * @param restaurantId - The restaurant ID
 * @returns The number of assignments removed
 */
export const removeRestaurantAssignments = async (
  questionnaireId: string,
  restaurantId: string
): Promise<number> => {
  // First, get all QR codes for tables in this restaurant
  const { data: tables, error: fetchError } = await supabase
    .from('echo_table')
    .select('echo_qrcode!table_id(id)')
    .eq('restaurant_id', restaurantId)

  if (fetchError) {
    throw new Error(`Failed to fetch tables for restaurant: ${fetchError.message}`)
  }

  if (!tables || tables.length === 0) {
    return 0
  }

  // Extract QR code IDs
  const qrcodeIds = tables
    .map((table: any) => {
      const qrcode = Array.isArray(table.echo_qrcode) ? table.echo_qrcode[0] : table.echo_qrcode
      return qrcode?.id
    })
    .filter(Boolean)

  if (qrcodeIds.length === 0) {
    return 0
  }

  // Delete all assignments matching both the questionnaire and these QR codes
  const { data, error: deleteError } = await supabase
    .from('echo_qrcode_questionnaire')
    .delete()
    .eq('questionnaire_id', questionnaireId)
    .in('qrcode_id', qrcodeIds)
    .select()

  if (deleteError) {
    throw new Error(`Failed to remove restaurant assignments: ${deleteError.message}`)
  }

  return data?.length || 0
}

/**
 * Helper function to get QR code ID from table data
 * Handles both object (1:1 relationship) and array formats
 */
const getQRCodeId = (qrcode: any): string | null => {
  if (!qrcode) return null

  if (Array.isArray(qrcode)) {
    return qrcode.length > 0 && qrcode[0]?.id ? qrcode[0].id : null
  } else if (typeof qrcode === 'object' && qrcode.id) {
    return qrcode.id
  }

  return null
}

/**
 * Assign a questionnaire to all tables in a restaurant
 * UPDATED: Now skips tables that already have assignments instead of throwing an error
 * Returns info about how many tables were assigned and how many were skipped
 */
export const assignQuestionnaireToRestaurant = async (
  restaurantId: string,
  questionnaireId: string,
  weight: number = 100
): Promise<{
  assignedCount: number
  skippedCount: number
  skippedTables: Array<{ table_number: string; questionnaires: string[] }>
}> => {
  console.log('🔍 [DEBUG] assignQuestionnaireToRestaurant called with:', {
    restaurantId,
    questionnaireId,
    weight
  })

  // First, get all tables for the restaurant with their QR codes
  const { data: tables, error: fetchError } = await supabase
    .from('echo_table')
    .select(`
      id,
      table_number,
      echo_qrcode!table_id (*)
    `)
    .eq('restaurant_id', restaurantId)

  console.log('🔍 [DEBUG] Query result:', {
    tablesCount: tables?.length || 0,
    error: fetchError,
    rawData: tables
  })

  if (fetchError) {
    throw new Error(`Failed to fetch tables: ${fetchError.message}`)
  }

  if (!tables || tables.length === 0) {
    throw new Error('No tables found for this restaurant')
  }

  // Filter tables that have QR codes
  // Note: echo_qrcode can be null (no QR code), an object (1:1 relationship), or an array with one element
  const tablesWithQRCodes = tables.filter((table: any) => {
    const qrcode = table.echo_qrcode

    // Handle both object and array cases
    let hasQRCode = false
    if (qrcode && typeof qrcode === 'object') {
      if (Array.isArray(qrcode)) {
        // Array case (expected based on types)
        hasQRCode = qrcode.length > 0 && qrcode[0]?.id
      } else {
        // Object case (actual Supabase behavior for 1:1 relationship)
        hasQRCode = !!qrcode.id
      }
    }

    console.log('🔍 [DEBUG] Checking table:', {
      table_number: table.table_number,
      echo_qrcode_type: typeof qrcode,
      echo_qrcode_isArray: Array.isArray(qrcode),
      echo_qrcode_length: qrcode?.length,
      echo_qrcode_value: qrcode,
      hasQRCode
    })

    return hasQRCode
  })

  console.log('🔍 [DEBUG] Filter result:', {
    totalTables: tables.length,
    tablesWithQRCodes: tablesWithQRCodes.length,
    filteredTables: tablesWithQRCodes
  })

  if (tablesWithQRCodes.length === 0) {
    throw new Error('No QR codes found for this restaurant. Please generate QR codes first.')
  }

  // Check which tables already have questionnaire assignments
  // For restaurant-wide assignment, we'll SKIP tables with existing assignments instead of throwing an error
  const tablesWithoutAssignments: any[] = []
  const skippedTables: Array<{ table_number: string; questionnaires: string[] }> = []

  for (const table of tablesWithQRCodes) {
    const qrcodeId = getQRCodeId(table.echo_qrcode)
    if (!qrcodeId) continue

    const { hasAssignments, existingQuestionnaires } = await checkExistingAssignments(qrcodeId)
    if (hasAssignments) {
      // Skip this table - it already has assignments
      skippedTables.push({
        table_number: table.table_number,
        questionnaires: existingQuestionnaires,
      })
    } else {
      // This table is available for assignment
      tablesWithoutAssignments.push(table)
    }
  }

  console.log('🔍 [DEBUG] Assignment check:', {
    totalTablesWithQRCodes: tablesWithQRCodes.length,
    tablesAlreadyAssigned: skippedTables.length,
    tablesToAssign: tablesWithoutAssignments.length,
    skippedTables: skippedTables.map(t => `${t.table_number} (${t.questionnaires.join(', ')})`),
  })

  // If ALL tables already have assignments, throw an error
  if (tablesWithoutAssignments.length === 0) {
    throw new Error(
      `All ${tablesWithQRCodes.length} table(s) in this restaurant already have questionnaire assignments. ` +
      `No new assignments were created.`
    )
  }

  // Create assignments only for tables without existing assignments
  const assignments = tablesWithoutAssignments.map((table: any) => ({
    qrcode_id: getQRCodeId(table.echo_qrcode)!,
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

  // Return statistics about the operation
  return {
    assignedCount: tablesWithoutAssignments.length,
    skippedCount: skippedTables.length,
    skippedTables: skippedTables,
  }
}
