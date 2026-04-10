// Set a test key before importing the module
process.env.ENCRYPTION_KEY = "a".repeat(64) // 32 bytes as 64 hex chars

import { encrypt, decrypt } from "@/lib/encryption"

describe("encrypt / decrypt", () => {
  it("round-trips plaintext correctly", () => {
    const plaintext = "my-secret-token"
    const ciphertext = encrypt(plaintext)
    expect(ciphertext).not.toBe(plaintext)
    expect(decrypt(ciphertext)).toBe(plaintext)
  })

  it("produces different ciphertext for same input (random IV)", () => {
    const a = encrypt("same-input")
    const b = encrypt("same-input")
    expect(a).not.toBe(b)
    expect(decrypt(a)).toBe("same-input")
    expect(decrypt(b)).toBe("same-input")
  })

  it("throws on tampered ciphertext", () => {
    const ciphertext = encrypt("secret")
    const [iv, tag, ct] = ciphertext.split(":")
    const tampered = `${iv}:${tag}:${"ff" + ct.slice(2)}`
    expect(() => decrypt(tampered)).toThrow()
  })
})
