export interface E2EEEnvelope {
  version: 'CCRD-E2EE-1.0';
  algorithm: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  createdAt: string;
  saltB64: string;
  ivB64: string;
  ciphertextB64: string;
  plaintextSha256: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const buffer = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function deriveAesKey(passphrase: string, salt: Uint8Array, iterations = 150000): Promise<CryptoKey> {
  const rawKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptJsonE2EE(payload: unknown, passphrase: string): Promise<E2EEEnvelope> {
  if (!passphrase || passphrase.length < 6) {
    throw new Error('La clave de cifrado E2EE debe tener al menos 6 caracteres.');
  }
  const iterations = 150000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const jsonText = JSON.stringify(payload);
  const plaintextBytes = new TextEncoder().encode(jsonText);
  const plaintextSha256 = await sha256Hex(plaintextBytes);
  const key = await deriveAesKey(passphrase, salt, iterations);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintextBytes
  );

  return {
    version: 'CCRD-E2EE-1.0',
    algorithm: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations,
    createdAt: new Date().toISOString(),
    saltB64: bytesToBase64(salt),
    ivB64: bytesToBase64(iv),
    ciphertextB64: bytesToBase64(new Uint8Array(encryptedBuffer)),
    plaintextSha256,
  };
}

export async function decryptJsonE2EE<T = unknown>(
  envelope: E2EEEnvelope,
  passphrase: string
): Promise<{ data: T; verifiedIntegrity: boolean }> {
  const salt = base64ToBytes(envelope.saltB64);
  const iv = base64ToBytes(envelope.ivB64);
  const ciphertext = base64ToBytes(envelope.ciphertextB64);

  const key = await deriveAesKey(passphrase, salt, envelope.iterations);

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );
    const decryptedBytes = new Uint8Array(decryptedBuffer);
    const computedHash = await sha256Hex(decryptedBytes);
    const jsonText = new TextDecoder().decode(decryptedBytes);
    return {
      data: JSON.parse(jsonText) as T,
      verifiedIntegrity: computedHash === envelope.plaintextSha256,
    };
  } catch {
    throw new Error('Clave incorrecta o datos cifrados alterados (falló verificación GCM).');
  }
}

/**
 * Genera un par de llaves criptográficas ECDSA P-256 en memoria/dispositivo para
 * respaldo biométrico/FIDO cuando el entorno restringe WebAuthn de plataforma.
 */
export async function generateDeviceSigningKeyPair(): Promise<{
  publicKeyJwk: JsonWebKey;
  privateKey: CryptoKey;
}> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify']
  );
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return { publicKeyJwk, privateKey: pair.privateKey };
}

export async function signChallengeEcdsa(privateKey: CryptoKey, challenge: string): Promise<string> {
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(challenge)
  );
  return bytesToBase64(new Uint8Array(sig));
}
