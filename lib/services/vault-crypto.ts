// LiveSync E2E encryption format (confirmed via Task 2 discovery):
// Key derivation: PBKDF2-SHA256, 100,000 iterations, salt = UTF-8(passphrase)
// Encryption: AES-GCM 256-bit, random 12-byte IV
// Output format: base64(iv[12 bytes] + ciphertext + auth_tag[16 bytes])
// Encrypted path prefix in CouchDB documents: "/\:%="

import { webcrypto } from "node:crypto"
const { subtle } = webcrypto as Crypto

export async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  )
  // NOTE: salt = passphrase is the LiveSync protocol spec, not a general best practice.
  // Do not copy this pattern for new encryption schemes - use a fixed app-specific salt
  // or a per-user random salt stored alongside the ciphertext.
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(passphrase),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}

export async function encryptString(key: CryptoKey, plaintext: string): Promise<string> {
  const enc = new TextEncoder()
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext))
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return Buffer.from(combined).toString("base64")
}

export async function decryptString(key: CryptoKey, b64: string): Promise<string> {
  const buf = Buffer.from(b64, "base64")
  const iv = buf.subarray(0, 12)
  const data = buf.subarray(12)
  const plain = await subtle.decrypt({ name: "AES-GCM", iv }, key, data)
  return new TextDecoder().decode(plain)
}
