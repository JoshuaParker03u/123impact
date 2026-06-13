// Apple/1Password "Password Rules" format — hints password managers to generate
// passwords matching the policy enforced below.
// https://developer.apple.com/password-rules/
export const PASSWORD_RULES = 'minlength: 8; maxlength: 64; required: lower; required: upper; required: digit; required: special;'

export const PASSWORD_REQUIREMENTS_TEXT =
  'At least 8 characters, with an uppercase letter, a lowercase letter, a number, and a special character.'

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,64}$/

export function validatePassword(password: string): string | null {
  if (!PASSWORD_REGEX.test(password)) {
    return PASSWORD_REQUIREMENTS_TEXT
  }
  return null
}
