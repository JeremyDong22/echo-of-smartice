// Version: 1.1.0
// Authentication service for login, logout, and password management
// Abstracts Supabase auth operations
// v1.1.0: Fixed password reset redirect to point directly to /reset-password page

import { supabase } from './supabase'
import type { AuthError, Session, User } from '@supabase/supabase-js'

export interface SignInResult {
  user: User | null
  session: Session | null
  error: AuthError | null
}

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  return {
    user: data.user,
    session: data.session,
    error,
  }
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<{ error: AuthError | null }> {
  const { error } = await supabase.auth.signOut()
  return { error }
}

/**
 * Get current session
 */
export async function getSession(): Promise<Session | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session
}

/**
 * Get current user
 */
export async function getCurrentUser(): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession()
  return session !== null
}

/**
 * Send password reset email
 * @param email - User's email address
 * @param redirectTo - URL to redirect after clicking reset link (optional)
 */
export async function sendPasswordResetEmail(
  email: string,
  redirectTo?: string
): Promise<{ error: AuthError | null }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo || `${window.location.origin}/reset-password`,
  })
  return { error }
}

/**
 * Update user password
 * Only works when user is authenticated via password recovery flow
 */
export async function updatePassword(newPassword: string): Promise<{ error: AuthError | null }> {
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  })
  return { error }
}
