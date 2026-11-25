import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  FileUp,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  AuditedPayrollRow,
  PayrollRecord,
  ROLE_TIER_CAPS,
  RoleTier,
  calculateDominicanPayroll,
  formatRd,
  maskAccount,
  maskCedula,
} from '../shared/dominicanPayroll.ts';

interface PayrollAuditTableProps {
  auditedRows: AuditedPayrollRow[];
  selectedInstitution: string;
  focusedRecordId: string | null;
  onClearFocus: () => void;
  onImportRecords: (records: Array<Partial<PayrollRecord>>) => Promise<void>;
  onResetDataset: () => Promise<void>;
  onLogAuditEvent: (action: string, resource: string, detail: string) => Promise<void>;
}

export const PayrollAuditTable: React.FC<PayrollAuditTableProps> = ({
  auditedRows,
  selectedInstitution,
  focusedRecordId,
  onClearFocus,
  onImportRecords,
  onResetDataset,
  onLogAuditEvent,
}) => {
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<'ALL' | 'CONFORME' | 'OBSERVACION' | 'HALLAZGO_CRITICO'>('ALL');
  const [piiUnmasked, setPiiUnmasked] = useState(false);
  const [inspectedRow, setInspectedRow] = useState<AuditedPayrollRow | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  // Formulario rápido de registro manual
  const [newRecord, setNewRecord] = useState({
    institutionId: 'MOPC',
    institutionName: 'Ministerio de Obras Públicas (MOPC)',
    cedula: '',
    nombreCompleto: '',
    cargo: '',
    departamento: 'Administración',
    roleTier: 'TECNICO_PROFESIONAL' as RoleTier,
    objetoGasto: '2.1.1.1.01' as '2.1.1.1.01' | '2.1.1.2.02',
    salarioBase: '75000',
    compensaciones: '0',
    horasExtras: '0',
    salarioAnterior: '75000',
    tssReportadoEmpleado: '',
    isrReportado: '',
  });

  const activeInspected = useMemo(() => {
    if (inspectedRow) {
      return auditedRows.find((r) => r.record.id === inspectedRow.record.id) ?? inspectedRow;
    }
    if (focusedRecordId) {
      return auditedRows.find((r) => r.record.id === focusedRecordId) ?? null;
    }
    return null;
  }, [inspectedRow, focusedRecordId, auditedRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return auditedRows.filter((row) => {
      if (selectedInstitution !== 'ALL' && row.record.institutionId !== selectedInstitution) return false;
      if (riskFilter !== 'ALL' && row.riesgoNivel !== riskFilter) return false;
      if (!q) return true;
      return (
        row.record.nombreCompleto.toLowerCase().includes(q) ||
        row.record.cargo.toLowerCase().includes(q) ||
        row.record.institutionName.toLowerCase().includes(q) ||
        (piiUnmasked && row.record.cedula.toLowerCase().includes(q)) ||
        row.record.id.toLowerCase().includes(q)
      );
    });
  }, [auditedRows, selectedInstitution, riskFilter, search, piiUnmasked]);

  async function togglePiiVisibility() {
    const next = !piiUnmasked;
    setPiiUnmasked(next);
    await onLogAuditEvent(
      next ? 'DESENMASCARAMIENTO_PII_LEY172_13' : 'ENMASCARAMIENTO_PII_LEY172_13',
      'NOMINA_PII',
      next
        ? 'Auditor autorizado habilitó visualización de cédulas y cuentas bancarias.'
        : 'Visualización de datos personales restablecida a modo enmascarado.'
    );
  }

  async function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportFeedback(null);
    try {
      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length < 2) {
        setImportFeedback('El archivo CSV debe contener encabezados y al menos una fila.');
        return;
      }

      const separator = lines[0].includes(';') ? ';' : ',';
      const headers = lines[0].split(separator).map((h) => h.trim().toLowerCase());
      const parsedRecords: Array<Partial<PayrollRecord>> = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(separator).map((c) => c.trim().replace(/^"|"$/g, ''));
        const getVal = (keys: string[]) => {
          const idx = headers.findIndex((h) => keys.some((k) => h.includes(k)));
          return idx >= 0 ? cols[idx] : '';
        };

        const nombre = getVal(['nombre', 'servidor', 'empleado']);
        const cedula = getVal(['cedula', 'cédula', 'documento']);
        if (!nombre || !cedula) continue;

        const base = Number(getVal(['salario_base', 'sueldo', 'base'])) || 45000;
        const comp = Number(getVal(['compensacion', 'incentivo', 'gastos'])) || 0;
        const he = Number(getVal(['horas_extra', 'extra'])) || 0;
        const calc = calculateDominicanPayroll({
          salarioBase: base,
          compensaciones: comp,
          horasExtras: he,
        });

        const tssRepStr = getVal(['tss_reportado', 'tss']);
        const isrRepStr = getVal(['isr_reportado', 'isr']);

        parsedRecords.push({
          institutionId: getVal(['institucion_id', 'siglas']) || 'IMPORT',
          institutionName: getVal(['institucion', 'entidad']) || 'Entidad Importada CSV',
          period: getVal(['periodo']) || '2026-11',
          cedula,
          nombreCompleto: nombre,
          cargo: getVal(['cargo', 'puesto']) || 'Servidor Público',
          departamento: getVal(['departamento']) || 'General',
          roleTier: (getVal(['nivel', 'tier']) as RoleTier) || 'TECNICO_PROFESIONAL',
          objetoGasto: getVal(['objeto']) === '2.1.1.2.02' ? '2.1.1.2.02' : '2.1.1.1.01',
          banco: getVal(['banco']) || 'Banreservas',
          cuentaBancaria: getVal(['cuenta']) || '9600000000',
          salarioBase: base,
          compensaciones: comp,
          horasExtras: he,
          salarioAnterior: Number(getVal(['salario_anterior'])) || base,
          tssReportadoEmpleado: tssRepStr !== '' ? Number(tssRepStr) : calc.tssTotalEmpleado,
          isrReportado: isrRepStr !== '' ? Number(isrRepStr) : calc.isrCalculado,
          netoPagadoReportado: calc.netoLegalCalculado,
        });
      }

      if (parsedRecords.length === 0) {
        setImportFeedback('No se encontraron columnas válidas (requiere nombre y cedula).');
        return;
      }

      await onImportRecords(parsedRecords);
      setImportFeedback(`Se importaron y auditaron ${parsedRecords.length} registro(s) correctamente.`);
    } catch {
      setImportFeedback('Error procesando el archivo CSV.');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setImporting(true);
    try {
      const base = Number(newRecord.salarioBase) || 0;
      const comp = Number(newRecord.compensaciones) || 0;
      const he = Number(newRecord.horasExtras) || 0;
      const calc = calculateDominicanPayroll({
        salarioBase: base,
        compensaciones: comp,
        horasExtras: he,
      });

      const tssRep =
        newRecord.tssReportadoEmpleado !== ''
          ? Number(newRecord.tssReportadoEmpleado)
          : calc.tssTotalEmpleado;
      const isrRep = newRecord.isrReportado !== '' ? Number(newRecord.isrReportado) : calc.isrCalculado;

      await onImportRecords([
        {
          institutionId: newRecord.institutionId,
          institutionName: newRecord.institutionName,
          period: '2026-11',
          cedula: newRecord.cedula,
          nombreCompleto: newRecord.nombreCompleto,
          cargo: newRecord.cargo,
          departamento: newRecord.departamento,
          roleTier: newRecord.roleTier,
          objetoGasto: newRecord.objetoGasto,
          banco: 'Banreservas',
          cuentaBancaria: '9600001122',
          salarioBase: base,
          compensaciones: comp,
          horasExtras: he,
          salarioAnterior: Number(newRecord.salarioAnterior) || base,
          tssReportadoEmpleado: tssRep,
          isrReportado: isrRep,
          netoPagadoReportado: calc.salarioBruto - tssRep - isrRep,
        },
      ]);
      setShowAddModal(false);
      setNewRecord((prev) => ({ ...prev, cedula: '', nombreCompleto: '', cargo: '' }));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Auditoría Analítica de Nómina por Servidor
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Recálculo automático TSS/DGII · Detección de doble percepción · Enmascaramiento Ley
            172-13
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={togglePiiVisibility}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
          >
            {piiUnmasked ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {piiUnmasked ? 'Ocultar PII (Ley 172-13)' : 'Ver Cédulas Completas'}
          </button>

          <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-md whitespace-nowrap shrink-0 cursor-pointer">
            <FileUp className="w-3.5 h-3.5" />
            {importing ? 'Importando...' : 'Importar CSV'}
            <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} className="hidden" />
          </label>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-blue-900 hover:bg-blue-800 text-white rounded-md whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar Registro
          </button>

          <button
            type="button"
            onClick={onResetDataset}
            title="Restablecer lote institucional base"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-100 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restablecer
          </button>
        </div>
      </div>

      {importFeedback && (
        <div className="px-4 py-2.5 text-xs bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-200 rounded-md flex items-center justify-between">
          <span>{importFeedback}</span>
          <button type="button" onClick={() => setImportFeedback(null)} className="cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Barra de búsqueda y filtro */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, cargo, entidad o ID..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-900"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md">
          {(
            [
              ['ALL', 'Todos'],
              ['HALLAZGO_CRITICO', 'Críticos'],
              ['OBSERVACION', 'Observaciones'],
              ['CONFORME', 'Conformes'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setRiskFilter(val)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                riskFilter === val
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla de alta densidad */}
      <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                <th className="py-2.5 px-3 text-left font-medium">Entidad / ID</th>
                <th className="py-2.5 px-3 text-left font-medium">Cédula</th>
                <th className="py-2.5 px-3 text-left font-medium">Servidor Público y Cargo</th>
                <th className="py-2.5 px-3 text-right font-medium">Bruto (RD$)</th>
                <th className="py-2.5 px-3 text-right font-medium">TSS Legal</th>
                <th className="py-2.5 px-3 text-right font-medium">ISR DGII</th>
                <th className="py-2.5 px-3 text-right font-medium">Neto Legal</th>
                <th className="py-2.5 px-3 text-left font-medium">Dictamen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500 dark:text-slate-400">
                    No hay registros de nómina que coincidan con el filtro aplicado.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const { record, calculation, riesgoNivel, findings } = row;
                  const isFocused = activeInspected?.record.id === record.id;
                  return (
                    <tr
                      key={record.id}
                      onClick={() => setInspectedRow(row)}
                      className={`h-10 cursor-pointer transition-colors ${
                        isFocused
                          ? 'bg-blue-50/70 dark:bg-blue-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                          {record.institutionId}
                        </span>
                        <span className="text-slate-400 mx-1">·</span>
                        <span className="font-mono text-slate-500 dark:text-slate-400">{record.id}</span>
                      </td>
                      <td className="py-2 px-3 font-mono whitespace-nowrap text-slate-700 dark:text-slate-300">
                        {piiUnmasked ? record.cedula : maskCedula(record.cedula)}
                      </td>
                      <td className="py-2 px-3 max-w-[260px]">
                        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {record.nombreCompleto}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {record.cargo}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {formatRd(calculation.salarioBruto)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {formatRd(calculation.tssTotalEmpleado)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {formatRd(calculation.isrCalculado)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {formatRd(calculation.netoLegalCalculado)}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        {riesgoNivel === 'CONFORME' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Conforme
                          </span>
                        ) : riesgoNivel === 'HALLAZGO_CRITICO' ? (
                          <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400 font-semibold">
                            <ShieldAlert className="w-3.5 h-3.5" /> Crítico ({findings.length})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" /> Observación ({findings.length})
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspector detallado del registro seleccionado */}
      {activeInspected && (
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-6 space-y-5">
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Expediente Individual · {activeInspected.record.institutionName} · Objeto{' '}
                <span className="font-mono">{activeInspected.record.objetoGasto}</span>
              </p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                {activeInspected.record.nombreCompleto}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                {activeInspected.record.cargo} · Cédula:{' '}
                <span className="font-mono">
                  {piiUnmasked
                    ? activeInspected.record.cedula
                    : maskCedula(activeInspected.record.cedula)}
                </span>{' '}
                · Cuenta:{' '}
                <span className="font-mono">
                  {activeInspected.record.banco}{' '}
                  {piiUnmasked
                    ? activeInspected.record.cuentaBancaria
                    : maskAccount(activeInspected.record.cuentaBancaria)}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setInspectedRow(null);
                onClearFocus();
              }}
              className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-md cursor-pointer"
              aria-label="Cerrar inspector"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
            <div className="space-y-2">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                Ingresos y Comparativa Mensual
              </p>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Salario Base:</span>
                <span className="font-mono tabular-nums">
                  {formatRd(activeInspected.record.salarioBase)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Compensaciones:</span>
                <span className="font-mono tabular-nums">
                  {formatRd(activeInspected.record.compensaciones)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Horas Extras:</span>
                <span className="font-mono tabular-nums">
                  {formatRd(activeInspected.record.horasExtras)}
                </span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-slate-200 dark:border-slate-800 font-semibold">
                <span>Salario Bruto:</span>
                <span className="font-mono tabular-nums">
                  {formatRd(activeInspected.calculation.salarioBruto)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Período Anterior:</span>
                <span className="font-mono tabular-nums">
                  {formatRd(activeInspected.record.salarioAnterior)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                Recálculo Legal vs. Reportado
              </p>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">TSS Legal (SFS+AFP):</span>
                <span className="font-mono tabular-nums">
                  {formatRd(activeInspected.calculation.tssTotalEmpleado)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">TSS Reportado:</span>
                <span className="font-mono tabular-nums">
                  {formatRd(activeInspected.record.tssReportadoEmpleado)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">ISR DGII Legal:</span>
                <span className="font-mono tabular-nums">
                  {formatRd(activeInspected.calculation.isrCalculado)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">ISR Reportado:</span>
                <span className="font-mono tabular-nums">
                  {formatRd(activeInspected.record.isrReportado)}
                </span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-slate-200 dark:border-slate-800 font-semibold">
                <span>Diferencia Neta:</span>
                <span
                  className={`font-mono tabular-nums ${
                    Math.abs(activeInspected.calculation.diferenciaNeto) > 5
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {formatRd(activeInspected.calculation.diferenciaNeto)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                Hallazgos Normativos ({activeInspected.findings.length})
              </p>
              {activeInspected.findings.length === 0 ? (
                <p className="text-emerald-700 dark:text-emerald-400">
                  Registro 100% conforme con Ley 87-01, Ley 11-92, Ley 105-13 y JCE.
                </p>
              ) : (
                <ul className="space-y-2">
                  {activeInspected.findings.map((f) => (
                    <li
                      key={f.id}
                      className="p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded"
                    >
                      <p className="font-semibold text-red-700 dark:text-red-400">
                        {f.severity} · {f.codigoNorma}
                      </p>
                      <p className="text-slate-700 dark:text-slate-300 mt-0.5">{f.titulo}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Agregar Registro */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Incorporar Servidor Público a Auditoría
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Siglas Entidad
                  </label>
                  <input
                    required
                    value={newRecord.institutionId}
                    onChange={(e) => setNewRecord({ ...newRecord, institutionId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nombre Entidad
                  </label>
                  <input
                    required
                    value={newRecord.institutionName}
                    onChange={(e) => setNewRecord({ ...newRecord, institutionName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Cédula (JCE)
                  </label>
                  <input
                    required
                    placeholder="001-1234567-3"
                    value={newRecord.cedula}
                    onChange={(e) => setNewRecord({ ...newRecord, cedula: e.target.value })}
                    className="w-full px-3 py-2 font-mono border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nombre Completo
                  </label>
                  <input
                    required
                    value={newRecord.nombreCompleto}
                    onChange={(e) => setNewRecord({ ...newRecord, nombreCompleto: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Cargo
                  </label>
                  <input
                    required
                    value={newRecord.cargo}
                    onChange={(e) => setNewRecord({ ...newRecord, cargo: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nivel Jerárquico (Ley 105-13)
                  </label>
                  <select
                    value={newRecord.roleTier}
                    onChange={(e) => setNewRecord({ ...newRecord, roleTier: e.target.value as RoleTier })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-950"
                  >
                    {Object.entries(ROLE_TIER_CAPS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Salario Base
                  </label>
                  <input
                    type="number"
                    required
                    value={newRecord.salarioBase}
                    onChange={(e) => setNewRecord({ ...newRecord, salarioBase: e.target.value })}
                    className="w-full px-3 py-2 font-mono border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Compensaciones
                  </label>
                  <input
                    type="number"
                    value={newRecord.compensaciones}
                    onChange={(e) => setNewRecord({ ...newRecord, compensaciones: e.target.value })}
                    className="w-full px-3 py-2 font-mono border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Salario Anterior
                  </label>
                  <input
                    type="number"
                    value={newRecord.salarioAnterior}
                    onChange={(e) => setNewRecord({ ...newRecord, salarioAnterior: e.target.value })}
                    className="w-full px-3 py-2 font-mono border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    TSS Reportado (opcional)
                  </label>
                  <input
                    type="number"
                    placeholder="Auto legal"
                    value={newRecord.tssReportadoEmpleado}
                    onChange={(e) =>
                      setNewRecord({ ...newRecord, tssReportadoEmpleado: e.target.value })
                    }
                    className="w-full px-3 py-2 font-mono border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    ISR Reportado (opcional)
                  </label>
                  <input
                    type="number"
                    placeholder="Auto DGII"
                    value={newRecord.isrReportado}
                    onChange={(e) => setNewRecord({ ...newRecord, isrReportado: e.target.value })}
                    className="w-full px-3 py-2 font-mono border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-md cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={importing}
                  className="px-4 py-2 text-xs font-semibold bg-blue-900 hover:bg-blue-800 text-white rounded-md cursor-pointer"
                >
                  {importing ? 'Auditando...' : 'Incorporar y Auditar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
