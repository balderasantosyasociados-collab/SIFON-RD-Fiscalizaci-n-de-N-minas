import React, { useEffect, useState } from 'react';
import { Fingerprint, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import {
  authenticateWithBiometricDevice,
  getStoredLocalDeviceKeys,
  isPlatformBiometricAvailable,
} from '../lib/biometricClient.ts';

export interface AuthSession {
  token: string;
  auditorName: string;
  role: string;
  authMethod: string;
}

interface AuthStatusResponse {
  configured: boolean;
  hasEnvPasscode: boolean;
  auditorName: string;
  biometricDevicesCount: number;
}

interface AuthGateProps {
  onAuthenticated: (session: AuthSession) => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ onAuthenticated }) => {
  const [status, setStatus] = useState<AuthStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [auditorName, setAuditorName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hasLocalBiometric, setHasLocalBiometric] = useState(false);
  const [platformWebAuthn, setPlatformWebAuthn] = useState(false);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const [res, localKeys, webAuthnOk] = await Promise.all([
          fetch('/api/auth/status'),
          getStoredLocalDeviceKeys(),
          isPlatformBiometricAvailable(),
        ]);
        const data = (await res.json()) as AuthStatusResponse;
        if (!active) return;
        setStatus(data);
        setHasLocalBiometric(localKeys.length > 0 && data.biometricDevicesCount > 0);
        setPlatformWebAuthn(webAuthnOk);
      } catch {
        if (active) setError('No se pudo conectar con el servidor de auditoría.');
      } finally {
        if (active) setLoadingStatus(false);
      }
    }
    init();
    return () => {
      active = false;
    };
  }, []);

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (passcode !== confirmPasscode) {
      setError('Las claves ingresadas no coinciden.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auditorName, passcode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo configurar la credencial.');
        return;
      }
      onAuthenticated(data as AuthSession);
    } catch {
      setError('Error de red al configurar credencial inicial.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Clave de acceso incorrecta.');
        return;
      }
      onAuthenticated(data as AuthSession);
    } catch {
      setError('Error de conexión al validar credenciales.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBiometricLogin() {
    setError(null);
    setSubmitting(true);
    try {
      const session = await authenticateWithBiometricDevice();
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falló la verificación biométrica.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <div className="w-full max-w-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 rounded-lg">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Verificando entorno criptográfico de la Cámara de Cuentas...
          </p>
        </div>
      </div>
    );
  }

  const isFirstRun = status ? !status.configured : false;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-12">
      <div className="w-full max-w-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-8">
        <div className="flex items-start justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div>
            <p className="text-xs font-medium text-blue-900 dark:text-blue-400">
              Cámara de Cuentas de la República Dominicana
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 mt-1">
              SIFON-RD · Fiscalización de Nóminas
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
              Control NOBACI · Ley 172-13 · Cifrado E2EE AES-256-GCM
            </p>
          </div>
          <div className="p-2.5 border border-slate-200 dark:border-slate-800 rounded-md text-blue-900 dark:text-blue-400 shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>

        {isFirstRun ? (
          <form onSubmit={handleClaim} className="mt-6 space-y-4">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md">
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <strong>Configuración inicial de estación de auditoría:</strong> Registre la
                credencial del auditor titular. Se cifrará en el servidor mediante algoritmo
                criptográfico <span className="font-mono">scrypt</span> y luego podrá vincular su
                acceso biométrico o llave FIDO2.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Nombre completo del Auditor Titular
              </label>
              <input
                type="text"
                required
                minLength={3}
                value={auditorName}
                onChange={(e) => setAuditorName(e.target.value)}
                placeholder="Ej. Lic. Ramón Eduardo Valdés"
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-900 dark:focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Clave de acceso administrativo (mínimo 8 caracteres)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Ingrese clave segura"
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-900 dark:focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Confirmar clave de acceso
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPasscode}
                onChange={(e) => setConfirmPasscode(e.target.value)}
                placeholder="Repita la clave"
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-900 dark:focus:ring-blue-500"
              />
            </div>

            {error && (
              <p className="text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2 rounded-md">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              {submitting ? 'Registrando credencial...' : 'Establecer Credencial e Ingresar'}
            </button>
          </form>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
              <span>Auditor autorizado: {status?.auditorName}</span>
              <span>
                {platformWebAuthn ? 'Biometría de plataforma lista' : 'Verificación FIDO2 disponible'}
              </span>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Clave institucional de auditor
                </label>
                <input
                  type="password"
                  required
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-900 dark:focus:ring-blue-500"
                />
              </div>

              {error && (
                <p className="text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2 rounded-md">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                {submitting ? 'Verificando...' : 'Acceder al Sistema de Auditoría'}
              </button>
            </form>

            {hasLocalBiometric && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleBiometricLogin}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Fingerprint className="w-4 h-4 text-blue-900 dark:text-blue-400" />
                  Ingresar con Biometría / Llave FIDO2 Registrada
                </button>
              </div>
            )}

            {!hasLocalBiometric && (
              <p className="text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-800">
                Nota: Tras iniciar sesión con su clave, puede vincular su sensor biométrico o llave
                criptográfica FIDO2 desde el módulo Cifrado E2EE y Bitácora.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
