// Version: 2.2.0
// TypeScript types for database tables based on database_architecture.md
// Updated: Added JSONB support for flexible question types and answer options
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
  // New JSONB field for flexible questions
  questions: Question[]
  // Deprecated fields (kept for backward compatibility)
  question_1: string
  question_2: string
  question_3: string
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
  // New JSONB field for flexible answers (keyed by question.id)
  answers: Record<string, string>
  // Deprecated fields (kept for backward compatibility)
  answer_1?: string
  answer_2?: string
  answer_3?: string
  submitted_at: string
  customer_identifier?: string
}

// Extended types with joined data
// Note: Supabase returns foreign key relationships as arrays even for 1:1 relationships
export interface TableWithQRCode extends EchoTable {
  echo_qrcode?: EchoQRCode[]
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
