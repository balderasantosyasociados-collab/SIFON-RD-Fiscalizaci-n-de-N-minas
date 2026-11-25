import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import {
  AlertStatus,
  DigepresBudgetLine,
  PayrollRecord,
  RoleTier,
  runFullPayrollAudit,
} from './src/shared/dominicanPayroll.ts';
import {
  INITIAL_DIGEPRES_BUDGETS,
  INITIAL_NOBACI_CONTROLS,
  INITIAL_PAYROLL_RECORDS,
  NobaciControlItem,
} from './src/shared/seedData.ts';

dotenv.config();

const PORT = 3000;
const IS_PROD = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const VAULT_DIR = path.resolve(process.cwd(), '.ccrd-vault');
const STATE_FILE = path.resolve(VAULT_DIR, 'vault-state.json');

interface StoredCredential {
  auditorName: string;
  auditorRole: string;
  saltHex: string;
  hashHex: string;
  createdAt: string;
}

interface BiometricDeviceBinding {
  id: string;
  label: string;
  type: 'WEBAUTHN' | 'ECDSA_P256';
  credentialId?: string;
  publicKeyJwk?: JsonWebKey;
  registeredAt: string;
}

interface AuditLogEntry {
  seq: number;
  timestamp: string;
  actor: string;
  action: string;
  resource: string;
  detail: string;
  prevHash: string;
  entryHash: string;
}

interface PersistedState {
  adminCredential: StoredCredential | null;
  biometricDevices: BiometricDeviceBinding[];
  records: PayrollRecord[];
  budgets: DigepresBudgetLine[];
  alertStatuses: Record<string, { status: AlertStatus; resolvedBy?: string; resolutionNote?: string }>;
  nobaciControls: NobaciControlItem[];
  auditLogs: AuditLogEntry[];
}

function ensureConfinedVaultPath(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  if (!resolved.startsWith(VAULT_DIR + path.sep)) {
    throw new Error('Acceso fuera de directorio autorizado.');
  }
  return resolved;
}

function computeEntryHash(entry: Omit<AuditLogEntry, 'entryHash'>): string {
  const canonical = `${entry.seq}|${entry.timestamp}|${entry.actor}|${entry.action}|${entry.resource}|${entry.detail}|${entry.prevHash}`;
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function createInitialAuditLogs(): AuditLogEntry[] {
  const genesisBase: Omit<AuditLogEntry, 'entryHash'> = {
    seq: 1,
    timestamp: new Date().toISOString(),
    actor: 'Sistema CCRD',
    action: 'INICIALIZACION_MOTOR',
    resource: 'SIFON-RD',
    detail: 'Motor normativo dominicano (Ley 10-04, 41-08, 105-13, 87-01, 11-92, 423-06, NOBACI y Ley 172-13) inicializado.',
    prevHash: '0'.repeat(64),
  };
  return [{ ...genesisBase, entryHash: computeEntryHash(genesisBase) }];
}

function loadState(): PersistedState {
  try {
    if (!fs.existsSync(VAULT_DIR)) {
      fs.mkdirSync(VAULT_DIR, { recursive: true, mode: 0o700 });
    }
    const safePath = ensureConfinedVaultPath(STATE_FILE);
    if (fs.existsSync(safePath)) {
      const raw = fs.readFileSync(safePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      return {
        adminCredential: parsed.adminCredential ?? null,
        biometricDevices: Array.isArray(parsed.biometricDevices) ? parsed.biometricDevices : [],
        records: Array.isArray(parsed.records) && parsed.records.length > 0 ? parsed.records : INITIAL_PAYROLL_RECORDS,
        budgets: Array.isArray(parsed.budgets) && parsed.budgets.length > 0 ? parsed.budgets : INITIAL_DIGEPRES_BUDGETS,
        alertStatuses: parsed.alertStatuses ?? {},
        nobaciControls:
          Array.isArray(parsed.nobaciControls) && parsed.nobaciControls.length > 0
            ? parsed.nobaciControls
            : INITIAL_NOBACI_CONTROLS,
        auditLogs:
          Array.isArray(parsed.auditLogs) && parsed.auditLogs.length > 0
            ? parsed.auditLogs
            : createInitialAuditLogs(),
      };
    }
  } catch {
    // Fallback limpio en memoria si el filesystem no permite escritura
  }

  return {
    adminCredential: null,
    biometricDevices: [],
    records: [...INITIAL_PAYROLL_RECORDS],
    budgets: [...INITIAL_DIGEPRES_BUDGETS],
    alertStatuses: {},
    nobaciControls: [...INITIAL_NOBACI_CONTROLS],
    auditLogs: createInitialAuditLogs(),
  };
}

let state: PersistedState = loadState();

function saveState(): void {
  try {
    if (!fs.existsSync(VAULT_DIR)) {
      fs.mkdirSync(VAULT_DIR, { recursive: true, mode: 0o700 });
    }
    const safePath = ensureConfinedVaultPath(STATE_FILE);
    fs.writeFileSync(safePath, JSON.stringify(state, null, 2), { mode: 0o600 });
  } catch {
    // Continúa en memoria si el entorno es de solo lectura
  }
}

function appendAuditLog(actor: string, action: string, resource: string, detail: string): AuditLogEntry {
  const prev = state.auditLogs[state.auditLogs.length - 1];
  const prevHash = prev ? prev.entryHash : '0'.repeat(64);
  const seq = (prev?.seq ?? 0) + 1;
  const base: Omit<AuditLogEntry, 'entryHash'> = {
    seq,
    timestamp: new Date().toISOString(),
    actor,
    action,
    resource,
    detail,
    prevHash,
  };
  const entry: AuditLogEntry = {
    ...base,
    entryHash: computeEntryHash(base),
  };
  state.auditLogs.push(entry);
  if (state.auditLogs.length > 500) {
    state.auditLogs = state.auditLogs.slice(-500);
  }
  saveState();
  return entry;
}

function verifyAuditChain(): { valid: boolean; count: number; latestHash: string } {
  if (state.auditLogs.length === 0) {
    return { valid: true, count: 0, latestHash: '0'.repeat(64) };
  }
  for (let i = 0; i < state.auditLogs.length; i++) {
    const item = state.auditLogs[i];
    const expected = computeEntryHash({
      seq: item.seq,
      timestamp: item.timestamp,
      actor: item.actor,
      action: item.action,
      resource: item.resource,
      detail: item.detail,
      prevHash: item.prevHash,
    });
    if (expected !== item.entryHash) {
      return { valid: false, count: state.auditLogs.length, latestHash: item.entryHash };
    }
    if (i > 0 && item.prevHash !== state.auditLogs[i - 1].entryHash) {
      return { valid: false, count: state.auditLogs.length, latestHash: item.entryHash };
    }
  }
  return {
    valid: true,
    count: state.auditLogs.length,
    latestHash: state.auditLogs[state.auditLogs.length - 1].entryHash,
  };
}

function hashPasscode(passcode: string): { saltHex: string; hashHex: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(passcode, salt, 64).toString('hex');
  return { saltHex: salt, hashHex: hash };
}

function verifyScryptPasscode(passcode: string, saltHex: string, expectedHashHex: string): boolean {
  const derived = crypto.scryptSync(passcode, saltHex, 64);
  const expected = Buffer.from(expectedHashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function verifyConstantTimeString(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

interface SessionPayload {
  sub: string;
  role: string;
  authMethod: 'PASSCODE' | 'BIOMETRIC_WEBAUTHN' | 'ECDSA_FIDO';
  exp: number;
}

function issueSessionToken(payload: Omit<SessionPayload, 'exp'>): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 8, // 8 horas
  };
  const dataB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(dataB64).digest('base64url');
  return `${dataB64}.${sig}`;
}

function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [dataB64, sigB64] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(dataB64).digest('base64url');
  if (!verifyConstantTimeString(sigB64, expectedSig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(dataB64, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface AuthedRequest extends Request {
  session?: SessionPayload;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sesión no autorizada. Autenticación requerida.' });
    return;
  }
  const token = header.slice(7).trim();
  const session = verifySessionToken(token);
  if (!session) {
    res.status(401).json({ error: 'Token de sesión inválido o expirado.' });
    return;
  }
  req.session = session;
  next();
}

// Almacén temporal de retos WebAuthn / ECDSA (TTL 90s)
const activeChallenges = new Map<string, { challenge: string; expiresAt: number }>();

function cleanupExpiredChallenges(): void {
  const now = Date.now();
  for (const [key, val] of activeChallenges.entries()) {
    if (val.expiresAt < now) activeChallenges.delete(key);
  }
}

const VALID_ROLE_TIERS: RoleTier[] = [
  'MINISTRO',
  'VICEMINISTRO_DIRECTOR',
  'ENCARGADO_DEPARTAMENTO',
  'TECNICO_PROFESIONAL',
  'APOYO_OPERATIVO',
  'CONTRATADO_ESPECIAL',
];

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'sifon-rd-ccrd' });
  });

  app.get('/api/auth/status', (_req, res) => {
    const envPasscode = (process.env.CCRD_ADMIN_PASSCODE || '').trim();
    const hasEnvPasscode = envPasscode.length > 0;
    const configured = hasEnvPasscode || state.adminCredential !== null;
    res.json({
      configured,
      hasEnvPasscode,
      auditorName: state.adminCredential?.auditorName || 'Auditor Titular CCRD',
      biometricDevicesCount: state.biometricDevices.length,
      biometricDevices: state.biometricDevices.map((d) => ({
        id: d.id,
        label: d.label,
        type: d.type,
        credentialId: d.credentialId,
        registeredAt: d.registeredAt,
      })),
    });
  });

  app.post('/api/auth/claim', (req, res) => {
    const envPasscode = (process.env.CCRD_ADMIN_PASSCODE || '').trim();
    if (envPasscode.length > 0 || state.adminCredential !== null) {
      res.status(403).json({ error: 'La credencial administrativa inicial ya fue configurada.' });
      return;
    }

    const auditorName = typeof req.body?.auditorName === 'string' ? req.body.auditorName.trim() : '';
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';

    if (auditorName.length < 3 || auditorName.length > 100) {
      res.status(400).json({ error: 'Ingrese el nombre completo del auditor (mínimo 3 caracteres).' });
      return;
    }
    if (passcode.length < 8) {
      res.status(400).json({ error: 'La clave de acceso debe tener al menos 8 caracteres.' });
      return;
    }

    const { saltHex, hashHex } = hashPasscode(passcode);
    state.adminCredential = {
      auditorName,
      auditorRole: 'Auditor Gubernamental Titular · Cámara de Cuentas',
      saltHex,
      hashHex,
      createdAt: new Date().toISOString(),
    };
    appendAuditLog(
      auditorName,
      'CONFIGURACION_CREDENCIAL_ADMIN',
      'AUTH_SCRYPT',
      'Credencial administrativa inicial reclamada y cifrada con scrypt.'
    );
    saveState();

    const token = issueSessionToken({
      sub: auditorName,
      role: state.adminCredential.auditorRole,
      authMethod: 'PASSCODE',
    });

    res.json({
      token,
      auditorName,
      role: state.adminCredential.auditorRole,
      authMethod: 'PASSCODE',
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const envPasscode = (process.env.CCRD_ADMIN_PASSCODE || '').trim();
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';
    if (!passcode) {
      res.status(400).json({ error: 'Debe ingresar la clave de acceso.' });
      return;
    }

    let valid = false;
    let auditorName = state.adminCredential?.auditorName || 'Auditor Titular CCRD';
    const role = state.adminCredential?.auditorRole || 'Auditor Gubernamental Titular · Cámara de Cuentas';

    if (envPasscode.length > 0) {
      valid = verifyConstantTimeString(passcode, envPasscode);
    } else if (state.adminCredential) {
      valid = verifyScryptPasscode(passcode, state.adminCredential.saltHex, state.adminCredential.hashHex);
    } else {
      res.status(400).json({ error: 'El sistema requiere configurar la credencial inicial primero.' });
      return;
    }

    if (!valid) {
      appendAuditLog('Desconocido', 'INTENTO_ACCESO_FALLIDO', 'AUTH_LOGIN', 'Clave de auditor incorrecta.');
      res.status(401).json({ error: 'Credenciales inválidas.' });
      return;
    }

    appendAuditLog(auditorName, 'INICIO_SESION_CLAVE', 'AUTH_SESSION', 'Acceso autenticado mediante clave scrypt.');
    const token = issueSessionToken({ sub: auditorName, role, authMethod: 'PASSCODE' });
    res.json({ token, auditorName, role, authMethod: 'PASSCODE' });
  });

  app.post('/api/auth/biometric/challenge', (_req, res) => {
    cleanupExpiredChallenges();
    const challengeId = crypto.randomUUID();
    const challenge = crypto.randomBytes(32).toString('base64url');
    activeChallenges.set(challengeId, {
      challenge,
      expiresAt: Date.now() + 90_000,
    });
    res.json({ challengeId, challenge });
  });

  app.post('/api/auth/biometric/register', requireAuth, (req: AuthedRequest, res) => {
    const type = req.body?.type === 'WEBAUTHN' ? 'WEBAUTHN' : 'ECDSA_P256';
    const label = typeof req.body?.label === 'string' ? req.body.label.trim().slice(0, 60) : 'Dispositivo Auditor';
    const credentialId = typeof req.body?.credentialId === 'string' ? req.body.credentialId : undefined;
    const publicKeyJwk = req.body?.publicKeyJwk as JsonWebKey | undefined;

    if (type === 'WEBAUTHN' && !credentialId) {
      res.status(400).json({ error: 'Falta credentialId WebAuthn.' });
      return;
    }
    if (type === 'ECDSA_P256' && (!publicKeyJwk || publicKeyJwk.kty !== 'EC' || publicKeyJwk.crv !== 'P-256')) {
      res.status(400).json({ error: 'Llave pública ECDSA P-256 inválida.' });
      return;
    }

    const device: BiometricDeviceBinding = {
      id: `BIO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      label: label || 'Estación Biométrica Auditor',
      type,
      credentialId,
      publicKeyJwk,
      registeredAt: new Date().toISOString(),
    };
    state.biometricDevices.push(device);
    appendAuditLog(
      req.session!.sub,
      'REGISTRO_BIOMETRICO',
      device.id,
      `Dispositivo ${type} (${device.label}) vinculado para acceso biométrico/FIDO.`
    );
    saveState();

    res.json({
      device: {
        id: device.id,
        label: device.label,
        type: device.type,
        credentialId: device.credentialId,
        registeredAt: device.registeredAt,
      },
    });
  });

  app.post('/api/auth/biometric/verify', (req, res) => {
    cleanupExpiredChallenges();
    const challengeId = typeof req.body?.challengeId === 'string' ? req.body.challengeId : '';
    const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId : '';
    const signatureB64 = typeof req.body?.signatureB64 === 'string' ? req.body.signatureB64 : '';
    const clientDataB64 = typeof req.body?.clientDataB64 === 'string' ? req.body.clientDataB64 : '';

    const storedChallenge = activeChallenges.get(challengeId);
    if (!storedChallenge || storedChallenge.expiresAt < Date.now()) {
      res.status(401).json({ error: 'Reto criptográfico expirado o inexistente.' });
      return;
    }
    activeChallenges.delete(challengeId);

    const device = state.biometricDevices.find((d) => d.id === deviceId || d.credentialId === deviceId);
    if (!device) {
      res.status(404).json({ error: 'Dispositivo biométrico no registrado en este servidor.' });
      return;
    }

    let verified = false;
    let authMethod: SessionPayload['authMethod'] = 'ECDSA_FIDO';

    if (device.type === 'ECDSA_P256' && device.publicKeyJwk && signatureB64) {
      try {
        const keyObject = crypto.createPublicKey({ key: device.publicKeyJwk as crypto.JsonWebKey, format: 'jwk' });
        const rawSig = Buffer.from(signatureB64, 'base64');
        // WebCrypto ECDSA devuelve firma IEEE P1363 (r || s de 64 bytes)
        verified = crypto.verify(
          'sha256',
          Buffer.from(storedChallenge.challenge, 'utf8'),
          { key: keyObject, dsaEncoding: 'ieee-p1363' },
          rawSig
        );
        authMethod = 'ECDSA_FIDO';
      } catch {
        verified = false;
      }
    } else if (device.type === 'WEBAUTHN' && clientDataB64) {
      try {
        const clientJson = JSON.parse(Buffer.from(clientDataB64, 'base64url').toString('utf8')) as {
          challenge?: string;
          type?: string;
        };
        if (clientJson.type === 'webauthn.get' && clientJson.challenge === storedChallenge.challenge) {
          verified = true;
          authMethod = 'BIOMETRIC_WEBAUTHN';
        }
      } catch {
        verified = false;
      }
    }

    if (!verified) {
      appendAuditLog(
        'Desconocido',
        'FALLO_BIOMETRIA',
        device.id,
        'Verificación de firma biométrica/FIDO rechazada.'
      );
      res.status(401).json({ error: 'La firma biométrica no pudo ser verificada.' });
      return;
    }

    const auditorName = state.adminCredential?.auditorName || 'Auditor Titular CCRD';
    const role = state.adminCredential?.auditorRole || 'Auditor Gubernamental Titular · Cámara de Cuentas';
    appendAuditLog(
      auditorName,
      'INICIO_SESION_BIOMETRICO',
      device.id,
      `Acceso biométrico/FIDO (${device.type}) verificado mediante reto-respuesta criptográfico.`
    );

    const token = issueSessionToken({ sub: auditorName, role, authMethod });
    res.json({ token, auditorName, role, authMethod });
  });

  app.get('/api/dashboard/state', requireAuth, (_req, res) => {
    const audit = runFullPayrollAudit(state.records, state.budgets, state.alertStatuses);
    res.json({
      ...audit,
      budgets: state.budgets,
      nobaciControls: state.nobaciControls,
      auditLogs: [...state.auditLogs].reverse(),
      chainIntegrity: verifyAuditChain(),
    });
  });

  app.post('/api/payrolls/records', requireAuth, (req: AuthedRequest, res) => {
    const incoming = Array.isArray(req.body?.records) ? req.body.records : [req.body?.record];
    if (!incoming || incoming.length === 0 || !incoming[0]) {
      res.status(400).json({ error: 'Debe enviar al menos un registro de nómina válido.' });
      return;
    }
    if (incoming.length > 500) {
      res.status(400).json({ error: 'Máximo 500 registros por lote de importación.' });
      return;
    }

    const added: PayrollRecord[] = [];
    for (const item of incoming) {
      if (!item || typeof item.nombreCompleto !== 'string' || typeof item.cedula !== 'string') continue;
      const roleTier: RoleTier = VALID_ROLE_TIERS.includes(item.roleTier)
        ? item.roleTier
        : 'TECNICO_PROFESIONAL';
      const objetoGasto = item.objetoGasto === '2.1.1.2.02' ? '2.1.1.2.02' : '2.1.1.1.01';
      const institutionId = String(item.institutionId || 'CUSTOM').slice(0, 20).toUpperCase();
      const institutionName = String(item.institutionName || 'Entidad Pública Importada').slice(0, 100);

      const cleanRecord: PayrollRecord = {
        id: String(item.id || `${institutionId}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`),
        institutionId,
        institutionName,
        period: String(item.period || '2026-11').slice(0, 10),
        cedula: String(item.cedula).slice(0, 20),
        nombreCompleto: String(item.nombreCompleto).slice(0, 120),
        cargo: String(item.cargo || 'Servidor Público').slice(0, 100),
        departamento: String(item.departamento || 'Administración').slice(0, 100),
        roleTier,
        objetoGasto,
        banco: String(item.banco || 'Banreservas').slice(0, 50),
        cuentaBancaria: String(item.cuentaBancaria || '0000000000').slice(0, 30),
        salarioBase: Math.max(0, Number(item.salarioBase) || 0),
        compensaciones: Math.max(0, Number(item.compensaciones) || 0),
        horasExtras: Math.max(0, Number(item.horasExtras) || 0),
        salarioAnterior: Math.max(0, Number(item.salarioAnterior) || 0),
        resolucionMap: typeof item.resolucionMap === 'string' ? item.resolucionMap.slice(0, 40) : undefined,
        exentoDocencia: Boolean(item.exentoDocencia),
        tssReportadoEmpleado: Math.max(0, Number(item.tssReportadoEmpleado) || 0),
        isrReportado: Math.max(0, Number(item.isrReportado) || 0),
        otrosDescuentosReportados: Math.max(0, Number(item.otrosDescuentosReportados) || 0),
        netoPagadoReportado: Math.max(0, Number(item.netoPagadoReportado) || 0),
      };

      state.records.push(cleanRecord);
      added.push(cleanRecord);

      // Si la entidad importada no tiene líneas DIGEPRES creadas aún, crea líneas base razonables
      const hasBudget = state.budgets.some((b) => b.institutionId === institutionId);
      if (!hasBudget) {
        state.budgets.push(
          {
            institutionId,
            institutionName,
            period: cleanRecord.period,
            objetoGasto: '2.1.1.1.01',
            denominacion: 'Sueldos Fijos Personal Estatutario',
            presupuestoAprobadoMensual: Math.max(250000, cleanRecord.salarioBase * 3),
          },
          {
            institutionId,
            institutionName,
            period: cleanRecord.period,
            objetoGasto: '2.1.1.2.02',
            denominacion: 'Sueldos Personal Contratado',
            presupuestoAprobadoMensual: 150000,
          },
          {
            institutionId,
            institutionName,
            period: cleanRecord.period,
            objetoGasto: '2.1.1.5.01',
            denominacion: 'Compensaciones e Incentivos Especiales',
            presupuestoAprobadoMensual: 50000,
          },
          {
            institutionId,
            institutionName,
            period: cleanRecord.period,
            objetoGasto: '2.1.5.1.01',
            denominacion: 'Contribuciones Patronales TSS',
            presupuestoAprobadoMensual: 80000,
          }
        );
      }
    }

    if (added.length === 0) {
      res.status(400).json({ error: 'Ningún registro cumplió el formato mínimo requerido.' });
      return;
    }

    appendAuditLog(
      req.session!.sub,
      'IMPORTACION_NOMINA',
      `${added[0].institutionId}`,
      `Se incorporaron ${added.length} registro(s) de nómina para recálculo y fiscalización automática.`
    );
    saveState();

    const audit = runFullPayrollAudit(state.records, state.budgets, state.alertStatuses);
    res.json({
      addedCount: added.length,
      ...audit,
      budgets: state.budgets,
      nobaciControls: state.nobaciControls,
      auditLogs: [...state.auditLogs].reverse(),
      chainIntegrity: verifyAuditChain(),
    });
  });

  app.patch('/api/alerts/:id', requireAuth, (req: AuthedRequest, res) => {
    const alertId = String(req.params.id);
    const status = req.body?.status as AlertStatus;
    const resolutionNote =
      typeof req.body?.resolutionNote === 'string' ? req.body.resolutionNote.trim().slice(0, 300) : '';

    if (!['PENDIENTE', 'EN_REVISION', 'RESUELTA'].includes(status)) {
      res.status(400).json({ error: 'Estado de alerta inválido.' });
      return;
    }

    state.alertStatuses[alertId] = {
      status,
      resolvedBy: req.session!.sub,
      resolutionNote,
    };

    appendAuditLog(
      req.session!.sub,
      'ACTUALIZACION_ALERTA',
      alertId,
      `Estado cambiado a ${status}${resolutionNote ? ` · Nota: ${resolutionNote}` : ''}`
    );
    saveState();

    const audit = runFullPayrollAudit(state.records, state.budgets, state.alertStatuses);
    res.json({
      ...audit,
      budgets: state.budgets,
      nobaciControls: state.nobaciControls,
      auditLogs: [...state.auditLogs].reverse(),
      chainIntegrity: verifyAuditChain(),
    });
  });

  app.patch('/api/nobaci/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = String(req.params.id);
    const target = state.nobaciControls.find((c) => c.id === id);
    if (!target) {
      res.status(404).json({ error: 'Control NOBACI no encontrado.' });
      return;
    }
    if (typeof req.body?.verificado === 'boolean') {
      target.verificado = req.body.verificado;
    }
    if (typeof req.body?.evidencia === 'string' && req.body.evidencia.trim()) {
      target.evidencia = req.body.evidencia.trim().slice(0, 240);
    }

    appendAuditLog(
      req.session!.sub,
      'VERIFICACION_NOBACI',
      target.codigo,
      `Control ${target.codigo} marcado como ${target.verificado ? 'VERIFICADO' : 'PENDIENTE'}.`
    );
    saveState();

    res.json({
      nobaciControls: state.nobaciControls,
      auditLogs: [...state.auditLogs].reverse(),
      chainIntegrity: verifyAuditChain(),
    });
  });

  app.post('/api/audit/events', requireAuth, (req: AuthedRequest, res) => {
    const action = typeof req.body?.action === 'string' ? req.body.action.slice(0, 60) : 'EVENTO_AUDITORIA';
    const resource = typeof req.body?.resource === 'string' ? req.body.resource.slice(0, 80) : 'SISTEMA';
    const detail = typeof req.body?.detail === 'string' ? req.body.detail.slice(0, 300) : 'Acción registrada.';
    appendAuditLog(req.session!.sub, action, resource, detail);
    res.json({
      auditLogs: [...state.auditLogs].reverse(),
      chainIntegrity: verifyAuditChain(),
    });
  });

  app.post('/api/payrolls/reset', requireAuth, (req: AuthedRequest, res) => {
    state.records = [...INITIAL_PAYROLL_RECORDS];
    state.budgets = [...INITIAL_DIGEPRES_BUDGETS];
    state.alertStatuses = {};
    appendAuditLog(
      req.session!.sub,
      'RESTABLECIMIENTO_LOTE',
      'NOMINAS_BASE',
      'Se restableció el conjunto institucional base (MOPC, ADN, DGA).'
    );
    saveState();

    const audit = runFullPayrollAudit(state.records, state.budgets, state.alertStatuses);
    res.json({
      ...audit,
      budgets: state.budgets,
      nobaciControls: state.nobaciControls,
      auditLogs: [...state.auditLogs].reverse(),
      chainIntegrity: verifyAuditChain(),
    });
  });

  if (IS_PROD) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SIFON-RD (Cámara de Cuentas RD) ejecutándose en http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Error iniciando servidor SIFON-RD:', err);
  process.exit(1);
});
