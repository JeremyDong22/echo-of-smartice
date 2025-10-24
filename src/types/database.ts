// Version: 3.0.0
// TypeScript types for database tables based on database_architecture.md
// Updated: Removed legacy question_1/2/3 and answer_1/2/3 fields - now JSONB-only
// v3.0.0: BREAKING CHANGE - Removed deprecated fields (question_1/2/3, answer_1/2/3). All data now uses JSONB format exclusively.
// v2.3.0: Fixed TableWithQRCode type - echo_qrcode is a single object (not array) for 1:1 relationships
// v2.2.0: Updated QuestionnaireAssignment to include restaurant address, city, and assignment_id for deletion
// v2.1.0: Added QuestionnaireAssignment interface for displaying questionnaire-to-restaurant/table assignments
// v2.0.0: Added Question, QuestionOption types, updated EchoQuestionnaire and EchoAnswer with JSONB fields

export interface Restaurant {
  id: string
  name: string
  address?: string
  city?: string
  created_at?: string
  updated_at?: string
}

export interface EchoTable {
  id: string
  restaurant_id: string
  table_number: string // Changed to string to support alphanumeric format (A1, B2, C3, etc.)
  created_at?: string
  updated_at?: string
}

// Question type for the new JSONB structure
export type QuestionType = 'multiple_choice' | 'text_input'

// Question option for multiple choice questions
export interface QuestionOption {
  label: string
  value: string
}

// Individual question structure
export interface Question {
  id: string
  text: string
  type: QuestionType
  order: number
  options?: QuestionOption[] // Only required for multiple_choice type
}

export interface EchoQuestionnaire {
  id: string
  title: string
  description?: string
  // JSONB field for flexible questions (supports unlimited questions)
  questions: Question[]
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export interface EchoQRCode {
  id: string
  table_id: string
  qr_code_value: string
  created_at?: string
  updated_at?: string
}

export interface EchoQRCodeQuestionnaire {
  id: string
  qrcode_id: string
  questionnaire_id: string
  is_active: boolean
  weight: number
  assigned_at?: string
  deactivated_at?: string
}

export interface EchoAnswer {
  id: string
  table_id: string
  questionnaire_id: string
  qrcode_id: string
  assignment_id: string
  // JSONB field for flexible answers (keyed by question.id, supports unlimited answers)
  answers: Record<string, string>
  submitted_at: string
  customer_identifier?: string
}

// Extended types with joined data
// Note: Supabase returns 1:1 relationships as a single object (not array)
export interface TableWithQRCode extends EchoTable {
  echo_qrcode?: EchoQRCode | null
}

export interface QRCodeWithAssignments extends EchoQRCode {
  echo_qrcode_questionnaire?: QRCodeQuestionnaireWithQuestionnaire[]
}

export interface QRCodeQuestionnaireWithQuestionnaire extends EchoQRCodeQuestionnaire {
  echo_questionnaire?: EchoQuestionnaire
}

// Assignment data for displaying which tables/restaurants have a questionnaire
export interface QuestionnaireAssignment {
  restaurant_id: string
  restaurant_name: string
  restaurant_address?: string
  restaurant_city?: string
  tables: {
    table_id: string
    table_number: string
    qrcode_id: string
    assignment_id: string // ID of the echo_qrcode_questionnaire record for deletion
  }[]
}
