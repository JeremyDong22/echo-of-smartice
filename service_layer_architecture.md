# Service Layer Architecture

**Version: 1.1.0**
**Last Updated: 2025-10-24**
**Purpose: Documents the service layer that connects frontend components to the Supabase backend**

This document describes how the frontend (React components) communicates with the backend (Supabase) through the service layer. For database schema details, see `database_architecture.md`.

---

## Architecture Overview

### Service Layer Pattern

The project uses a **Service Layer Pattern** to abstract all database interactions:

```
┌─────────────────────┐
│  React Components   │  (UI/Pages)
│  (src/pages/*)      │
└──────────┬──────────┘
           │
           │ imports & calls
           ▼
┌─────────────────────┐
│  Service Functions  │  (Business Logic)
│  (src/services/*)   │
└──────────┬──────────┘
           │
           │ Supabase Client
           ▼
┌─────────────────────┐
│  Supabase Database  │  (PostgreSQL)
│  (Tables & RLS)     │
└─────────────────────┘
```

**Key Principle**: Components NEVER call `supabase.from()` directly. All database operations go through service functions.

---

## Service Files

### 1. `qrcodeService.ts`

**Purpose**: Manages QR code generation, table management, and questionnaire assignment

**Key Functions**:

#### `getTablesWithQRCodes(restaurantId: string)`
- Fetches all tables for a restaurant with their associated QR codes
- Uses 1:1 relationship query: `echo_qrcode!table_id (*)`
- Returns `TableWithQRCode[]` type

#### `generateQRCodeForTable(tableId: string, baseUrl?: string)`
- **Critical Business Logic**: Creates QR code AND auto-assigns questionnaires from same restaurant
- **Why**: QR codes are useless without a questionnaire assignment (see bug fix 2025-10-23)
- **Process**:
  1. Fetch table's `restaurant_id` to ensure restaurant-scoped auto-assignment
  2. Generate UUID for QR code
  3. Insert into `echo_qrcode` table
  4. Query `echo_qrcode_questionnaire` to find questionnaires assigned to other tables in SAME restaurant
  5. Insert into `echo_qrcode_questionnaire` junction table (preserves weights and questionnaire IDs)
  6. Generate QR code image using `qrcode` library
- **Returns**: `{ qrCodeData: EchoQRCode, imageUrl: string }`
- **Bug Fix (v1.3.0)**: Now restaurant-aware - only assigns questionnaires from same restaurant, not first active globally

#### `regenerateQRCodeForTable(tableId: string, existingQRCodeId: string, baseUrl?: string)`
- **Critical Business Logic**: Deletes old QR code (CASCADE deletes assignments), creates new QR code with auto-assignment
- **Warning**: Invalidates printed QR codes and loses custom AB testing assignments
- **Process**:
  1. Delete old QR code (CASCADE deletes `echo_qrcode_questionnaire` entries)
  2. Call `generateQRCodeForTable()` which auto-assigns first active questionnaire

#### `createTable(restaurantId: string, tableNumber: string)`
- Creates a new table record
- Does NOT create QR code (separate operation)

#### `generateQRCodeImage(qrCodeValue: string)`
- Pure utility function for generating QR code images
- Used for displaying existing QR codes

#### `downloadQRCode(imageUrl: string, filename: string)`
- Client-side download utility
- Creates temporary `<a>` element to trigger download

**Used By**: `QRCodeManagementPage.tsx`

---

### 2. `questionnaireService.ts`

**Purpose**: Manages questionnaire CRUD operations and questionnaire-to-QR code assignments

**Key Functions** (TODO: Document after reviewing the file)

**Used By**: `QuestionnaireEditor.tsx` (TODO: Verify)

---

### 3. `restaurantService.ts`

**Purpose**: Fetches restaurant data

**Key Functions**:

#### `getAllRestaurants()`
- Simple query to `roleplay_restaurants` table
- Returns all restaurants (no filtering)

**Used By**: `QRCodeManagementPage.tsx`, `QuestionnaireEditor.tsx`

---

## Critical Business Logic Patterns

### Pattern 1: QR Code Generation Must Include Assignment (Restaurant-Aware)

**Problem**: QR codes scan to `questionnaire.html` which queries `echo_qrcode_questionnaire` for active questionnaires. Without an assignment, users see "No active questionnaires found".

**Original Bug**: Initially auto-assigned the first active questionnaire globally, causing questionnaires assigned to Restaurant A to be incorrectly assigned to new QR codes in Restaurant B (if they had the same name).

**Solution**: `generateQRCodeForTable()` automatically assigns questionnaires from the **same restaurant** when creating a QR code.

**Code Location**: `src/services/qrcodeService.ts:79-145`

**Data Flow**:
```
User clicks "Generate QR Code"
  → QRCodeManagementPage.handleGenerateQRCode()
    → qrcodeService.generateQRCodeForTable()
      → Query echo_table to get restaurant_id for the table
      → Query echo_qrcode_questionnaire to find questionnaires assigned to other tables in SAME restaurant
      → INSERT into echo_qrcode
      → INSERT into echo_qrcode_questionnaire (junction table) with all questionnaires found
      → Generate image with qrcode library
  → Page updates state with new QR code data
```

**Important Considerations**:
- Auto-assignment is **restaurant-scoped**: only assigns questionnaires already assigned to other tables in the same restaurant
- Preserves AB testing weights from existing assignments
- If no questionnaires are assigned to the restaurant, QR code is created but won't be scannable
- Prevents cross-restaurant questionnaire pollution (bug fix v1.3.0)

---

### Pattern 2: CASCADE Delete Behavior

**Scenario**: When regenerating a QR code

**Database Behavior**:
```sql
-- Foreign key constraint in echo_qrcode_questionnaire:
FOREIGN KEY (qrcode_id) REFERENCES echo_qrcode(id) ON DELETE CASCADE

-- When you delete a QR code:
DELETE FROM echo_qrcode WHERE id = 'old-qr-id';
-- This automatically deletes:
DELETE FROM echo_qrcode_questionnaire WHERE qrcode_id = 'old-qr-id';
```

**Impact on Service Layer**:
- `regenerateQRCodeForTable()` doesn't need to manually delete junction table records
- BUT it must ensure the new QR code gets a fresh assignment (handled by calling `generateQRCodeForTable()`)

**Code Location**: `src/services/qrcodeService.ts:168-185`

---

## Common Patterns

### Supabase Query Patterns

#### 1:1 Relationship (Table → QR Code)
```typescript
const { data } = await supabase
  .from('echo_table')
  .select('*, echo_qrcode!table_id (*)')  // !table_id specifies the foreign key
  .eq('restaurant_id', restaurantId)
```
**Result**: Each table object has an `echo_qrcode` property (single object, not array)

#### Many:Many Relationship (QR Code → Questionnaires)
```typescript
const { data } = await supabase
  .from('echo_qrcode')
  .select('*, echo_qrcode_questionnaire(*, echo_questionnaire(*))')
  .eq('id', qrcodeId)
```
**Result**: Nested relationships through junction table

#### Filtering on Joined Tables
```typescript
const { data } = await supabase
  .from('echo_qrcode_questionnaire')
  .select('*, echo_questionnaire(*)')
  .eq('qrcode_id', qrcodeId)
  .eq('is_active', true)  // Filter on junction table
  .eq('echo_questionnaire.is_active', true)  // Filter on joined table
```
**Important**: Use dot notation for joined table filters

---

### Error Handling Pattern

All service functions follow this pattern:

```typescript
export const serviceFunction = async (): Promise<ReturnType> => {
  const { data, error } = await supabase.from('table').select()

  if (error) {
    throw new Error(`Failed to [operation]: ${error.message}`)
  }

  return data
}
```

Components catch these errors and display them to users.

---

### Type Safety Pattern

1. Database types defined in `src/types/database.ts`
2. Service functions use these types for parameters and return values
3. Extended types (e.g., `TableWithQRCode`) defined for joined queries

```typescript
// Base type from database
export interface EchoTable {
  id: string
  restaurant_id: string
  table_number: string
  created_at: string
}

// Extended type for joined query
export interface TableWithQRCode extends EchoTable {
  echo_qrcode: EchoQRCode | null  // Single object, not array (1:1 relationship)
}
```

---

## Anti-Patterns to Avoid

### ❌ DON'T: Direct Supabase calls in components
```typescript
// BAD - in a React component
const { data } = await supabase.from('echo_table').select('*')
```

### ✅ DO: Use service layer
```typescript
// GOOD - in a React component
import { getTablesWithQRCodes } from '../services/qrcodeService'
const tables = await getTablesWithQRCodes(restaurantId)
```

### ❌ DON'T: Create incomplete database records
```typescript
// BAD - QR code without questionnaire assignment (will break scanning)
await supabase.from('echo_qrcode').insert({ ... })
// Missing: Assignment in echo_qrcode_questionnaire
```

### ✅ DO: Create complete, related records
```typescript
// GOOD - QR code with automatic questionnaire assignment
await generateQRCodeForTable(tableId)  // Handles both insertions
```

### ❌ DON'T: Ignore CASCADE delete side effects
```typescript
// BAD - Regenerating QR code without reassigning questionnaire
await supabase.from('echo_qrcode').delete().eq('id', oldId)
await supabase.from('echo_qrcode').insert({ ... })
// Missing: New assignment in junction table (CASCADE deleted the old one)
```

### ✅ DO: Account for CASCADE deletes in business logic
```typescript
// GOOD - Regeneration function handles reassignment
await regenerateQRCodeForTable(tableId, existingQRCodeId)  // Auto-reassigns
```

---

## Data Flow Examples

### Example 1: QR Code Management Page

**User Action**: Select restaurant and view tables

```
User selects restaurant
  ↓
QRCodeManagementPage.handleRestaurantChange()
  ↓
qrcodeService.getTablesWithQRCodes(restaurantId)
  ↓
Supabase query: echo_table JOIN echo_qrcode
  ↓
Returns: TableWithQRCode[]
  ↓
Component updates state.tables
  ↓
UI re-renders table list with QR code status
```

**User Action**: Generate QR code for a table

```
User clicks "Generate QR Code" button
  ↓
QRCodeManagementPage.handleGenerateQRCode(tableId)
  ↓
qrcodeService.generateQRCodeForTable(tableId)
  ↓
1. INSERT into echo_qrcode
  ↓
2. SELECT first active questionnaire
  ↓
3. INSERT into echo_qrcode_questionnaire
  ↓
4. Generate QR code image (client-side)
  ↓
Returns: { qrCodeData, imageUrl }
  ↓
Component updates state.tables and state.qrCodeImages
  ↓
UI shows generated QR code with download button
```

### Example 2: Questionnaire Scanning Flow

**User Action**: Customer scans QR code

```
Customer scans QR code
  ↓
Browser opens: questionnaire.html?qrcode={qrcodeId}
  ↓
JavaScript in questionnaire.html
  ↓
1. Query echo_qrcode by ID
  ↓
2. Get table info (echo_table)
  ↓
3. Get restaurant info (roleplay_restaurants)
  ↓
4. Query echo_qrcode_questionnaire with filters:
   - qrcode_id = {qrcodeId}
   - is_active = true
   - echo_questionnaire.is_active = true
  ↓
5. Select questionnaire (weighted random if multiple)
  ↓
6. Render questionnaire UI
  ↓
7. User submits answers
  ↓
8. INSERT into echo_answers with JSONB answers
```

**Critical Point**: Step 4 fails if no assignment exists → This is why `generateQRCodeForTable()` must create the assignment!

---

## Future Improvements

### 1. Explicit Questionnaire Assignment Flow
- Add UI in QR Code Management to select which questionnaire to assign
- Add parameter to `generateQRCodeForTable(tableId, questionnaireId)`
- Deprecate auto-assignment in favor of explicit selection

### 2. AB Testing Management UI
- Build interface for managing multiple questionnaire assignments
- Support weight adjustment, activation/deactivation
- Preserve assignments during QR code regeneration

### 3. Bulk Operations
- Generate QR codes for all tables at once
- Bulk assignment of questionnaires

---

## Version History

### v1.1.0 (2025-10-24)
- **Critical Bug Fix**: Updated QR code auto-assignment to be restaurant-aware
- Fixed issue where questionnaires assigned to Restaurant A were incorrectly auto-assigned to new QR codes in Restaurant B
- Updated `generateQRCodeForTable()` to query by `restaurant_id` before auto-assigning questionnaires
- Updated Pattern 1 documentation to reflect restaurant-scoped auto-assignment

### v1.0.0 (2025-10-23)
- Initial documentation
- Documented QR code auto-assignment bug fix
- Established service layer patterns
- Added data flow examples for QR code management
