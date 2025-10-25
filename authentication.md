# Authentication Architecture

## Overview

EchoOfSmartICE uses **Supabase Authentication** to protect the admin panel with a single shared credential. This approach provides enterprise-grade security without the complexity of multi-user management.

**Version:** 2.1.0
**Last Updated:** 2025-10-26
**Status:** ✅ Fully Implemented and Tested with Password Recovery

---

## Architecture Decision

### Why Supabase Auth?

We chose Supabase's built-in authentication over custom solutions for several reasons:

1. **Security Best Practices**
   - Industry-standard bcrypt password hashing
   - JWT-based session management with automatic refresh
   - Built-in rate limiting on login attempts
   - CSRF protection

2. **WeChat Browser Compatibility**
   - Since the domain is publicly exposed in WeChat browser
   - Prevents credential exposure in client-side code
   - Proper session management across page refreshes

3. **Zero Backend Maintenance**
   - No custom auth tables to manage
   - No password hashing logic to implement
   - No session management code to write
   - Leverages existing Supabase infrastructure

4. **Future Extensibility**
   - Easy to add password reset flows
   - Easy to upgrade to multi-user if needed
   - Can add email verification
   - Can add 2FA (Two-Factor Authentication)

---

## Authentication Setup

### 1. Admin Account Creation

**Location**: Supabase Dashboard → Authentication → Users

**Single Admin Credential:**
- **Email**: `admin@smartice.ai` (or your preferred email)
- **Password**: Strong password (min 8 characters, mix of letters/numbers/symbols)
- **Created via**: Supabase Dashboard (manual creation)

**Steps to Create**:
```bash
1. Go to https://supabase.com/dashboard/project/wdpeoyugsxqnpwwtkqsl/auth/users
2. Click "Add user" → "Create new user"
3. Enter email and password
4. Click "Create user"
5. User is immediately active (no email verification needed)
```

**Important**: This is a **shared credential** - all authorized staff use the same email/password to access the admin panel.

---

## Frontend Implementation

### Architecture Overview

```
┌─────────────────────────────────────────────┐
│  Browser (WeChat/Desktop)                   │
│                                             │
│  ┌────────────────────────────────────┐    │
│  │  Public Routes                     │    │
│  │  - /questionnaire.html             │    │
│  │    (customer-facing, no auth)      │    │
│  └────────────────────────────────────┘    │
│                                             │
│  ┌────────────────────────────────────┐    │
│  │  Auth Gate                         │    │
│  │  - /login (email + password form)  │    │
│  └────────────────────────────────────┘    │
│                 │                           │
│                 ▼ (after successful login)  │
│  ┌────────────────────────────────────┐    │
│  │  Protected Routes (Admin Panel)    │    │
│  │  - / (QR Code Management)          │    │
│  │  - /questionnaires                 │    │
│  │  - /analytics (future)             │    │
│  └────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
         │                          ▲
         │ Login Request            │ Session Token (JWT)
         ▼                          │
┌─────────────────────────────────────────────┐
│  Supabase Auth Service                      │
│  - Validates credentials                    │
│  - Issues JWT tokens                        │
│  - Manages session refresh                  │
└─────────────────────────────────────────────┘
```

### File Structure

```
src/
├── components/
│   ├── Auth/
│   │   ├── LoginPage.tsx              # Email + password login form
│   │   └── ResetPasswordPage.tsx     # Password reset form (after email link)
│   └── Layout/
│       └── MainLayout.tsx             # Updated with logout button (v1.2.0)
├── contexts/
│   └── AuthContext.tsx                # Global auth state provider
├── services/
│   ├── supabase.ts                    # Updated with auth configuration (v1.1.0)
│   └── authService.ts                 # Login/logout/password reset functions
└── App.tsx                            # Protected routes + PASSWORD_RECOVERY listener (v2.0.0)
```

### Key Components

#### 1. **AuthContext** (`src/contexts/AuthContext.tsx`)
Provides global authentication state to all components.

**Responsibilities:**
- Track current session state (`authenticated` | `loading` | `unauthenticated`)
- Listen for auth state changes (login/logout)
- Provide login/logout functions to child components
- Automatically redirect to login if session expires

**Usage in components:**
```typescript
import { useAuth } from '../contexts/AuthContext'

function SomeComponent() {
  const { user, session, signOut } = useAuth()

  return <button onClick={signOut}>Logout</button>
}
```

#### 2. **LoginPage** (`src/components/Auth/LoginPage.tsx`)
Email + password form with "Forgot Password?" functionality and consistent background design.

**Features (v1.2.0):**
- **Localized UI**: All text in Chinese (管理员登录, 邮箱, 密码, etc.)
- **Glassmorphism design**: Semi-transparent card with backdrop blur matching admin panel
- **Background image**: Geometric pattern (`/background.png`) for visual consistency
- Email input field (type="email", required, autofocus)
- Password input field with show/hide toggle (Visibility icon)
- Submit button with loading state
- **"Forgot Password?" button**: Opens dialog to request password reset email
- Error message display (Alert component)
- Responsive centered layout (Container maxWidth="sm")

**Forgot Password Dialog:**
- Email input with validation
- "Send Reset Email" button
- Success message after email sent
- Cancel/Close buttons
- Prevents sending if email is empty

**UX Flow:**
```
1. User enters email + password
2. Click "登录" button
3. Loading state shows (button disabled, text changes to "登录中...")
4. On success: Redirect to /qrcode-management
5. On error: Show error message, clear password field

--- OR ---

1. User clicks "忘记密码？" button
2. Dialog opens with email input
3. User enters email and clicks "发送重置邮件"
4. Success message: "密码重置邮件已发送！请检查您的收件箱..."
5. User checks email and clicks reset link
6. Redirects to /reset-password page (see flow below)
```

**Key Code:**
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  setError(null)
  setLoading(true)

  const { error } = await signIn(email, password)

  if (error) {
    setError(error.message)
    setPassword('') // Clear password on error
  } else {
    navigate('/') // Redirect to home
  }
  setLoading(false)
}
```

#### 3. **ResetPasswordPage** (`src/components/Auth/ResetPasswordPage.tsx`)
Password reset form with session verification and consistent design.

**Features (v1.4.0):**
- **Localized UI**: All text in Chinese (重置密码, 新密码, 确认新密码, etc.)
- **Glassmorphism design**: Matching LoginPage visual style
- **Background image**: Same geometric pattern for consistency
- **Session verification**: Waits up to 10 seconds for Supabase to create recovery session
- **Loading state**: Shows "正在验证重置链接..." while checking session
- New password input field with validation (min 6 characters)
- Confirm password field with matching validation
- Show/hide password toggle
- Success message with auto-redirect to login (2 seconds)
- Comprehensive error messages in Chinese

**UX Flow:**
```
1. User clicks password recovery email link
2. App receives URL with #access_token=...&type=recovery
3. PasswordRecoveryListener detects recovery token → redirects to /reset-password (with hash preserved!)
4. ResetPasswordPage shows loading: "正在验证重置链接..."
5. Supabase creates recovery session from URL token (1-2 seconds)
6. Form appears with password input fields
7. User enters new password (twice)
8. Validates:
   - "密码长度至少为 6 个字符"
   - "两次输入的密码不匹配"
9. Calls updatePassword() from authService
10. Success: "密码更新成功！正在跳转到登录页面..."
11. Auto-redirect to /login after 2 seconds
12. Error: Show error message, allow retry
```

**Critical Implementation Notes:**
- **URL hash preservation**: Uses `navigate(`/reset-password${hash}`)` to prevent token loss
- **Infinite loop prevention**: Only redirects if `currentPath !== '/reset-password'`
- **Session timeout**: If no session after 10 seconds, shows friendly error message

**Key Code:**
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()

  if (newPassword.length < 6) {
    setError('Password must be at least 6 characters long')
    return
  }

  if (newPassword !== confirmPassword) {
    setError('Passwords do not match')
    return
  }

  const { error } = await updatePassword(newPassword)

  if (!error) {
    setSuccess(true)
    setTimeout(() => navigate('/login'), 2000)
  }
}
```

#### 4. **authService** (`src/services/authService.ts`)
Abstraction layer for Supabase auth operations.

**Functions:**
```typescript
// Sign in with email/password
signIn(email: string, password: string): Promise<SignInResult>

// Sign out current user
signOut(): Promise<{ error: AuthError | null }>

// Get current session
getSession(): Promise<Session | null>

// Get current user
getCurrentUser(): Promise<User | null>

// Check if user is authenticated
isAuthenticated(): Promise<boolean>

// Send password reset email
sendPasswordResetEmail(email: string, redirectTo?: string): Promise<{ error: AuthError | null }>

// Update user password (only works after PASSWORD_RECOVERY event)
updatePassword(newPassword: string): Promise<{ error: AuthError | null }>
```

#### 5. **Protected Routes** (`src/App.tsx`)
Wraps admin routes with authentication check and handles password recovery flow.

**Key Features:**
1. **ProtectedRoute wrapper** - Redirects unauthenticated users to /login
2. **PASSWORD_RECOVERY listener** - Auto-redirects to /reset-password when user clicks email link
3. **AuthProvider wrapper** - Provides auth context to entire app

**Implementation Pattern:**
```typescript
// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) return <CircularProgress />
  if (!session) return <Navigate to="/login" replace />

  return <>{children}</>
}

// Password recovery listener
function PasswordRecoveryListener() {
  const navigate = useNavigate()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/reset-password')
      }
    })

    return () => subscription.unsubscribe()
  }, [navigate])

  return null
}

// Route structure
<Router>
  <AuthProvider>
    <PasswordRecoveryListener />
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Protected admin routes */}
      <Route path="/*" element={
        <ProtectedRoute>
          <MainLayout>
            <Routes>
              <Route path="/" element={<Navigate to="/qrcode-management" replace />} />
              <Route path="/qrcode-management" element={<QRCodeManagementPage />} />
              <Route path="/questionnaire-editor" element={<QuestionnaireEditorPage />} />
            </Routes>
          </MainLayout>
        </ProtectedRoute>
      } />
    </Routes>
  </AuthProvider>
</Router>
```

#### 6. **Logout Button** (`src/components/Layout/MainLayout.tsx`)
Added logout functionality to the navigation bar.

**Implementation:**
```typescript
const { signOut } = useAuth()

const handleLogout = async () => {
  await signOut()
  navigate('/login')
}

// Button in toolbar
<Button
  color="inherit"
  startIcon={<Logout />}
  onClick={handleLogout}
  sx={{
    color: 'rgba(255, 255, 255, 0.9)',
    '&:hover': {
      background: 'rgba(255, 100, 100, 0.3)',
    },
  }}
>
  退出登录
</Button>
```

---

## Session Management

### Storage Strategy

**Where sessions are stored:**
- **Default**: `localStorage` (persistent across browser restarts)
- **Alternative**: `sessionStorage` (expires when browser closes)

**Configuration** (in Supabase client initialization):
```typescript
// src/services/supabase.ts (v1.1.0)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: window.localStorage,        // Persistent across browser restarts
    autoRefreshToken: true,               // Auto-refresh before expiration
    persistSession: true,                 // Save session to storage
    detectSessionInUrl: true              // IMPORTANT: Enables password recovery links
  }
})
```

**Critical**: `detectSessionInUrl: true` is **required** for password recovery to work. This allows Supabase to detect the recovery token in the URL when users click the password reset email link.

### Token Lifecycle

1. **Login**: Supabase issues two tokens:
   - `access_token` (JWT, expires in 1 hour)
   - `refresh_token` (expires in 30 days)

2. **Auto-Refresh**: Supabase client automatically refreshes `access_token` before expiration

3. **Logout**: Both tokens are invalidated and removed from storage

4. **Session Expiration**: If refresh token expires, user is redirected to login

---

## Security Considerations

### Current Implementation (Development)

✅ **What's Secure:**
- Passwords hashed with bcrypt (never stored in plaintext)
- JWT tokens with short expiration (1 hour)
- HTTPS in production (Vercel auto-provides SSL)
- Session tokens stored in localStorage (not exposed to server)

⚠️ **Development Trade-offs:**
- Single shared credential (no individual user tracking)
- No rate limiting on frontend (Supabase handles backend)
- No 2FA (can add later if needed)

### Production Recommendations

When deploying to production, consider:

1. **Strong Password Policy**
   - Minimum 12 characters
   - Mix of uppercase, lowercase, numbers, symbols
   - Change quarterly

2. **Password Rotation**
   - Update password every 3-6 months
   - Use Supabase Dashboard → Authentication → Users → Reset password

3. **Monitor Failed Login Attempts**
   - Check Supabase logs for brute force attempts
   - Supabase has built-in rate limiting (6 attempts per hour per IP)

4. **HTTPS Enforcement**
   - Vercel provides automatic HTTPS
   - Ensure `VITE_SUPABASE_URL` uses `https://`

5. **Session Timeout** (if needed)
   - Can configure shorter access token expiration
   - Can implement idle timeout in frontend

---

## Password Reset Flow (Email-Based)

### Complete Implementation Guide

The password reset flow is **fully implemented and tested** as of v2.0.0.

#### Step 1: Configure Supabase Redirect URLs

**Critical Configuration**: You must add these URLs to Supabase Dashboard:

1. Go to: `https://supabase.com/dashboard/project/wdpeoyugsxqnpwwtkqsl/auth/url-configuration`

2. In the **"Redirect URLs"** section, add:
   ```
   http://localhost:3000
   http://localhost:3000/reset-password
   https://echo.smartice.ai
   https://echo.smartice.ai/reset-password
   ```

3. Click **"Save"**

**Why needed?** Supabase validates redirect URLs for security. Without this, password reset emails will fail to redirect properly.

**Important Change (v2.1.0):** The `sendPasswordResetEmail()` function now redirects directly to `/reset-password` instead of the root path:
```typescript
// src/services/authService.ts (v1.1.0)
const { error } = await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${window.location.origin}/reset-password`  // Direct to reset page
})
```

This eliminates navigation issues and ensures the URL hash (containing the recovery token) is preserved.

#### Step 2: Send Password Recovery Email

**Option A: Via Login Page** (✅ Implemented in v2.1.0)
```bash
1. Go to http://localhost:3000/login (or https://echo.smartice.ai/login)
2. Click "忘记密码？" button below the login button
3. Dialog opens with email input field
4. Enter your email address
5. Click "发送重置邮件"
6. Success message: "密码重置邮件已发送！请检查您的收件箱并按照说明操作。"
7. Check your email for the reset link
```

**Option B: Via Supabase Dashboard** (For admin access without email)
```bash
1. Go to Authentication → Users
2. Find your admin user
3. Click "..." → "Send password recovery"
4. Email will be sent to the user's email address
```

#### Step 3: User Clicks Email Link

When the user clicks the password reset link in their email:

1. **Email link format:**
   ```
   https://wdpeoyugsxqnpwwtkqsl.supabase.co/auth/v1/verify?
     token=<recovery_token>&
     type=recovery&
     redirect_to=http://localhost:3000
   ```

2. **Supabase validates the token** and redirects to your app

3. **Your app URL becomes:**
   ```
   http://localhost:3000/#access_token=<jwt>&
     expires_in=3600&
     refresh_token=<token>&
     token_type=bearer&
     type=recovery
   ```

4. **Supabase client detects** `type=recovery` (because `detectSessionInUrl: true`)

5. **PASSWORD_RECOVERY event fires** (handled by PasswordRecoveryListener in App.tsx)

6. **Auto-redirect to /reset-password** page

#### Step 4: User Enters New Password

On the `/reset-password` page:

1. User sees form with "New Password" and "Confirm Password" fields
2. Validates:
   - Minimum 6 characters
   - Passwords match
3. Calls `updatePassword(newPassword)` from authService
4. Supabase updates the password (using the recovery session)
5. Success message shown
6. Auto-redirect to `/login` after 2 seconds

#### Step 5: User Logs In with New Password

User returns to `/login` and signs in with the new password.

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Admin clicks "Send password recovery" in Dashboard      │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Email sent with recovery link                           │
│    Link: https://wdpeoyugsxqnpwwtkqsl.supabase.co/auth/... │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. User clicks link → Supabase validates token             │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Redirect to: http://localhost:3000/#type=recovery&...   │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Supabase client detects recovery token in URL           │
│    (detectSessionInUrl: true enables this)                  │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. PASSWORD_RECOVERY event fires                           │
│    PasswordRecoveryListener catches it                      │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. navigate('/reset-password')                             │
│    ResetPasswordPage shown                                  │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. User enters new password → updateUser({ password })     │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 9. Success! Redirect to /login                             │
└─────────────────────────────────────────────────────────────┘
```

### Troubleshooting Password Reset

**Issue: Email link redirects but shows blank page**
- **Cause**: `detectSessionInUrl: true` not set in supabase client config
- **Fix**: Check `src/services/supabase.ts` line 19

**Issue: Link redirects but PASSWORD_RECOVERY event doesn't fire**
- **Cause**: PasswordRecoveryListener not mounted
- **Fix**: Check `src/App.tsx` - ensure `<PasswordRecoveryListener />` is inside `<Router>` and `<AuthProvider>`

**Issue: "Auth session missing" error on /reset-password page**
- **Cause 1**: User navigated to /reset-password directly without clicking email link
- **Fix 1**: User must click the email link to establish recovery session
- **Cause 2**: URL hash (containing recovery token) was lost during navigation
- **Fix 2**: ✅ FIXED in v2.1.0 - PasswordRecoveryListener now preserves hash: `navigate(\`/reset-password${hash}\`)`

**Issue: Infinite redirect loop - password reset page keeps reloading**
- **Cause**: PasswordRecoveryListener redirects on every location change, even when already on /reset-password
- **Fix**: ✅ FIXED in v2.4.0 - Added path check: `if (hash.includes('type=recovery') && currentPath !== '/reset-password')`

**Issue: Reset link redirects to /qrcode-management instead of /reset-password**
- **Cause 1**: ProtectedRoute redirects authenticated users before PasswordRecoveryListener can run
- **Fix 1**: ✅ FIXED in v2.0.1 - Check `isPasswordRecovery` flag before redirecting: `session && !isPasswordRecovery`
- **Cause 2**: Redirect URL in reset email points to root path
- **Fix 2**: ✅ FIXED in v1.1.0 - authService now uses: `redirectTo: ${window.location.origin}/reset-password`

**Issue: Password update fails with "New password should be different from the old password"**
- **Cause**: User is trying to set the same password
- **Fix**: Choose a different password

**Issue: Redirect URL not in allow list**
- **Cause**: Redirect URLs not configured in Supabase Dashboard
- **Fix**: Add URLs to Authentication → URL Configuration (see Step 1 above)

---

## Common Operations

### Changing the Admin Password

**Method 1: Supabase Dashboard (Recommended)**
```bash
1. Go to Authentication → Users
2. Find admin user
3. Click "..." → "Reset password"
4. Enter new password
5. Save
```

**Method 2: Password Reset Email** (if email is real)
```bash
1. Click "Forgot password?" on login page
2. Check email for reset link
3. Click link and set new password
```

### Adding a Second Admin User (Future)

If you need to track individual users later:
```bash
1. Create new user in Supabase Dashboard
2. Use different email (e.g., admin2@smartice.ai)
3. No code changes needed - existing auth flow handles multiple users
```

### Debugging Login Issues

**Common Issues:**

1. **"Invalid login credentials"**
   - Check email spelling
   - Check password (case-sensitive)
   - Verify user exists in Supabase Dashboard

2. **Session not persisting**
   - Check browser localStorage (DevTools → Application → Local Storage)
   - Should see `sb-{project-ref}-auth-token` key
   - If missing, check Supabase client configuration

3. **Infinite redirect loop**
   - Check `AuthContext` implementation
   - Verify `ProtectedRoute` logic
   - Check for conflicting route guards

**Debug Commands:**
```typescript
// In browser console
localStorage.getItem('sb-wdpeoyugsxqnpwwtkqsl-auth-token')  // Should return token object

// Check current session
supabase.auth.getSession().then(console.log)

// Listen for auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth event:', event, session)
})
```

---

## Integration with Existing Codebase

### No Database Changes Required

✅ **Supabase Auth uses separate `auth` schema** - completely independent from your `echo_*` tables:
- `auth.users` - User accounts
- `auth.sessions` - Active sessions
- `auth.refresh_tokens` - Refresh tokens

Your existing tables (`echo_qrcode`, `echo_questionnaire`, etc.) remain untouched.

### Service Layer Compatibility

**Before (no auth):**
```typescript
// Any page could call services directly
import { getTablesWithQRCodes } from '../services/qrcodeService'
const tables = await getTablesWithQRCodes(restaurantId)
```

**After (with auth):**
```typescript
// Same service calls, but wrapped in protected routes
// No changes to service layer code needed
import { getTablesWithQRCodes } from '../services/qrcodeService'
const tables = await getTablesWithQRCodes(restaurantId)  // Still works!
```

**Why?** Supabase client automatically includes auth token in all requests. Services don't need to change.

---

## Testing

### Manual Testing Checklist

**✅ All tests passed as of 2025-10-25**

Before deploying to production, verify:

#### Login Flow
- [x] ✅ Can log in with correct credentials
- [x] ✅ Cannot log in with wrong password
- [x] ✅ Cannot log in with wrong email
- [x] ✅ Login page shows error messages for failed attempts
- [x] ✅ Login page has loading state during authentication
- [x] ✅ Password field can be toggled visible/hidden
- [x] ✅ Password cleared on error for security

#### Session Management
- [x] ✅ Session persists after page refresh
- [x] ✅ Session persists after browser restart (localStorage)
- [x] ✅ Session token visible in localStorage (`sb-wdpeoyugsxqnpwwtkqsl-auth-token`)
- [x] ✅ Unauthenticated access redirects to `/login`
- [x] ✅ Direct URL access to `/qrcode-management` redirects to login when not authenticated
- [x] ✅ Direct URL access to `/questionnaire-editor` redirects to login when not authenticated

#### Logout Flow
- [x] ✅ Logout button visible in MainLayout navbar
- [x] ✅ Logout button redirects to `/login`
- [x] ✅ After logout, cannot access admin pages (redirects to login)
- [x] ✅ Session token removed from localStorage after logout

#### Password Reset Flow
- [x] ✅ Password recovery email sent from Supabase Dashboard
- [x] ✅ Email link redirects to app correctly
- [x] ✅ PASSWORD_RECOVERY event fires and redirects to `/reset-password`
- [x] ✅ Reset password page validates password length (min 6 chars)
- [x] ✅ Reset password page validates passwords match
- [x] ✅ Password update succeeds and shows success message
- [x] ✅ Auto-redirect to login after successful password update
- [x] ✅ Can log in with new password

#### Customer-Facing Pages (No Auth Required)
- [x] ✅ Questionnaire page (`/questionnaire.html?qrcode=X`) accessible without login
- [x] ✅ Customer questionnaire submission works without authentication
- [x] ✅ Background image loads on questionnaire page

#### UI/UX
- [x] ✅ Login page centered and responsive
- [x] ✅ Error messages displayed clearly with MUI Alert component
- [x] ✅ Loading states shown during async operations
- [x] ✅ Navigation bar glassmorphism design preserved
- [x] ✅ Logout button has hover effect (red background)

### Test Credentials (Development)

**Admin Account:**
- Email: `admin@smartice.ai`
- Password: (stored in team password manager)

**Important**: Never commit credentials to git or expose in client code.

---

## Future Enhancements

### Potential Upgrades (if needed)

1. **Multi-User Support**
   - Add user management page
   - Track which user made which changes (audit log)
   - Role-based permissions (admin vs. viewer)

2. **Two-Factor Authentication (2FA)**
   - Supabase supports TOTP (Google Authenticator, Authy)
   - Add during login flow
   - Increases security for public-facing domains

3. **Single Sign-On (SSO)**
   - Integrate with corporate identity providers
   - Google Workspace, Microsoft Entra ID, etc.
   - Supabase supports OAuth providers

4. **Session Analytics**
   - Track login times
   - Monitor active sessions
   - Alert on suspicious login patterns

5. **Password Reset via SMS**
   - For users without email access
   - Requires Twilio integration

---

## Related Documentation

- **Database Architecture**: `database_architecture.md` - Database schema (no auth-related tables)
- **Service Layer**: `service_layer_architecture.md` - Service functions (no changes needed for auth)
- **Project Setup**: `CLAUDE.md` - Main project documentation

---

## Quick Start Guide

For new developers working on this project:

### Prerequisites
1. Admin account created in Supabase Dashboard
2. Environment variables configured (`.env` file)
3. Redirect URLs added to Supabase Dashboard (see Password Reset Flow section)

### Testing Locally

```bash
# 1. Start dev server
npm run dev

# 2. Open browser
open http://localhost:3000

# 3. You should see login page (not authenticated yet)

# 4. Log in with admin credentials
Email: admin@smartice.ai (or your admin email)
Password: [your password]

# 5. After login, you should see the QR Code Management page

# 6. Test logout
Click "退出登录" button → should redirect to login

# 7. Test password reset (optional)
- Go to Supabase Dashboard → Authentication → Users
- Click "Send password recovery" for your user
- Check email and click link
- Enter new password
- Log in with new password
```

### Key Files to Know

When making changes to authentication:

1. **AuthContext** (`src/contexts/AuthContext.tsx`) - Add new auth state/methods here
2. **authService** (`src/services/authService.ts`) - Add new Supabase auth operations here
3. **LoginPage** (`src/components/Auth/LoginPage.tsx`) - Modify login UI here
4. **App.tsx** (`src/App.tsx`) - Add new protected routes here
5. **supabase.ts** (`src/services/supabase.ts`) - Modify auth config here

### Common Tasks

**Add a "Forgot Password?" link to login page:**
```typescript
// In LoginPage.tsx, add after the submit button:
<Button
  variant="text"
  onClick={() => {/* Implement email input dialog */}}
  sx={{ mt: 1 }}
>
  Forgot Password?
</Button>
```

**Change session storage from localStorage to sessionStorage:**
```typescript
// In src/services/supabase.ts
auth: {
  storage: window.sessionStorage, // Change this line
  // ...rest of config
}
```

**Add a new protected route:**
```typescript
// In src/App.tsx, add inside <MainLayout>:
<Route path="/analytics" element={<AnalyticsPage />} />
```

**Check if user is authenticated in a component:**
```typescript
import { useAuth } from '../contexts/AuthContext'

function MyComponent() {
  const { user, session } = useAuth()

  if (!session) {
    return <div>Not authenticated</div>
  }

  return <div>Welcome, {user?.email}</div>
}
```

---

## Changelog

### v2.1.0 (2025-10-26)
- ✅ **Critical Bug Fixes for Password Reset Flow**
  - Fixed URL hash loss during navigation (token preservation)
  - Fixed infinite redirect loop on /reset-password page
  - Fixed premature redirect to /qrcode-management during password recovery
  - Updated `sendPasswordResetEmail()` to redirect directly to `/reset-password`

- ✅ **"Forgot Password?" Feature on Login Page**
  - Added dialog with email input for password reset requests
  - Success/error message display
  - Full Chinese localization

- ✅ **UI/UX Improvements**
  - Localized all authentication pages to Chinese
  - Added geometric background pattern to LoginPage and ResetPasswordPage
  - Implemented glassmorphism design for visual consistency
  - Added session verification loading state ("正在验证重置链接...")
  - Improved error messages with Chinese localization

- ✅ **Component Version Updates**
  - LoginPage v1.2.0: Chinese localization + background + "Forgot Password?" button
  - ResetPasswordPage v1.4.0: Chinese localization + background + session verification
  - App.tsx v2.4.0: URL hash preservation + infinite loop fix
  - authService.ts v1.1.0: Direct `/reset-password` redirect
  - AuthContext v1.2.0: Cleaned up debug logging

### v2.0.0 (2025-10-25)
- ✅ Complete authentication system implementation
- Added LoginPage, ResetPasswordPage components
- Added AuthContext and authService
- Implemented PASSWORD_RECOVERY event handling
- Added protected routes with authentication checks
- Added logout button to MainLayout
- Comprehensive password reset flow (email-based)
- Full testing checklist completed
- Updated documentation with implementation details

### v1.0.0 (2025-10-25)
- Initial authentication architecture documentation
- Supabase Auth integration approach
- Single shared credential design
- Session management strategy
