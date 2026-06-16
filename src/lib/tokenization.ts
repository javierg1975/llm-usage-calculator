import { getEncoding, type Tiktoken } from 'js-tiktoken'

let encoder: Tiktoken | null = null

const getSharedEncoder = (): Tiktoken => {
  if (encoder === null) {
    encoder = getEncoding('o200k_base')
  }
  return encoder
}

export const countTokens = (text: string): number => {
  if (text.length === 0) {
    return 0
  }
  return getSharedEncoder().encode(text).length
}
