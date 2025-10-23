// Version: 1.3.0
// Service for managing QR codes - generating, fetching, and downloading QR codes
// v1.3.0: Fixed bug where QR codes auto-assigned questionnaires from different restaurants with same name - now only auto-assigns questionnaires from same restaurant
// v1.2.0: Fixed critical bug - now auto-assigns first active questionnaire when generating QR codes
// v1.1.0: Updated default base URL to use localhost:3000/questionnaire.html format

import { supabase } from './supabase'
import QRCode from 'qrcode'
import type { EchoTable, EchoQRCode, TableWithQRCode } from '../types/database'

/**
 * Fetch all tables with their QR codes for a specific restaurant
 * Updated: Fixed relationship query to properly fetch associated QR codes
 */
export const getTablesWithQRCodes = async (restaurantId: string): Promise<TableWithQRCode[]> => {
  const { data, error } = await supabase
    .from('echo_table')
    .select(`
      *,
      echo_qrcode!table_id (*)
    `)
    .eq('restaurant_id', restaurantId)
    .order('table_number', { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch tables: ${error.message}`)
  }

  return data || []
}

/**
 * Get questionnaires assigned to other tables in the same restaurant
 * This ensures new QR codes in a restaurant get the same questionnaires as existing tables
 * Returns empty array if no questionnaires are assigned to this restaurant
 */
const getQuestionnairesForRestaurant = async (restaurantId: string): Promise<Array<{ questionnaire_id: string; weight: number }>> => {
  const { data, error } = await supabase
    .from('echo_qrcode_questionnaire')
    .select(`
      questionnaire_id,
      weight,
      echo_qrcode!inner(
        echo_table!inner(
          restaurant_id
        )
      )
    `)
    .eq('echo_qrcode.echo_table.restaurant_id', restaurantId)
    .eq('is_active', true)

  if (error || !data || data.length === 0) {
    return []
  }

  // Get unique questionnaires (in case multiple tables have the same questionnaire)
  const uniqueQuestionnaires = new Map<string, number>()
  data.forEach((assignment: any) => {
    if (!uniqueQuestionnaires.has(assignment.questionnaire_id)) {
      uniqueQuestionnaires.set(assignment.questionnaire_id, assignment.weight)
    }
  })

  return Array.from(uniqueQuestionnaires.entries()).map(([questionnaire_id, weight]) => ({
    questionnaire_id,
    weight,
  }))
}

/**
 * Generate QR code for a table (creates database entry and returns QR code image)
 * Base URL format: http://localhost:3000/questionnaire.html?qrcode=
 * Final URL: http://localhost:3000/questionnaire.html?qrcode={qrCodeId}
 *
 * IMPORTANT: Automatically assigns questionnaires from the same restaurant
 * This ensures new QR codes get the same questionnaires as other tables in their restaurant.
 * For AB testing or multiple questionnaires, use the Questionnaire Editor to manage assignments.
 */
export const generateQRCodeForTable = async (
  tableId: string,
  baseUrl: string = 'http://localhost:3000/questionnaire.html?qrcode='
): Promise<{ qrCodeData: EchoQRCode; imageUrl: string }> => {
  // Get the table's restaurant_id first
  const { data: tableData, error: tableError } = await supabase
    .from('echo_table')
    .select('restaurant_id')
    .eq('id', tableId)
    .single()

  if (tableError || !tableData) {
    throw new Error(`Failed to fetch table data: ${tableError?.message || 'Table not found'}`)
  }

  // Generate a unique QR code ID
  const qrCodeId = crypto.randomUUID()
  const qrCodeValue = `${baseUrl}${qrCodeId}`

  // Insert QR code into database
  const { data, error } = await supabase
    .from('echo_qrcode')
    .insert({
      id: qrCodeId,
      table_id: tableId,
      qr_code_value: qrCodeValue,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create QR code: ${error.message}`)
  }

  // Auto-assign questionnaires from the same restaurant
  const questionnaires = await getQuestionnairesForRestaurant(tableData.restaurant_id)
  if (questionnaires.length > 0) {
    const assignments = questionnaires.map(q => ({
      qrcode_id: qrCodeId,
      questionnaire_id: q.questionnaire_id,
      weight: q.weight,
      is_active: true,
    }))

    const { error: assignError } = await supabase
      .from('echo_qrcode_questionnaire')
      .insert(assignments)

    if (assignError) {
      // Log warning but don't fail - QR code was created successfully
      console.warn('Failed to auto-assign questionnaires:', assignError.message)
    }
  } else {
    console.warn('No questionnaires assigned to this restaurant - QR code created without assignment')
  }

  // Generate QR code image
  const imageUrl = await QRCode.toDataURL(qrCodeValue, {
    width: 512,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  })

  return { qrCodeData: data, imageUrl }
}

/**
 * Generate QR code image URL from existing QR code value
 */
export const generateQRCodeImage = async (qrCodeValue: string): Promise<string> => {
  return await QRCode.toDataURL(qrCodeValue, {
    width: 512,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  })
}

/**
 * Download QR code as PNG file
 */
export const downloadQRCode = (imageUrl: string, filename: string) => {
  const link = document.createElement('a')
  link.download = filename
  link.href = imageUrl
  link.click()
}

/**
 * Create a new table for a restaurant
 */
export const createTable = async (restaurantId: string, tableNumber: string): Promise<EchoTable> => {
  const { data, error } = await supabase
    .from('echo_table')
    .insert({
      restaurant_id: restaurantId,
      table_number: tableNumber,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create table: ${error.message}`)
  }

  return data
}

/**
 * Regenerate QR code for a table (deletes old QR code and creates a new one)
 * WARNING: This will invalidate any printed QR codes!
 *
 * IMPORTANT: Deleting the old QR code CASCADE deletes all questionnaire assignments.
 * The new QR code will be auto-assigned questionnaires from the same restaurant via
 * generateQRCodeForTable(). If you need to preserve custom AB testing assignments,
 * use the Questionnaire Editor to reassign questionnaires after regeneration.
 */
export const regenerateQRCodeForTable = async (
  tableId: string,
  existingQRCodeId: string,
  baseUrl: string = 'http://localhost:3000/questionnaire.html?qrcode='
): Promise<{ qrCodeData: EchoQRCode; imageUrl: string }> => {
  // Delete the existing QR code (CASCADE deletes questionnaire assignments)
  const { error: deleteError } = await supabase
    .from('echo_qrcode')
    .delete()
    .eq('id', existingQRCodeId)

  if (deleteError) {
    throw new Error(`Failed to delete old QR code: ${deleteError.message}`)
  }

  // Generate new QR code (automatically assigns first active questionnaire)
  return await generateQRCodeForTable(tableId, baseUrl)
}
