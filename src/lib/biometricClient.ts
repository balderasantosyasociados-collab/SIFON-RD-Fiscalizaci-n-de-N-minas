import { signChallengeEcdsa } from './e2eeCrypto.ts';

const DB_NAME = 'ccrd_fido_vault';
const STORE_NAME = 'device_keys';

interface StoredLocalDeviceKey {
  deviceId: string;
  label: string;
  type: 'WEBAUTHN' | 'ECDSA_P256';
  credentialId?: string;
  privateKey?: CryptoKey;
  createdAt: string;
}

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'deviceId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveLocalDeviceKey(entry: StoredLocalDeviceKey): Promise<void> {
  const db = await openVaultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getStoredLocalDeviceKeys(): Promise<StoredLocalDeviceKey[]> {
  try {
    const db = await openVaultDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve((req.result as StoredLocalDeviceKey[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUint8Array(str: string): Uint8Array {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}

export async function isPlatformBiometricAvailable(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function registerBiometricOrFidoDevice(
  authToken: string,
  auditorName: string,
  label: string
): Promise<{ deviceId: string; type: 'WEBAUTHN' | 'ECDSA_P256'; label: string }> {
  const challengeRes = await fetch('/api/auth/biometric/challenge', { method: 'POST' });
  const { challenge } = (await challengeRes.json()) as { challengeId: string; challenge: string };

  const webAuthnOk = await isPlatformBiometricAvailable();
  if (webAuthnOk) {
    try {
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge: base64UrlToUint8Array(challenge) as BufferSource,
          rp: { name: 'SIFON-RD · Cámara de Cuentas RD' },
          user: {
            id: new TextEncoder().encode('ccrd-auditor-titular'),
            name: auditorName,
            displayName: auditorName,
          },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
          },
          timeout: 30000,
        },
      })) as PublicKeyCredential | null;

      if (cred) {
        const credentialId = bufferToBase64Url(cred.rawId);
        const regRes = await fetch('/api/auth/biometric/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            type: 'WEBAUTHN',
            label,
            credentialId,
          }),
        });
        if (!regRes.ok) {
          throw new Error('No se pudo registrar la credencial biométrica en el servidor.');
        }
        const { device } = await regRes.json();
        await saveLocalDeviceKey({
          deviceId: device.id,
          label: device.label,
          type: 'WEBAUTHN',
          credentialId,
          createdAt: device.registeredAt,
        });
        return { deviceId: device.id, type: 'WEBAUTHN', label: device.label };
      }
    } catch {
      // Si el iframe bloquea WebAuthn por Permissions-Policy, pasamos limpiamente a ECDSA P-256
    }
  }

  // Fallback criptográfico real ECDSA P-256 no exportable almacenado en IndexedDB
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);

  const regRes = await fetch('/api/auth/biometric/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      type: 'ECDSA_P256',
      label,
      publicKeyJwk,
    }),
  });
  if (!regRes.ok) {
    throw new Error('No se pudo registrar la llave criptográfica del dispositivo.');
  }
  const { device } = await regRes.json();
  await saveLocalDeviceKey({
    deviceId: device.id,
    label: device.label,
    type: 'ECDSA_P256',
    privateKey: pair.privateKey,
    createdAt: device.registeredAt,
  });

  return { deviceId: device.id, type: 'ECDSA_P256', label: device.label };
}

export async function authenticateWithBiometricDevice(): Promise<{
  token: string;
  auditorName: string;
  role: string;
  authMethod: string;
}> {
  const localKeys = await getStoredLocalDeviceKeys();
  if (localKeys.length === 0) {
    throw new Error('No hay dispositivo biométrico o llave FIDO registrada en este navegador.');
  }
  const latest = localKeys[localKeys.length - 1];

  const challengeRes = await fetch('/api/auth/biometric/challenge', { method: 'POST' });
  if (!challengeRes.ok) throw new Error('Error solicitando reto criptográfico.');
  const { challengeId, challenge } = (await challengeRes.json()) as {
    challengeId: string;
    challenge: string;
  };

  if (latest.type === 'WEBAUTHN' && latest.credentialId) {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: base64UrlToUint8Array(challenge) as BufferSource,
        allowCredentials: [
          {
            id: base64UrlToUint8Array(latest.credentialId) as BufferSource,
            type: 'public-key',
          },
        ],
        userVerification: 'required',
        timeout: 30000,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) throw new Error('Autenticación biométrica cancelada.');
    const response = assertion.response as AuthenticatorAssertionResponse;
    const clientDataB64 = bufferToBase64Url(response.clientDataJSON);

    const verifyRes = await fetch('/api/auth/biometric/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId,
        deviceId: latest.deviceId,
        clientDataB64,
      }),
    });
    const data = await verifyRes.json();
    if (!verifyRes.ok) throw new Error(data.error || 'Fallo de verificación biométrica.');
    return data;
  }

  if (latest.type === 'ECDSA_P256' && latest.privateKey) {
    const signatureB64 = await signChallengeEcdsa(latest.privateKey, challenge);
    const verifyRes = await fetch('/api/auth/biometric/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId,
        deviceId: latest.deviceId,
        signatureB64,
      }),
    });
    const data = await verifyRes.json();
    if (!verifyRes.ok) throw new Error(data.error || 'Fallo de firma FIDO ECDSA.');
    return data;
  }

  throw new Error('Llave local incompatible. Ingrese con su clave de auditor.');
}
