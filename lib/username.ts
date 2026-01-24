import { supabase } from './supabase'

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_username_available', {
    check_username: username
  })
  
  if (error) {
    console.error('Error checking username:', error)
    return false
  }
  
  return data
}

export async function createUsername(userId: string, username: string): Promise<boolean> {
  const { error } = await supabase
    .from('usernames')
    .insert({ user_id: userId, username })
  
  if (error) {
    console.error('Error creating username:', error)
    return false
  }
  
  return true
}

export async function getUsernameByUserId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('usernames')
    .select('username')
    .eq('user_id', userId)
    .single()
  
  if (error || !data) {
    return null
  }
  
  return data.username
}

export async function getUserIdByIdentifier(identifier: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_user_id_by_identifier', {
    identifier: identifier
  })
  
  if (error) {
    console.error('Error getting user ID:', error)
    return null
  }
  
  return data
}

export function validateUsername(username: string): { valid: boolean; error?: string } {
  // Username must be 3-20 characters
  if (username.length < 3 || username.length > 20) {
    return { valid: false, error: 'Username must be 3-20 characters' }
  }
  
  // Username can only contain letters, numbers, underscores, and hyphens
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { valid: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' }
  }
  
  // Username must start with a letter
  if (!/^[a-zA-Z]/.test(username)) {
    return { valid: false, error: 'Username must start with a letter' }
  }
  
  // Username cannot be an email address
  if (username.includes('@') || username.includes('.')) {
    return { valid: false, error: 'Username cannot be an email address' }
  }
  
  return { valid: true }
}

export function validatePassword(password: string): { valid: boolean; error?: string } {
  // Minimum 8 characters
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' }
  }
  
  // At least one letter and one number
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one letter and one number' }
  }
  
  return { valid: true }
}

export function validateEmail(email: string): { valid: boolean; error?: string } {
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Please enter a valid email address' }
  }
  
  return { valid: true }
}
