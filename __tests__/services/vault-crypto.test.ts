import { deriveKey, encryptString, decryptString } from "@/lib/services/vault-crypto"

describe("vault-crypto", () => {
  it("deriveKey returns a CryptoKey", async () => {
    const key = await deriveKey("test-passphrase")
    expect(key).toBeDefined()
    expect(key.type).toBe("secret")
  })

  it("encrypt then decrypt round-trips correctly", async () => {
    const key = await deriveKey("test-passphrase")
    const plaintext = "# Hello\n\nThis is a test note."
    const encrypted = await encryptString(key, plaintext)
    expect(encrypted).not.toBe(plaintext)
    const decrypted = await decryptString(key, encrypted)
    expect(decrypted).toBe(plaintext)
  })

  it("encrypting the same string twice produces different ciphertexts (random IV)", async () => {
    const key = await deriveKey("test-passphrase")
    const a = await encryptString(key, "same content")
    const b = await encryptString(key, "same content")
    expect(a).not.toBe(b)
  })

  it("decrypting with wrong key throws", async () => {
    const key1 = await deriveKey("passphrase-one")
    const key2 = await deriveKey("passphrase-two")
    const encrypted = await encryptString(key1, "secret")
    await expect(decryptString(key2, encrypted)).rejects.toThrow()
  })

  it("decrypting truncated ciphertext throws (too short for IV + auth tag)", async () => {
    const key = await deriveKey("test-passphrase")
    // 20 bytes is less than the minimum valid size (12 IV + 16 auth tag = 28 bytes)
    const tooShort = Buffer.alloc(20).toString("base64")
    await expect(decryptString(key, tooShort)).rejects.toThrow()
  })
})
