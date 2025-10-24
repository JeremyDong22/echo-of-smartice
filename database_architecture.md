# Echo Backend Database Architecture

## Overview
This architecture supports a questionnaire system where customers scan QR codes at restaurant tables to fill out questionnaires.

## Tables

### 1. roleplay_restaurants (existing)
- Existing table containing restaurant information

### 2. echo_table
Stores table information for each restaurant.
- **Primary Key**: `id`
- **Foreign Key**: `restaurant_id` → `roleplay_restaurants.id`
- **Columns**:
  - `id` (UUID, PK)
  - `restaurant_id` (UUID, FK)
  - `table_number` (TEXT) -- Supports alphanumeric naming (e.g., "A1", "B2", "VIP-1")
  - `created_at` (TIMESTAMP)
  - `updated_at` (TIMESTAMP)
- **Unique Constraint**: (`restaurant_id`, `table_number`) - Each restaurant can have only one table with a given number

### 3. echo_questionnaire
Stores questionnaire definitions that can be used across multiple tables/restaurants.
Supports flexible question types (multiple choice, text input) with JSONB storage.
- **Primary Key**: `id`
- **Columns**:
  - `id` (UUID, PK)
  - `title` (TEXT) -- Questionnaire title
  - `description` (TEXT, nullable) -- Optional description
  - `questions` (JSONB) -- Array of questions with flexible types and options (supports unlimited questions)
  - `created_at` (TIMESTAMP)
  - `updated_at` (TIMESTAMP)
  - `is_active` (BOOLEAN)

**JSONB Questions Structure**:
```json
{
  "questions": [
    {
      "id": "q1",
      "text": "How was your experience?",
      "type": "multiple_choice",
      "order": 1,
      "options": [
        {"label": "Excellent", "value": "excellent"},
        {"label": "Good", "value": "good"},
        {"label": "Average", "value": "average"}
      ]
    },
    {
      "id": "q2",
      "text": "Any additional feedback?",
      "type": "text_input",
      "order": 2
    }
  ]
}
```

**Question Types**:
- `multiple_choice`: Questions with 2-5 predefined answer options
- `text_input`: Open-ended questions where users type their answer

### 4. echo_qrcode
Stores QR code information. Each table has exactly ONE QR code.
The QR code value is STATIC and NEVER CHANGES - questionnaires are assigned via the junction table.

- **Primary Key**: `id`
- **Foreign Keys**:
  - `table_id` → `echo_table.id`
- **Columns**:
  - `id` (UUID, PK)
  - `table_id` (UUID, FK, UNIQUE) -- ensures 1:1 with table
  - `qr_code_value` (TEXT, UNIQUE) -- STATIC identifier, e.g., "https://yourapp.com/scan/{id}" or just "{id}"
  - `created_at` (TIMESTAMP)
  - `updated_at` (TIMESTAMP)

**Design Note**: QR code value is permanent. Print once, stick on table, never reprint.
Questionnaires are assigned/changed in `echo_qrcode_questionnaire` without touching the QR code.

### 4b. echo_qrcode_questionnaire (Junction Table for Many-to-Many)
Links QR codes to questionnaires with AB testing support.
- **Primary Key**: `id`
- **Foreign Keys**:
  - `qrcode_id` → `echo_qrcode.id`
  - `questionnaire_id` → `echo_questionnaire.id`
- **Columns**:
  - `id` (UUID, PK)
  - `qrcode_id` (UUID, FK)
  - `questionnaire_id` (UUID, FK)
  - `is_active` (BOOLEAN) -- currently active assignment
  - `weight` (INTEGER) -- for weighted random distribution (e.g., 50% A, 50% B)
  - `assigned_at` (TIMESTAMP) -- when this assignment was created
  - `deactivated_at` (TIMESTAMP, nullable) -- when this assignment was turned off
  - **UNIQUE** constraint on (`qrcode_id`, `questionnaire_id`) -- prevent duplicate assignments

### 5. echo_answers
Stores customer responses to questionnaires. Tracks which specific assignment (AB test variant) was shown.
Supports flexible answer storage with JSONB format matching question IDs.
- **Primary Key**: `id`
- **Foreign Keys**:
  - `table_id` → `echo_table.id`
  - `questionnaire_id` → `echo_questionnaire.id`
  - `qrcode_id` → `echo_qrcode.id`
  - `assignment_id` → `echo_qrcode_questionnaire.id`
- **Columns**:
  - `id` (UUID, PK)
  - `table_id` (UUID, FK)
  - `questionnaire_id` (UUID, FK)
  - `qrcode_id` (UUID, FK)
  - `assignment_id` (UUID, FK) -- tracks which AB test variant was shown
  - `answers` (JSONB) -- Object of answers keyed by question ID (supports unlimited answers)
  - `submitted_at` (TIMESTAMPTZ) -- **Auto-generated using Beijing time (Asia/Shanghai, UTC+8)**
  - `customer_identifier` (TEXT, nullable) -- for tracking repeat customers

**Timezone Configuration**:
- `submitted_at` has a default value: `NOW() AT TIME ZONE 'Asia/Shanghai'`
- All submissions automatically use Beijing time (UTC+8)
- Client code does NOT send `submitted_at` - database handles it automatically

**JSONB Answers Structure** (v5.1.0+):
```json
{
  "answers": {
    "q1": {
      "value": "excellent",
      "label": "非常好",
      "type": "multiple_choice"
    },
    "q2": {
      "value": "The food was great and the service was excellent!",
      "type": "text_input"
    },
    "q3": {
      "value": "yes",
      "label": "是的",
      "type": "multiple_choice"
    }
  }
}
```

**Answer Object Fields**:
- `value`: The selected option value or text input content
- `label`: (multiple_choice only) The display text shown to user
- `type`: Question type (`multiple_choice` | `text_input`)

**Why store both value and label?**
- Preserves user-visible text even if option labels change later
- Enables accurate historical data analysis
- Prevents data loss when questionnaires are updated

Keys correspond to `question.id` from the questionnaire's questions array.

## Relationships Diagram (Many-to-Many for AB Testing)

```
┌──────────────────────────┐
│  roleplay_restaurants    │
│  (existing table)        │
└────────────┬─────────────┘
             │
             │ 1:many
             │
             ▼
┌──────────────────────────┐
│      echo_table          │
│  ─────────────────────   │
│  - id (PK)               │
│  - restaurant_id (FK)    │
│  - table_number          │
└────────────┬─────────────┘
             │
             │ 1:1 (each table has ONE QR code)
             │
             ▼
┌──────────────────────────┐
│     echo_qrcode          │
│  ─────────────────────   │
│  - id (PK)               │
│  - table_id (FK, UNIQUE) │
│  - qr_code_value         │
└────────────┬─────────────┘
             │
             │ many:many (via junction table for AB testing)
             │
             ▼
┌───────────────────────────────┐         ┌──────────────────────────┐
│ echo_qrcode_questionnaire     │         │   echo_questionnaire     │
│ (Junction/Assignment Table)   │         │  ─────────────────────   │
│  ──────────────────────────   │         │  - id (PK)               │
│  - id (PK)                    │◄────────┤  - title                 │
│  - qrcode_id (FK)             │ many:1  │  - description           │
│  - questionnaire_id (FK)      │         │  - questions (JSONB)     │
│  - is_active (BOOLEAN)        │         │  - is_active             │
│  - weight (INTEGER)           │         │                          │
│  - assigned_at (TIMESTAMP)    │         │                          │
└───────────────────────────────┘         └──────────────────────────┘
             │
             │ Tracks which questionnaire was shown
             │
             ▼
┌──────────────────────────────────┐
│        echo_answers              │
│  ─────────────────────────────   │
│  - id (PK)                       │
│  - table_id (FK)                 │
│  - questionnaire_id (FK)         │
│  - qrcode_id (FK)                │
│  - assignment_id (FK) ────────── │ Points to echo_qrcode_questionnaire
│  - answers (JSONB)               │ Flexible answer storage (unlimited)
│  - submitted_at                  │
│  - customer_identifier           │
└──────────────────────────────────┘
```

## Customer Journey Flow (with AB Testing)

```
1. Customer sits at table
   │
   ▼
2. Table has ONE QR code ──────────────► echo_table (1:1) echo_qrcode
   │
   ▼
3. Scan QR code ───────────────────────► App looks up active assignments in echo_qrcode_questionnaire
   │                                      WHERE qrcode_id = ? AND is_active = true
   ▼
4. Select questionnaire variant ───────► If multiple active assignments (AB test):
   │                                      - Random selection based on weights
   │                                      - E.g., 50% get variant A, 50% get variant B
   ▼
5. Display questionnaire ──────────────► echo_questionnaire (questions JSONB array)
   │
   ▼
6. Customer fills out & submits ───────► echo_answers stores:
                                         - which table (table_id)
                                         - which questionnaire (questionnaire_id)
                                         - which QR code (qrcode_id)
                                         - which assignment/variant (assignment_id) ← KEY FOR AB TESTING
                                         - answers (JSONB object with unlimited fields)
                                         - timestamp (submitted_at)
```

## Key Constraints

1. **Unique table per restaurant**:
   - UNIQUE constraint on (`restaurant_id`, `table_number`) in `echo_table`
   - Ensures each restaurant cannot have duplicate table numbers

2. **One QR code per table**:
   - UNIQUE constraint on `table_id` in `echo_qrcode`
   - Enforces 1:1 relationship between tables and QR codes

3. **Many-to-Many with AB Testing**:
   - A questionnaire can be assigned to multiple QR codes (many tables can test the same variant)
   - A QR code can have multiple questionnaire assignments (for AB testing)
   - UNIQUE constraint on (`qrcode_id`, `questionnaire_id`) in `echo_qrcode_questionnaire`
   - Only one assignment per QR code can have the same questionnaire
   - Prevents duplicate assignments of the same questionnaire to the same QR code

4. **Active Assignment Tracking**:
   - `is_active` flag in `echo_qrcode_questionnaire` determines which assignments are currently active
   - Multiple assignments can be active simultaneously for AB testing
   - `weight` field controls distribution probability (e.g., 50/50 split)

5. **Data Integrity**:
   - All foreign keys use ON DELETE CASCADE
   - Deleting parent records automatically removes dependent records
   - Ensures no orphaned data in the system

## Data Flow Examples

### Example 1: Simple Assignment (No AB Testing)
```
Restaurant: "Joe's Diner" (restaurant_id: R1)
  └── Table 5 (table_id: T5, table_number: 5)
      └── QR Code (qrcode_id: Q123, qr_code_value: "https://app.com/q/Q123")
          └── Assignment (assignment_id: A1, is_active: true, weight: 100)
              └── Questionnaire (questionnaire_id: QN1, title: "Basic Feedback")
                  - question_1: "How was the food?"
                  - question_2: "How was the service?"
                  - question_3: "Would you recommend us?"

                  └── Answers (all use QN1):
                      - Answer #1 (submitted_at: 2025-10-23 10:30, assignment_id: A1)
                      - Answer #2 (submitted_at: 2025-10-23 12:15, assignment_id: A1)
                      - Answer #3 (submitted_at: 2025-10-23 14:45, assignment_id: A1)
```

### Example 2: AB Testing (50/50 Split)
```
Restaurant: "Joe's Diner" (restaurant_id: R1)
  └── Table 5 (table_id: T5, table_number: 5)
      └── QR Code (qrcode_id: Q123)
          ├── Assignment A (assignment_id: A1, is_active: true, weight: 50)
          │   └── Questionnaire A (questionnaire_id: QN1, title: "Short Form")
          │       - question_1: "Food rating? (1-5)"
          │       - question_2: "Service rating? (1-5)"
          │       - question_3: "Overall rating? (1-5)"
          │
          │       └── Answers:
          │           - Answer #1 (submitted_at: 10:30, assignment_id: A1) ← Got variant A
          │           - Answer #3 (submitted_at: 12:15, assignment_id: A1) ← Got variant A
          │
          └── Assignment B (assignment_id: A2, is_active: true, weight: 50)
              └── Questionnaire B (questionnaire_id: QN2, title: "Detailed Form")
                  - question_1: "What did you enjoy most about your meal?"
                  - question_2: "How can we improve our service?"
                  - question_3: "Any additional comments?"

                  └── Answers:
                      - Answer #2 (submitted_at: 11:00, assignment_id: A2) ← Got variant B
                      - Answer #4 (submitted_at: 13:30, assignment_id: A2) ← Got variant B

Analysis: Compare completion rates, answer quality between QN1 (short) vs QN2 (detailed)
```

### Example 3: Multi-Table AB Test
```
Restaurant: "Joe's Diner" (restaurant_id: R1)

Questionnaire A (QN1: "Version A - Short Questions")
Questionnaire B (QN2: "Version B - Detailed Questions")

Tables 1-5: Testing Variant A (100%)
  └── Table 1 → QR Code Q1 → Assignment → QN1 (weight: 100, is_active: true)
  └── Table 2 → QR Code Q2 → Assignment → QN1 (weight: 100, is_active: true)
  └── ... (Tables 3-5 same setup)

Tables 6-10: Testing Variant B (100%)
  └── Table 6 → QR Code Q6 → Assignment → QN2 (weight: 100, is_active: true)
  └── Table 7 → QR Code Q7 → Assignment → QN2 (weight: 100, is_active: true)
  └── ... (Tables 8-10 same setup)

Analysis: Compare results by table groups to see which questionnaire performs better
```

## AB Testing Usage Guide

### How to Set Up AB Tests

**1. Create Questionnaire Variants:**
```sql
-- Create Variant A (short questions)
INSERT INTO echo_questionnaire (id, title, question_1, question_2, question_3, is_active)
VALUES ('qn-a-uuid', 'Short Feedback Form',
        'Food rating? (1-5)',
        'Service rating? (1-5)',
        'Overall rating? (1-5)',
        true);

-- Create Variant B (detailed questions)
INSERT INTO echo_questionnaire (id, title, question_1, question_2, question_3, is_active)
VALUES ('qn-b-uuid', 'Detailed Feedback Form',
        'What did you enjoy most?',
        'How can we improve?',
        'Any additional comments?',
        true);
```

**2. Assign Variants to QR Codes (50/50 split):**
```sql
-- Assign both variants to Table 5's QR code with equal weight
INSERT INTO echo_qrcode_questionnaire (qrcode_id, questionnaire_id, is_active, weight)
VALUES
  ('qrcode-t5-uuid', 'qn-a-uuid', true, 50),  -- 50% get variant A
  ('qrcode-t5-uuid', 'qn-b-uuid', true, 50);  -- 50% get variant B
```

**3. Frontend Logic (When Customer Scans QR Code):**
```javascript
// 1. Get active assignments for this QR code
const assignments = await supabase
  .from('echo_qrcode_questionnaire')
  .select('*, echo_questionnaire(*)')
  .eq('qrcode_id', scannedQRCodeId)
  .eq('is_active', true);

// 2. Randomly select based on weights
const selectedAssignment = weightedRandomSelect(assignments);

// 3. Show questionnaire to customer
displayQuestionnaire(selectedAssignment.echo_questionnaire);

// 4. On submit, store assignment_id for tracking
await supabase.from('echo_answers').insert({
  assignment_id: selectedAssignment.id,  // ← KEY: tracks which variant
  questionnaire_id: selectedAssignment.questionnaire_id,
  qrcode_id: scannedQRCodeId,
  table_id: tableId,
  answer_1: answers[0],
  answer_2: answers[1],
  answer_3: answers[2]
});
```

**4. Analyze Results:**
```sql
-- Compare completion rates by variant
SELECT
  q.title AS variant_name,
  COUNT(*) AS total_responses,
  AVG(CASE WHEN answer_1 IS NOT NULL THEN 1 ELSE 0 END) AS q1_completion_rate,
  AVG(CASE WHEN answer_2 IS NOT NULL THEN 1 ELSE 0 END) AS q2_completion_rate,
  AVG(CASE WHEN answer_3 IS NOT NULL THEN 1 ELSE 0 END) AS q3_completion_rate
FROM echo_answers a
JOIN echo_qrcode_questionnaire aq ON a.assignment_id = aq.id
JOIN echo_questionnaire q ON aq.questionnaire_id = q.id
WHERE a.submitted_at >= '2025-10-01'
GROUP BY q.title;
```

**5. Stop AB Test (Activate Winner):**
```sql
-- Deactivate losing variant (Variant B)
UPDATE echo_qrcode_questionnaire
SET is_active = false, deactivated_at = NOW()
WHERE questionnaire_id = 'qn-b-uuid';

-- Keep winner active (Variant A)
-- Optionally set weight to 100 for clarity
UPDATE echo_qrcode_questionnaire
SET weight = 100
WHERE questionnaire_id = 'qn-a-uuid' AND is_active = true;
```

## QR Code Generation & Management Strategy

### Key Principle: QR Codes Are STATIC

**The Problem:**
- If QR codes contain questionnaire data, you must reprint every time you change questions
- If doing AB testing, you'd need multiple physical QR codes per table

**The Solution:**
- QR code contains only a **unique identifier** (the `qrcode_id`)
- Questionnaires are **assigned dynamically** in the database
- Print once → Use forever

### QR Code Lifecycle:

```
Step 1: Generate QR Code (ONE TIME)
┌────────────────────────────────────────┐
│ 1. Create entry in echo_qrcode         │
│    qr_code_value = qrcode_id           │
│                                         │
│ 2. Generate QR code image with:        │
│    https://yourapp.com/scan/{qrcode_id}│
│    OR just: {qrcode_id}                │
│                                         │
│ 3. Print QR code                        │
│ 4. Stick on table                       │
│ 5. NEVER TOUCH AGAIN                    │
└────────────────────────────────────────┘

Step 2: Assign Questionnaires (ANYTIME, UNLIMITED)
┌────────────────────────────────────────┐
│ 1. Create questionnaire variants        │
│ 2. Assign to QR code via junction table │
│ 3. Change assignments anytime           │
│ 4. Run AB tests without reprinting      │
└────────────────────────────────────────┘

Step 3: Customer Scans (RUNTIME)
┌────────────────────────────────────────┐
│ 1. Customer scans static QR code        │
│ 2. App receives: qrcode_id              │
│ 3. Lookup active assignments in DB      │
│ 4. Select questionnaire (random if AB)  │
│ 5. Display questionnaire                │
└────────────────────────────────────────┘
```

### Example QR Code Values:

**Option A (Recommended): Full URL**
```
qr_code_value = "https://yourapp.com/scan/550e8400-e29b-41d4-a716-446655440000"
```
- Easier for users (direct link)
- Can open in any QR scanner app
- Can add metadata in URL parameters

**Option B: Just the ID**
```
qr_code_value = "550e8400-e29b-41d4-a716-446655440000"
```
- Simpler QR code (less dense)
- Requires custom app to handle
- More flexible routing

### When to Generate QR Codes:

**Initial Setup:**
```sql
-- When adding a new table to a restaurant
INSERT INTO echo_table (restaurant_id, table_number)
VALUES ('restaurant-uuid', 5);

-- Immediately create QR code for this table
INSERT INTO echo_qrcode (id, table_id, qr_code_value)
VALUES (
  gen_random_uuid(),
  'new-table-uuid',
  'https://yourapp.com/scan/' || gen_random_uuid()
);

-- Then physically print and stick on table
```

**Never Regenerate Unless:**
- QR code sticker is physically damaged
- Table is replaced/removed
- Security reason (extremely rare)

### Benefits of This Architecture:

✅ Print QR codes once, use forever
✅ Change questionnaires without reprinting
✅ AB testing without multiple physical codes
✅ Easy questionnaire updates
✅ Future-proof and flexible
✅ Decoupled design (QR code ≠ questionnaire)

## Implementation Checklist

Ready to build in Supabase! Confirming design decisions:

- [x] **Answer storage format**: JSONB with backward-compatible TEXT columns (answer_1, answer_2, answer_3)
- [x] **Question storage format**: JSONB array with flexible question types (multiple_choice, text_input)
- [x] **QR code value format**: Static unique identifier - decide between full URL or just ID
- [x] **Backward compatibility**: Legacy fields maintained for existing systems
- [x] **Database constraints**: All foreign keys have ON DELETE CASCADE
- [x] **Customer tracking**: `customer_identifier` field added for returning customers
- [x] **RLS policies**: Public access policies enabled for all Echo tables
- [x] **Timestamps**: `created_at`/`updated_at` on questionnaire and qrcode tables
- [x] **Soft deletes**: Hard deletes used (no `deleted_at` columns)
- [x] **Indexes**: Performance indexes added for JSONB columns and foreign keys

## New Features (v2.0) - Flexible Question Types

### Overview
The questionnaire system now supports different question types with flexible answer options, stored in JSONB format for maximum flexibility.

### Question Types

#### 1. Multiple Choice Questions
- Support 2-5 answer options
- Each option has a label (displayed to user) and value (stored in database)
- Users select one option by clicking a button
- Perfect for: ratings, yes/no questions, satisfaction scales

**Example**:
```json
{
  "id": "q1",
  "text": "How would you rate your dining experience?",
  "type": "multiple_choice",
  "order": 1,
  "options": [
    {"label": "Excellent 😄", "value": "excellent"},
    {"label": "Good 🙂", "value": "good"},
    {"label": "Average 😐", "value": "average"},
    {"label": "Poor 😞", "value": "poor"}
  ]
}
```

#### 2. Text Input Questions
- Open-ended questions where users type their answer
- No predefined options
- Perfect for: feedback, suggestions, detailed comments

**Example**:
```json
{
  "id": "q2",
  "text": "What can we do to improve your experience?",
  "type": "text_input",
  "order": 2
}
```

### Migration Strategy

**Backward Compatibility**:
- Legacy fields (`question_1`, `question_2`, `question_3`) are preserved
- Old questionnaires are automatically migrated to JSONB format as text_input questions
- New questionnaires can use the JSONB format exclusively
- Both formats work simultaneously

**Data Flow**:
1. **Creating New Questionnaires**: Use `questions` JSONB array
2. **Editing Old Questionnaires**: System converts legacy format to JSONB on first edit
3. **Submitting Answers**: Stored in both `answers` JSONB and legacy `answer_1/2/3` fields
4. **Analyzing Results**: Query either format based on preference

### UI Features

**Questionnaire Editor**:
- Dynamic question builder with add/remove buttons
- Question type selector (Multiple Choice / Text Input)
- Option editor for multiple choice questions (2-5 options)
- Drag indicator for future reordering support
- Real-time validation

**Customer-Facing Frontend**:
- Questions render dynamically based on type
- Multiple choice: Clickable buttons with visual feedback
- Text input: Large textarea with smooth focus effects
- Progress indicator adapts to number of questions
- Glassmorphism design maintained throughout

### Performance Optimizations
- GIN indexes on `questions` and `answers` JSONB columns
- Efficient queries using JSONB operators
- Minimal overhead compared to legacy format

### Future Enhancements
- Rating scale questions (1-5 stars, 1-10 scale)
- Multi-select questions (checkboxes)
- Conditional questions (show based on previous answers)
- Question branching logic
- File upload questions
- Date/time picker questions

## Database Indexes

### Performance Indexes

**echo_questionnaire:**
- `echo_questionnaire_pkey` (UNIQUE BTREE on `id`) - Primary key
- `idx_echo_questionnaire_active` (BTREE on `is_active`) - Fast filtering of active questionnaires
- `idx_echo_questionnaire_questions` (GIN on `questions`) - JSONB queries on questions column

**echo_answers:**
- `echo_answers_pkey` (UNIQUE BTREE on `id`) - Primary key
- `idx_echo_answers_answers` (GIN on `answers`) - JSONB queries on answers column
- `idx_echo_answers_assignment` (BTREE on `assignment_id`) - Fast joins to assignments
- `idx_echo_answers_qrcode` (BTREE on `qrcode_id`) - Fast filtering by QR code
- `idx_echo_answers_questionnaire` (BTREE on `questionnaire_id`) - Fast filtering by questionnaire
- `idx_echo_answers_submitted` (BTREE on `submitted_at`) - Fast date range queries
- `idx_echo_answers_table` (BTREE on `table_id`) - Fast filtering by table

### Index Usage Examples

```sql
-- Fast JSONB query for specific question ID (uses GIN index)
SELECT * FROM echo_answers
WHERE answers->>'q1' = 'excellent';

-- Fast filtering by submission date (uses BTREE index)
SELECT * FROM echo_answers
WHERE submitted_at >= '2025-10-01'
ORDER BY submitted_at DESC;

-- Fast AB testing analysis (uses assignment index)
SELECT
  questionnaire_id,
  COUNT(*) as responses
FROM echo_answers
WHERE assignment_id IN (SELECT id FROM echo_qrcode_questionnaire WHERE qrcode_id = ?)
GROUP BY questionnaire_id;
```

## Row-Level Security (RLS) Policies

All Echo tables have RLS enabled with public access policies for prototype/development use.

### Current RLS Policy Configuration

**echo_questionnaire:**
- SELECT: Public read access (`true`)
- INSERT: Public insert access (`true`)
- UPDATE: Public update access (`true`)
- DELETE: Public delete access (`true`)

**echo_qrcode:**
- SELECT: Public read access (`true`)
- INSERT: Public insert access (`true`)
- UPDATE: Public update access (`true`)
- DELETE: Public delete access (`true`)

**echo_qrcode_questionnaire:**
- SELECT: Public read access (`true`)
- INSERT: Public insert access (`true`)
- UPDATE: Public update access (`true`)
- DELETE: Public delete access (`true`)

**echo_table:**
- SELECT: Public read access (`true`)
- INSERT: Public insert access (`true`)
- UPDATE: Public update access (`true`)
- DELETE: Public delete access (`true`)

**echo_answers:**
- SELECT: Public read access (`true`)
- INSERT: Public insert access (`true`)
- UPDATE: Public update access (`true`)
- DELETE: Public delete access (`true`)

### Production RLS Policy Recommendations

For production deployment, consider implementing restaurant-scoped policies:

```sql
-- Example: Restrict restaurant owners to their own data
CREATE POLICY "Restaurants can only view their own tables"
ON echo_table FOR SELECT
USING (
  restaurant_id IN (
    SELECT id FROM roleplay_restaurants
    WHERE owner_id = auth.uid()
  )
);

-- Example: Restrict viewing answers to restaurant owners
CREATE POLICY "Restaurants can only view their own answers"
ON echo_answers FOR SELECT
USING (
  table_id IN (
    SELECT et.id FROM echo_table et
    JOIN roleplay_restaurants rr ON et.restaurant_id = rr.id
    WHERE rr.owner_id = auth.uid()
  )
);
```

## Foreign Key Constraints

All foreign keys use **ON DELETE CASCADE** to maintain referential integrity.

### Foreign Key Relationships

```
echo_table
  └─ restaurant_id → roleplay_restaurants.id (CASCADE)

echo_qrcode
  └─ table_id → echo_table.id (CASCADE)

echo_qrcode_questionnaire
  ├─ qrcode_id → echo_qrcode.id (CASCADE)
  └─ questionnaire_id → echo_questionnaire.id (CASCADE)

echo_answers
  ├─ table_id → echo_table.id (CASCADE)
  ├─ questionnaire_id → echo_questionnaire.id (CASCADE)
  ├─ qrcode_id → echo_qrcode.id (CASCADE)
  └─ assignment_id → echo_qrcode_questionnaire.id (CASCADE)
```

### Cascade Delete Examples

```sql
-- Deleting a restaurant removes all its tables and related data
DELETE FROM roleplay_restaurants WHERE id = 'restaurant-uuid';
-- Automatically deletes:
--   - All echo_table records for this restaurant
--   - All echo_qrcode records for those tables
--   - All echo_qrcode_questionnaire assignments for those QR codes
--   - All echo_answers for those tables

-- Deleting a questionnaire removes assignments and answers
DELETE FROM echo_questionnaire WHERE id = 'questionnaire-uuid';
-- Automatically deletes:
--   - All echo_qrcode_questionnaire assignments using this questionnaire
--   - All echo_answers for this questionnaire
```

## Migration History

### Key Migrations (2025-10-23)

**1. create_echo_backend_tables (20251023112235)**
- Created initial Echo system tables
- Established relationships between restaurants, tables, QR codes, questionnaires

**2. change_table_number_to_text (20251023141235)**
- Changed `table_number` from INTEGER to TEXT
- Enables alphanumeric table naming (e.g., "A1", "B2", "VIP-1")

**3. add_questions_jsonb_column (20251023151518)**
- Added `questions` JSONB column to `echo_questionnaire`
- Default value: `'[]'::jsonb` (empty array)
- Supports flexible question types and options

**4. migrate_existing_questions_to_jsonb (20251023151541)**
- Migrated legacy `question_1`, `question_2`, `question_3` fields to JSONB format
- Created structured question objects with IDs, text, type, and order
- Legacy columns preserved for backward compatibility

**5. add_answers_jsonb_column (20251023151552)**
- Added `answers` JSONB column to `echo_answers`
- Default value: `'{}'::jsonb` (empty object)
- Keys correspond to question IDs from questionnaire
- Legacy `answer_1`, `answer_2`, `answer_3` columns preserved

**6. remove_legacy_question_and_answer_fields (20251024)**
- **BREAKING CHANGE**: Removed legacy TEXT columns
- Dropped `question_1`, `question_2`, `question_3` from `echo_questionnaire`
- Dropped `answer_1`, `answer_2`, `answer_3` from `echo_answers`
- All data now uses JSONB format exclusively
- Verified no data loss (all questionnaires had JSONB data before migration)
- Updated all code to remove fallback logic

**7. configure_beijing_timezone_for_submitted_at (20251024)**
- Configured `echo_answers.submitted_at` to use Beijing time (Asia/Shanghai, UTC+8)
- Set default value: `NOW() AT TIME ZONE 'Asia/Shanghai'`
- Column type: `TIMESTAMPTZ` (timestamp with time zone)
- Removed client-side timestamp generation from `questionnaire.html` (v5.2.0)
- All new submissions automatically use Beijing time
- Ensures consistent timezone across all submissions

### Migration Strategy

**v3.0 Migration (2025-10-24):**
- **BREAKING CHANGE**: Legacy TEXT fields removed
- Pre-migration check confirmed all questionnaires had JSONB data
- Migration executed successfully via Supabase API
- All code updated to use JSONB exclusively
- No data loss (all data was in JSONB format)

**Historical (v2.0 Migration):**
- Existing questionnaires automatically converted to JSONB format as text_input type
- Legacy TEXT fields were kept for backward compatibility
- GIN indexes added for efficient JSONB querying
- Dual-write strategy ensured data in both formats

## Database Schema Version

**Current Version:** 3.0 (JSONB-only, legacy fields removed)
**Previous Version:** 2.0 (JSONB-enabled with backward compatibility)
**Migration Date:** 2025-10-24

### Schema Evolution

**v1.0 (Initial - 2025-10-23):**
- Fixed 3-question format with TEXT columns
- Simple text answers only
- No question type support

**v2.0 (JSONB-enabled - 2025-10-23):**
- Flexible question count with JSONB array
- Multiple question types (multiple_choice, text_input)
- Structured answer storage
- GIN indexes for performance
- Backward compatibility maintained (legacy TEXT fields kept)

**v3.0 (Current - 2025-10-24):**
- **BREAKING CHANGE**: Removed legacy TEXT columns
- `question_1/2/3` deleted from `echo_questionnaire`
- `answer_1/2/3` deleted from `echo_answers`
- JSONB format exclusively
- Supports truly unlimited questions
- Cleaner schema, single source of truth
- Better performance (no redundant writes)
