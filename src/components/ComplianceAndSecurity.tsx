import React, { useState } from 'react';
import {
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Lock,
  Monitor,
  ShieldCheck,
  Unlock,
  Upload,
} from 'lucide-react';
import { AuditedPayrollRow } from '../shared/dominicanPayroll.ts';
import { NobaciControlItem } from '../shared/seedData.ts';
import { registerBiometricOrFidoDevice } from '../lib/biometricClient.ts';
import { E2EEEnvelope, decryptJsonE2EE, encryptJsonE2EE } from '../lib/e2eeCrypto.ts';
import { AuditLogEntry, triggerFileDownload } from '../lib/forensicExport.ts';

interface ComplianceAndSecurityProps {
  mode: 'nobaci' | 'security';
  authToken: string;
  auditorName: string;
  auditedRows: AuditedPayrollRow[];
  nobaciControls: NobaciControlItem[];
  auditLogs: AuditLogEntry[];
  chainIntegrity: { valid: boolean; count: number; latestHash: string };
  onToggleNobaci: (id: string, verificado: boolean) => Promise<void>;
  onLogAuditEvent: (action: string, resource: string, detail: string) => Promise<void>;
}

export const ComplianceAndSecurity: React.FC<ComplianceAndSecurityProps> = ({
  mode,
  authToken,
  auditorName,
  auditedRows,
  nobaciControls,
  auditLogs,
  chainIntegrity,
  onToggleNobaci,
  onLogAuditEvent,
}) => {
  // E2EE Workbench states
  const [encryptPass, setEncryptPass] = useState('');
  const [encryptStatus, setEncryptStatus] = useState<string | null>(null);
  const [decryptPass, setDecryptPass] = useState('');
  const [uploadedEnvelope, setUploadedEnvelope] = useState<E2EEEnvelope | null>(null);
  const [decryptedPreview, setDecryptedPreview] = useState<{
    count: number;
    verified: boolean;
    sampleNames: string[];
  } | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);

  // Biometric registration state
  const [deviceLabel, setDeviceLabel] = useState('Estación Auditor CCRD');
  const [bioMessage, setBioMessage] = useState<string | null>(null);
  const [bioBusy, setBioBusy] = useState(false);

  const verifiedCount = nobaciControls.filter((c) => c.verificado).length;
  const compliancePct =
    nobaciControls.length > 0 ? Math.round((verifiedCount / nobaciControls.length) * 100) : 0;

  async function handleRegisterBiometric() {
    setBioBusy(true);
    setBioMessage(null);
    try {
      const reg = await registerBiometricOrFidoDevice(authToken, auditorName, deviceLabel);
      setBioMessage(
        `Dispositivo vinculado (${reg.deviceId} · ${
          reg.type === 'WEBAUTHN' ? 'Biometría WebAuthn' : 'Llave FIDO ECDSA P-256'
        }). Ya puede iniciar sesión sin contraseña desde este navegador.`
      );
      await onLogAuditEvent(
        'VINCULACION_BIOMETRIA_UI',
        reg.deviceId,
        `Dispositivo ${reg.label} registrado (${reg.type}).`
      );
    } catch (err) {
      setBioMessage(err instanceof Error ? err.message : 'Error registrando dispositivo.');
    } finally {
      setBioBusy(false);
    }
  }

  async function handleEncryptDataset(e: React.FormEvent) {
    e.preventDefault();
    setEncryptStatus(null);
    try {
      const payload = auditedRows.map((r) => ({
        record: r.record,
        calculation: r.calculation,
        findings: r.findings,
      }));
      const envelope = await encryptJsonE2EE(payload, encryptPass);
      const blob = new Blob([JSON.stringify(envelope, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      triggerFileDownload(blob, `CCRD_Boveda_E2EE_${new Date().toISOString().slice(0, 10)}.enc.json`);
      setEncryptStatus(
        `Paquete cifrado AES-256-GCM descargado. Sello SHA-256: ${envelope.plaintextSha256.slice(0, 20)}...`
      );
      await onLogAuditEvent(
        'CIFRADO_E2EE_AES256',
        'NOMINA_COMPLETA',
        `Cifrado AES-256-GCM completado (${payload.length} registros).`
      );
    } catch (err) {
      setEncryptStatus(err instanceof Error ? err.message : 'Error cifrando datos.');
    }
  }

  async function handleUploadEncryptedFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setDecryptError(null);
    setDecryptedPreview(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as E2EEEnvelope;
      if (parsed.algorithm !== 'AES-256-GCM' || !parsed.ciphertextB64) {
        setDecryptError('El archivo no corresponde a un sobre cifrado CCRD-E2EE.');
        return;
      }
      setUploadedEnvelope(parsed);
    } catch {
      setDecryptError('Archivo JSON cifrado inválido.');
    } finally {
      e.target.value = '';
    }
  }

  async function handleDecryptFile(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadedEnvelope) return;
    setDecryptError(null);
    try {
      const { data, verifiedIntegrity } = await decryptJsonE2EE<
        Array<{ record: { nombreCompleto: string } }>
      >(uploadedEnvelope, decryptPass);
      setDecryptedPreview({
        count: Array.isArray(data) ? data.length : 0,
        verified: verifiedIntegrity,
        sampleNames: Array.isArray(data)
          ? data.slice(0, 5).map((d) => d.record?.nombreCompleto || 'Registro')
          : [],
      });
      await onLogAuditEvent(
        'DESCIFRADO_E2EE_VERIFICADO',
        'PAQUETE_FORENSE',
        `Descifrado AES-256-GCM exitoso · Integridad SHA-256: ${verifiedIntegrity ? 'VALIDA' : 'ALTERADA'}`
      );
    } catch (err) {
      setDecryptError(err instanceof Error ? err.message : 'Error al descifrar.');
    }
  }

  if (mode === 'nobaci') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Cumplimiento Normativo NOBACI, Ley 172-13 y Estándares INTOSAI
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Evaluación automatizada de los 5 componentes de Control Interno y Protección de Datos
              Personales (Ley 172-13 · ISO/IEC 27001)
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 dark:text-slate-400">Controles Verificados</p>
            <p className="text-xl font-bold font-mono tabular-nums text-blue-900 dark:text-blue-400">
              {verifiedCount} / {nobaciControls.length} ({compliancePct}%)
            </p>
          </div>
        </div>

        {/* Matriz Ley 172-13 e Internacional */}
        <div className="grid grid-cols-1 md:grid-cols-3 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
          <div className="p-5">
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Ley 172-13 (Protección de Datos RD)
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
              Enmascaramiento por defecto de Cédulas (<span className="font-mono">001-****892-1</span>)
              y cuentas bancarias. Registro obligatorio de cada acceso a PII sin enmascarar.
            </p>
          </div>
          <div className="p-5">
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              ISO/IEC 27001 y Principios GDPR
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
              Minimización de datos en exportaciones abiertas y cifrado autenticado de extremo a
              extremo AES-256-GCM para intercambio seguro de expedientes.
            </p>
          </div>
          <div className="p-5">
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              INTOSAI ISSAI 100 / Ley 126-02
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
              Cadena de custodia documental mediante sellado criptográfico SHA-256 en manifiestos
              forenses y bitácora inmutable de auditoría.
            </p>
          </div>
        </div>

        {/* Lista de controles NOBACI */}
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg divide-y divide-slate-200 dark:divide-slate-800">
          {nobaciControls.map((item) => (
            <div key={item.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 max-w-3xl">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono font-semibold text-blue-900 dark:text-blue-400">
                    {item.codigo}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{item.componente}</span>
                  <span aria-hidden="true">·</span>
                  <span>{item.baseLegal}</span>
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {item.norma}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">{item.descripcion}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Evidencia automatizada: {item.evidencia}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onToggleNobaci(item.id, !item.verificado)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  item.verificado
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {item.verificado ? 'Control Verificado' : 'Marcar Verificado'}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Cifrado E2EE (AES-256-GCM), Biometría FIDO2 y Bitácora en Tiempo Real
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Garantía criptográfica de integridad financiera, vinculación biométrica y ejecución dual PC
          / Online.
        </p>
      </div>

      {/* Bóveda E2EE + Vinculación Biométrica */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cifrado y Descifrado E2EE */}
        <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-6 space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <Lock className="w-4 h-4 text-blue-900 dark:text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Bóveda de Cifrado E2EE (AES-256-GCM + PBKDF2-SHA256)
            </h3>
          </div>

          <form onSubmit={handleEncryptDataset} className="space-y-3">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Cifrar nómina completa auditada ({auditedRows.length} registros)
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                required
                minLength={6}
                value={encryptPass}
                onChange={(e) => setEncryptPass(e.target.value)}
                placeholder="Clave de cifrado E2EE (mín. 6 caracteres)"
                className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
              />
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold bg-blue-900 hover:bg-blue-800 text-white rounded-md whitespace-nowrap shrink-0 cursor-pointer"
              >
                Cifrar y Descargar
              </button>
            </div>
            {encryptStatus && (
              <p className="text-xs text-emerald-700 dark:text-emerald-400">{encryptStatus}</p>
            )}
          </form>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Verificar y descifrar paquete <span className="font-mono">.enc.json</span>
            </p>
            <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-md cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
              <Upload className="w-3.5 h-3.5" />
              {uploadedEnvelope ? 'Archivo cifrado cargado (listo para descifrar)' : 'Seleccionar .enc.json'}
              <input
                type="file"
                accept=".json"
                onChange={handleUploadEncryptedFile}
                className="hidden"
              />
            </label>

            {uploadedEnvelope && (
              <form onSubmit={handleDecryptFile} className="flex gap-2">
                <input
                  type="password"
                  required
                  value={decryptPass}
                  onChange={(e) => setDecryptPass(e.target.value)}
                  placeholder="Clave para descifrar paquete"
                  className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  Descifrar
                </button>
              </form>
            )}

            {decryptError && (
              <p className="text-xs text-red-700 dark:text-red-400">{decryptError}</p>
            )}
            {decryptedPreview && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded text-xs space-y-1">
                <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                  Descifrado verificado: {decryptedPreview.count} registros · Integridad SHA-256:{' '}
                  {decryptedPreview.verified ? 'Íntegra' : 'Fallida'}
                </p>
                <p className="text-slate-600 dark:text-slate-400">
                  Muestra: {decryptedPreview.sampleNames.join(', ')}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Biometría FIDO2 + Guía PC */}
        <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-6 space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <Fingerprint className="w-4 h-4 text-blue-900 dark:text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Autenticación Biométrica / FIDO2 y Ejecución en PC
            </h3>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Registre el sensor biométrico de su equipo (Windows Hello / Touch ID / Android) o una
              llave criptográfica ECDSA P-256 no exportable para iniciar sesión mediante
              reto-respuesta firmado.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={deviceLabel}
                onChange={(e) => setDeviceLabel(e.target.value)}
                placeholder="Nombre de estación"
                className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
              />
              <button
                type="button"
                disabled={bioBusy}
                onClick={handleRegisterBiometric}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-900 hover:bg-blue-800 text-white rounded-md whitespace-nowrap shrink-0 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                {bioBusy ? 'Vinculando...' : 'Vincular Biometría'}
              </button>
            </div>
            {bioMessage && (
              <p className="text-xs text-blue-900 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 p-2.5 rounded">
                {bioMessage}
              </p>
            )}
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <Monitor className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              Ejecución Dual: En su PC Local y Online
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-[11px] text-slate-700 dark:text-slate-300 space-y-1">
              <p>1. npm install</p>
              <p>2. npm run dev &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;# Modo local en http://localhost:3000</p>
              <p>3. npm run build && npm start &nbsp;# Producción PC / Cloud</p>
            </div>
          </div>
        </section>
      </div>

      {/* Bitácora Inmutable en Tiempo Real */}
      <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Bitácora de Auditoría en Tiempo Real (Cadena Hash SHA-256)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Último sello: <span className="font-mono">{chainIntegrity.latestHash.slice(0, 28)}...</span>
            </p>
          </div>
          <div
            className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
              chainIntegrity.valid
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-700 dark:text-red-400'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Cadena de Custodia: {chainIntegrity.valid ? `Íntegra (${chainIntegrity.count} eventos)` : 'Alteración Detectada'}
          </div>
        </div>

        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                <th className="py-2 px-3 text-left font-medium">#</th>
                <th className="py-2 px-3 text-left font-medium">Fecha / Hora</th>
                <th className="py-2 px-3 text-left font-medium">Auditor / Actor</th>
                <th className="py-2 px-3 text-left font-medium">Evento</th>
                <th className="py-2 px-3 text-left font-medium">Detalle</th>
                <th className="py-2 px-3 text-left font-medium">Hash SHA-256</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {auditLogs.map((log) => (
                <tr key={log.seq} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-2 px-3 font-mono tabular-nums text-slate-500">{log.seq}</td>
                  <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-400">
                    {new Date(log.timestamp).toLocaleString('es-DO')}
                  </td>
                  <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {log.actor}
                  </td>
                  <td className="py-2 px-3 font-mono text-blue-900 dark:text-blue-400 whitespace-nowrap">
                    {log.action}
                  </td>
                  <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{log.detail}</td>
                  <td className="py-2 px-3 font-mono text-slate-500 whitespace-nowrap">
                    {log.entryHash.slice(0, 14)}...
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
