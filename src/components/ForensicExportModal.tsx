import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  FileArchive,
  FileSpreadsheet,
  FileText,
  MessageCircle,
  Printer,
  Share2,
  X,
} from 'lucide-react';
import {
  AuditedPayrollRow,
  AuditFinding,
  DigepresComparisonRow,
} from '../shared/dominicanPayroll.ts';
import { NobaciControlItem } from '../shared/seedData.ts';
import {
  AuditLogEntry,
  ForensicZipBundleResult,
  buildAuditedPayrollCsv,
  buildOfficialHtmlReport,
  generateForensicZipPackage,
  triggerFileDownload,
} from '../lib/forensicExport.ts';
import { sha256Hex } from '../lib/e2eeCrypto.ts';

interface ForensicExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  auditorName: string;
  auditedRows: AuditedPayrollRow[];
  findings: AuditFinding[];
  digepresComparisons: DigepresComparisonRow[];
  nobaciControls: NobaciControlItem[];
  auditLogs: AuditLogEntry[];
  onLogAuditEvent: (action: string, resource: string, detail: string) => Promise<void>;
}

export const ForensicExportModal: React.FC<ForensicExportModalProps> = ({
  isOpen,
  onClose,
  auditorName,
  auditedRows,
  findings,
  digepresComparisons,
  nobaciControls,
  auditLogs,
  onLogAuditEvent,
}) => {
  const [scope, setScope] = useState<string>('ALL');
  const [e2eePassphrase, setE2eePassphrase] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<ForensicZipBundleResult | null>(null);

  const institutions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of auditedRows) {
      map.set(r.record.institutionId, r.record.institutionName);
    }
    return Array.from(map.entries());
  }, [auditedRows]);

  if (!isOpen) return null;

  const scopedRows =
    scope === 'ALL' ? auditedRows : auditedRows.filter((r) => r.record.institutionId === scope);
  const scopedFindings =
    scope === 'ALL' ? findings : findings.filter((f) => f.institutionId === scope);
  const scopedComparisons =
    scope === 'ALL'
      ? digepresComparisons
      : digepresComparisons.filter((c) => c.institutionId === scope);

  const institutionLabel =
    scope === 'ALL'
      ? 'Consolidado_Estatal_CCRD'
      : institutions.find(([id]) => id === scope)?.[1] || scope;

  async function handleGenerateZip(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (e2eePassphrase.length < 6) {
      setError('Ingrese una clave E2EE de al menos 6 caracteres para proteger el anexo cifrado.');
      return;
    }
    setGenerating(true);
    try {
      const result = await generateForensicZipPackage({
        institutionLabel,
        auditorName,
        e2eePassphrase,
        rows: scopedRows,
        findings: scopedFindings,
        comparisons: scopedComparisons,
        nobaciControls,
        auditLogs,
      });
      setBundle(result);
      triggerFileDownload(result.blob, result.filename);
      await onLogAuditEvent(
        'EXPORTACION_ZIP_FORENSE',
        result.filename,
        `Paquete ZIP de ${result.fileCount} archivos generado y cifrado E2EE (Sello ${result.manifestHash.slice(0, 16)}...).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el paquete ZIP.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleShareFileNative() {
    if (!bundle) return;
    const file = new File([bundle.blob], bundle.filename, { type: 'application/zip' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: 'Paquete Forense CCRD',
          text: bundle.whatsappSummaryText,
          files: [file],
        });
        await onLogAuditEvent(
          'COMPARTIDO_NATIVO_ZIP',
          bundle.filename,
          'Paquete ZIP compartido mediante Web Share API.'
        );
        return;
      } catch {
        // Usuario canceló o sistema rechazó; cae al flujo WhatsApp URL abajo
      }
    }
    handleOpenWhatsApp();
  }

  async function handleOpenWhatsApp() {
    if (!bundle) return;
    const url = `https://wa.me/?text=${encodeURIComponent(bundle.whatsappSummaryText)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    await onLogAuditEvent(
      'ENVIO_WHATSAPP_RESUMEN',
      bundle.filename,
      'Resumen ejecutivo forense con sello SHA-256 preparado para envío vía WhatsApp.'
    );
  }

  async function handleDownloadCsv() {
    const csv = buildAuditedPayrollCsv(scopedRows, false);
    const fname = `CCRD_Nomina_Forense_${scope}.csv`;
    triggerFileDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fname);
    await onLogAuditEvent('EXPORTACION_CSV', fname, 'Exportación CSV estándar enmascarada (Ley 172-13).');
  }

  async function handleDownloadSignedJson() {
    const payload = {
      generadoEn: new Date().toISOString(),
      entidad: institutionLabel,
      auditor: auditorName,
      registros: scopedRows,
      hallazgos: scopedFindings,
      comparativosDigepres: scopedComparisons,
    };
    const digest = await sha256Hex(JSON.stringify(payload));
    const signed = { ...payload, sha256Integridad: digest };
    const fname = `CCRD_Expediente_Firmado_${scope}.json`;
    triggerFileDownload(
      new Blob([JSON.stringify(signed, null, 2)], { type: 'application/json;charset=utf-8' }),
      fname
    );
    await onLogAuditEvent('EXPORTACION_JSON_FIRMADO', fname, `JSON forense firmado SHA-256: ${digest.slice(0, 16)}...`);
  }

  async function handleDownloadHtmlReport() {
    const digest = await sha256Hex(JSON.stringify(scopedRows));
    const html = buildOfficialHtmlReport({
      institutionLabel,
      auditorName,
      rows: scopedRows,
      findings: scopedFindings,
      comparisons: scopedComparisons,
      integrityHash: digest,
    });
    const fname = `CCRD_Informe_Oficial_${scope}.html`;
    triggerFileDownload(new Blob([html], { type: 'text/html;charset=utf-8' }), fname);
    await onLogAuditEvent('EXPORTACION_INFORME_HTML', fname, 'Informe oficial de fiscalización generado.');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 max-h-[92vh] overflow-y-auto space-y-6">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Exportación Forense Estándar y Paquete ZIP para WhatsApp
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Incluye informes oficiales, CSVs, manifiesto SHA-256 y anexo de datos personales
              cifrados bajo AES-256-GCM (Ley 172-13).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Selector de alcance */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Alcance Institucional
            </label>
            <select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setBundle(null);
              }}
              className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
            >
              <option value="ALL">Todas las entidades ({auditedRows.length} registros)</option>
              {institutions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md">
            <p className="text-slate-500 dark:text-slate-400">Resumen del paquete</p>
            <p className="font-mono font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
              {scopedRows.length} registros · {scopedFindings.length} hallazgos
            </p>
          </div>
        </div>

        {/* Generación ZIP completo */}
        <form
          onSubmit={handleGenerateZip}
          className="p-5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-4"
        >
          <div className="flex items-center gap-2">
            <FileArchive className="w-4 h-4 text-blue-900 dark:text-blue-400" />
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Paquete ZIP Completo (9 archivos + Manifiesto SHA-256)
            </h4>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Clave E2EE para proteger datos personales sin enmascarar dentro del ZIP
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                required
                minLength={6}
                value={e2eePassphrase}
                onChange={(e) => setE2eePassphrase(e.target.value)}
                placeholder="Clave E2EE (mín. 6 caracteres)"
                className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md"
              />
              <button
                type="submit"
                disabled={generating}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold bg-blue-900 hover:bg-blue-800 text-white rounded-md whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileArchive className="w-3.5 h-3.5" />
                {generating ? 'Empaquetando...' : 'Generar y Descargar ZIP'}
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-red-700 dark:text-red-400">{error}</p>}

          {bundle && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-start gap-2 text-xs text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">
                    ZIP generado y descargado: <span className="font-mono">{bundle.filename}</span>
                  </p>
                  <p className="font-mono text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                    Manifiesto SHA-256: {bundle.manifestHash}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleOpenWhatsApp}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Enviar Resumen por WhatsApp
                </button>
                <button
                  type="button"
                  onClick={handleShareFileNative}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Adjuntar Archivo ZIP (Compartir)
                </button>
                <button
                  type="button"
                  onClick={() => triggerFileDownload(bundle.blob, bundle.filename)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Volver a descargar ZIP
                </button>
              </div>
            </div>
          )}
        </form>

        {/* Exportaciones individuales estándar */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Exportación directa por formato individual
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              CSV Forense (Excel)
            </button>
            <button
              type="button"
              onClick={handleDownloadSignedJson}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              JSON Firmado SHA-256
            </button>
            <button
              type="button"
              onClick={handleDownloadHtmlReport}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Informe Oficial HTML
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
