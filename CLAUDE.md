# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation Structure

This project maintains separate documentation files for different aspects of the system. **Always consult the appropriate documentation file based on your task:**

### 📁 Documentation Files

1. **`CLAUDE.md`** (this file)
   - Project overview and quick reference
   - Development commands and environment setup
   - High-level architecture patterns
   - Common development tasks and workflows

2. **`database_architecture.md`**
   - **Use when**: Working with database schema, tables, or SQL queries
   - Complete table schemas with JSONB structure examples
   - Index documentation and RLS policies
   - Foreign key constraints and CASCADE behavior
   - Migration history

3. **`service_layer_architecture.md`**
   - **Use when**: Working with frontend-backend connections or service functions
   - Service layer patterns and data flow
   - Critical business logic (e.g., QR code generation with auto-assignment)
   - Supabase query patterns
   - Common anti-patterns to avoid

4. **`business_logic.md`** (future)
   - **Use when**: Understanding business rules and workflows
   - AB testing logic
   - User flows and permissions
   - Business constraints and validation rules

**Important**: When making changes that affect multiple layers (e.g., adding a new feature), update ALL relevant documentation files to keep them synchronized.

---

## Project Overview

EchoOfSmartICE is a React + TypeScript admin panel for managing a restaurant questionnaire system. Customers scan QR codes at restaurant tables to access and fill out questionnaires. The system supports AB testing through multiple questionnaire assignments per QR code.

**Tech Stack:**
- React 19 + TypeScript
- Vite (dev server and build tool)
- Material-UI (MUI) for UI components
- Supabase for backend (PostgreSQL database)
- React Router for navigation

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (opens at http://localhost:3000)
npm run dev

# Build for production
npm run build

# Preview production build
npm preview

# Run linter
npm run lint
```

## Environment Setup

1. Copy `.env.example` to `.env`
2. Configure environment variables:
   - `VITE_SUPABASE_URL`: Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase anonymous key
   - `VITE_BASE_URL`: Base URL for QR code generation
     - Development: `http://localhost:3000/questionnaire.html?qrcode=`
     - Production: `https://echo.smartice.ai/questionnaire.html?qrcode=`

## Database Architecture

The system uses a **static QR code** design - QR codes are printed once and never change. Questionnaires are assigned dynamically via junction tables to support AB testing.

**Core Tables:**
- `roleplay_restaurants`: Existing restaurant data
- `echo_table`: Restaurant tables (1:many with restaurants)
- `echo_qrcode`: QR codes (1:1 with tables, **static and permanent**)
- `echo_questionnaire`: Questionnaire definitions with flexible JSONB questions
- `echo_qrcode_questionnaire`: Junction table linking QR codes to questionnaires with weights for AB testing
- `echo_answers`: Customer responses with JSONB answers tracking which variant was shown

**Key Features (v2.0):**
- Flexible question types: `multiple_choice` (2-5 options) and `text_input` (open-ended)
- Questions stored in JSONB array with structured format (id, text, type, options)
- Answers stored in JSONB object keyed by question ID
- Backward compatibility: Legacy TEXT columns (question_1/2/3, answer_1/2/3) preserved
- GIN indexes on JSONB columns for fast queries
- RLS policies enabled (currently public access for development)
- CASCADE deletes for all foreign keys

**Key Relationships:**
- Each table has exactly ONE QR code (1:1)
- Each QR code can have MULTIPLE questionnaire assignments for AB testing (many:many via junction table)
- The `qr_code_value` field is **static** and never changes
- Questionnaires are assigned/updated in `echo_qrcode_questionnaire` without touching the QR code

**QR Code Format:**
- Development: `http://localhost:3000/questionnaire.html?qrcode={qrCodeId}`
- Production: `https://echo.smartice.ai/questionnaire.html?qrcode={qrCodeId}`
- Configured via `VITE_BASE_URL` environment variable

**For Complete Details:**
See `database_architecture.md` for:
- Full table schemas with JSONB structure examples
- Complete index documentation
- RLS policy details and production recommendations
- AB testing setup guide
- Migration history and version information
- Foreign key constraints and cascade behavior

## Project Structure

```
public/                        # Static assets (copied to dist/ during build)
├── questionnaire.html         # Customer-facing questionnaire page
└── background.png             # Background image for questionnaire

src/
├── App.tsx                    # Main routing component
├── main.tsx                   # React entry point
├── components/
│   └── Layout/
│       └── MainLayout.tsx     # Navigation wrapper with sidebar
├── pages/
│   ├── QRCodeManagement/      # Generate and manage QR codes for tables
│   └── QuestionnaireEditor/   # Create and assign questionnaires
├── services/
│   ├── supabase.ts           # Supabase client initialization
│   ├── qrcodeService.ts      # QR code generation and table management
│   ├── questionnaireService.ts # Questionnaire CRUD and assignment logic
│   └── restaurantService.ts  # Restaurant data fetching
├── types/
│   └── database.ts           # TypeScript interfaces for all database tables
└── theme/
    └── theme.ts              # MUI theme configuration

dist/                          # Build output (generated by npm run build)
├── index.html                 # React admin panel entry
├── questionnaire.html         # Customer questionnaire (copied from public/)
├── background.png             # Background image (copied from public/)
└── assets/                    # Bundled JS/CSS files
```

## Architecture Patterns

### Service Layer Pattern
All Supabase interactions are abstracted into service files (`src/services/`). Page components call service functions rather than directly using the Supabase client.

**Example:**
```typescript
// ❌ Don't: Direct Supabase calls in components
const { data } = await supabase.from('echo_table').select('*')

// ✅ Do: Use service layer
import { getTablesWithQRCodes } from '../services/qrcodeService'
const tables = await getTablesWithQRCodes(restaurantId)
```

### Type Safety
All database types are defined in `src/types/database.ts` and match the schema in `database_architecture.md`. Extended types like `TableWithQRCode` include joined data.

**Important Type Notes:**
- `table_number` is a **string** (supports alphanumeric: A1, B2, C3, etc.)
- `echo_qrcode` in `TableWithQRCode` is a **single object or null** (NOT an array) - Supabase returns 1:1 relationships as objects
- `questions` is a JSONB array of question objects with types: `multiple_choice` | `text_input`
- `answers` is a JSONB object with keys matching question IDs from the questionnaire
- Legacy fields (question_1/2/3, answer_1/2/3) still exist for backward compatibility

### Static Assets & Deployment Architecture

The project consists of **two separate applications** served from the same domain:

#### 1. Admin Panel (React SPA)
- **Source**: `src/` directory
- **Entry**: `src/main.tsx` → `index.html`
- **Build**: Bundled into `dist/assets/` as JavaScript modules
- **Access**: `https://echo.smartice.ai/` (root and all React Router paths)
- **Users**: Restaurant staff managing QR codes and questionnaires

#### 2. Customer Questionnaire (Static HTML)
- **Source**: `public/questionnaire.html` (standalone HTML file)
- **Build**: Copied as-is to `dist/questionnaire.html` during build
- **Access**: `https://echo.smartice.ai/questionnaire.html?qrcode={id}`
- **Users**: Restaurant customers scanning QR codes
- **Important**: MUST be in `public/` directory for Vite to copy to dist root

**Why this architecture?**
- QR codes are **printed once** and point to static URLs
- The questionnaire page must be accessible at `/questionnaire.html` (not a React route)
- Vite's `public/` directory ensures files are copied to dist root unchanged
- This prevents React Router from intercepting questionnaire URLs
- Allows independent updates to admin panel without affecting customer-facing page

**Deployment Flow (Vercel):**
```bash
1. git push origin main
2. Vercel auto-deploys:
   - Runs: npm run build (tsc -b && vite build)
   - Copies: public/* → dist/*
   - Serves: dist/ as static site
3. URLs work:
   - https://echo.smartice.ai/ → React admin panel
   - https://echo.smartice.ai/questionnaire.html → Customer page
```

**Critical**: Never move `questionnaire.html` out of `public/` - it will break all printed QR codes.

### Versioned Comments
Every file has a version comment at the top documenting changes:
```typescript
// Version: 1.2.0
// Service for managing QR codes
// v1.2.0: Added support for custom base URLs
// v1.1.0: Fixed relationship queries
```

When updating files, increment the version and add a changelog note.

## Key Implementation Details

### QR Code Generation
QR codes contain only the unique `qrcode_id`, not questionnaire data. This enables:
- Print once, use forever
- Change questionnaires without reprinting
- AB testing without multiple physical codes

**Critical**: `generateQRCodeForTable()` automatically assigns the first active questionnaire to new QR codes. This ensures QR codes are immediately scannable. Without a questionnaire assignment in the `echo_qrcode_questionnaire` junction table, scanning the QR code will show "No active questionnaires found" error.

For detailed business logic and data flow, see `service_layer_architecture.md` → "Pattern 1: QR Code Generation Must Include Assignment".

### AB Testing Flow
1. Create multiple questionnaire variants
2. Assign both to same QR code with weights (e.g., 50/50 split)
3. Frontend randomly selects based on weights when customer scans
4. Store `assignment_id` in answers to track which variant was shown

See `database_architecture.md` lines 264-351 for detailed AB testing guide.

### Foreign Key Relationships
When querying joined data, use Supabase's relationship notation:
```typescript
// 1:1 relationship (echo_table -> echo_qrcode)
.select('*, echo_qrcode!table_id (*)')

// many:many with junction table
.select('*, echo_qrcode_questionnaire(*, echo_questionnaire(*))')
```

## Common Development Tasks

### Adding a New Service Function
1. Add TypeScript interface to `src/types/database.ts` if needed
2. Implement function in appropriate service file
3. Add version comment describing the change
4. Export function for use in components

### Creating a New Page
1. Create folder in `src/pages/` with PascalCase name
2. Create `PageName.tsx` component
3. Add route in `src/App.tsx`
4. Add navigation link in `src/components/Layout/MainLayout.tsx`

### Modifying Database Schema
1. Update `database_architecture.md` with schema changes (source of truth)
2. Update TypeScript interfaces in `src/types/database.ts`
3. Update affected service functions
4. Create migration in Supabase dashboard
5. Document migration in `database_architecture.md` migration history section

## Important Constraints

- **Never change `qr_code_value`** after QR codes are printed
- **Unique constraint** on (`restaurant_id`, `table_number`) in `echo_table`
- **Unique constraint** on `table_id` in `echo_qrcode` (enforces 1:1)
- **Unique constraint** on (`qrcode_id`, `questionnaire_id`) in junction table
- When filtering active questionnaires, check BOTH `assignment.is_active` AND `questionnaire.is_active`
- **CASCADE deletes** on all foreign keys - deleting a restaurant cascades to all related data
- **JSONB validation** - Questions must have valid type (`multiple_choice` requires options array)
- **Multiple choice options** - Must have 2-5 options with label and value fields

## Debugging Tips

- Supabase queries return `{ data, error }` - always check `error` first
- Service functions throw errors with descriptive messages
- Check browser console for Supabase client errors
- Verify `.env` file has correct credentials (common initialization issue)
- Use Supabase dashboard SQL editor to verify data structure

## Naming Conventions

- **Files/Components**: PascalCase (e.g., `QRCodeManagementPage.tsx`)
- **Services**: camelCase (e.g., `qrcodeService.ts`)
- **Functions**: camelCase (e.g., `getTablesWithQRCodes`)
- **Database tables**: snake_case (e.g., `echo_qrcode`)
- **Types**: PascalCase (e.g., `TableWithQRCode`)
