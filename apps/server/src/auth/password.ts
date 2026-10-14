import type { Algorithm } from '@node-rs/argon2'
import { hash, verify } from '@node-rs/argon2'

const ARGON2_OPTIONS = {
  algorithm: 2 as Algorithm,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const

export const MIN_PASSWORD_LENGTH = 12
export const MAX_PASSWORD_LENGTH = 128
const MAX_PASSWORD_BYTES = 1_024

export const validateNewPassword = (password: string) => {
  if (
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH ||
    Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES
  ) {
    throw new Error(
      `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`,
    )
  }
}

export const hashPassword = async (password: string) => {
  validateNewPassword(password)
  return hash(password, ARGON2_OPTIONS)
}

export const verifyPassword = async (
  passwordHash: string,
  password: string,
) => {
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return false
  }

  try {
    return await verify(passwordHash, password)
  } catch {
    return false
  }
}
