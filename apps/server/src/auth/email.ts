const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export const validateEmail = (email: string) => {
  const normalizedEmail = normalizeEmail(email)
  if (normalizedEmail.length > 254 || !EMAIL_PATTERN.test(normalizedEmail)) {
    throw new Error('Enter a valid email address')
  }

  return normalizedEmail
}
