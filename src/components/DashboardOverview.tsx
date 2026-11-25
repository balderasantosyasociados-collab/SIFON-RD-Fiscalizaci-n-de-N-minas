import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';
import {
  AlertStatus,
  AuditedPayrollRow,
  AuditFinding,
  DigepresComparisonRow,
  FindingSeverity,
  formatRd,
} from '../shared/dominicanPayroll.ts';

interface DashboardOverviewProps {
  auditedRows: AuditedPayrollRow[];
  findings: AuditFinding[];
  digepresComparisons: DigepresComparisonRow[];
  selectedInstitution: string;
  onSelectInstitution: (inst: string) => void;
  onUpdateAlertStatus: (alertId: string, status: AlertStatus, note: string) => Promise<void>;
  onNavigateToAudit: (recordId?: string) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  auditedRows,
  findings,
  digepresComparisons,
  selectedInstitution,
  onSelectInstitution,
  onUpdateAlertStatus,
  onNavigateToAudit,
}) => {
  const [severityFilter, setSeverityFilter] = useState<'ALL' | FindingSeverity>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AlertStatus>('ALL');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const institutions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of auditedRows) {
      map.set(r.record.institutionId, r.record.institutionName);
    }
    return Array.from(map.entries());
  }, [auditedRows]);

  const filteredRows = useMemo(
    () =>
      selectedInstitution === 'ALL'
        ? auditedRows
        : auditedRows.filter((r) => r.record.institutionId === selectedInstitution),
    [auditedRows, selectedInstitution]
  );

  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      if (selectedInstitution !== 'ALL' && f.institutionId !== selectedInstitution) return false;
      if (severityFilter !== 'ALL' && f.severity !== severityFilter) return false;
      if (statusFilter !== 'ALL' && f.status !== statusFilter) return false;
      return true;
    });
  }, [findings, selectedInstitution, severityFilter, statusFilter]);

  const filteredComparisons = useMemo(
    () =>
      selectedInstitution === 'ALL'
        ? digepresComparisons
        : digepresComparisons.filter((c) => c.institutionId === selectedInstitution),
    [digepresComparisons, selectedInstitution]
  );

  const totalBruto = filteredRows.reduce((s, r) => s + r.calculation.salarioBruto, 0);
  const totalPatronal = filteredRows.reduce((s, r) => s + r.calculation.tssTotalEmpleador, 0);
  const activeAlerts = filteredFindings.filter((f) => f.status !== 'RESUELTA');
  const criticalCount = activeAlerts.filter((f) => f.severity === 'CRITICO').length;
  const totalImpacto = activeAlerts.reduce((s, f) => s + f.impactoFinancieroRd, 0);

  // Agrupación por institución para gráfico comparativo SVG
  const chartData = useMemo(() => {
    const byInst = new Map<string, { name: string; aprobado: number; devengado: number }>();
    for (const c of filteredComparisons) {
      const curr = byInst.get(c.institutionId) ?? {
        name: c.institutionId,
        aprobado: 0,
        devengado: 0,
      };
      curr.aprobado += c.presupuestoAprobado;
      curr.devengado += c.devengadoReportado;
      byInst.set(c.institutionId, curr);
    }
    return Array.from(byInst.values());
  }, [filteredComparisons]);

  const maxChartVal = Math.max(1, ...chartData.flatMap((d) => [d.aprobado, d.devengado]));

  async function submitAlertAction(alertId: string, newStatus: AlertStatus) {
    setSavingId(alertId);
    try {
      await onUpdateAlertStatus(alertId, newStatus, noteInput);
      setResolvingId(null);
      setNoteInput('');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Filtro de Entidad */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Control Presupuestario y Alertas en Tiempo Real
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Período fiscal 2026-11 · Evaluación automatizada bajo Ley 10-04, Ley 41-08, Ley 105-13,
            Ley 87-01, Ley 11-92 y Ley 423-06
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="inst-select" className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Entidad:
          </label>
          <select
            id="inst-select"
            value={selectedInstitution}
            onChange={(e) => onSelectInstitution(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-900"
          >
            <option value="ALL">Todas las entidades ({institutions.length})</option>
            {institutions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Franja KPI de 4 columnas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Nómina Bruta Auditada
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-2">
            {formatRd(totalBruto)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 font-mono tabular-nums">
            + {formatRd(totalPatronal)} TSS patronal
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Servidores Verificados
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-2">
            {filteredRows.length}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
            {selectedInstitution === 'ALL' ? `${institutions.length} entidades estatales` : selectedInstitution}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Alertas Activas
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-red-700 dark:text-red-400 mt-2">
            {activeAlerts.length}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 font-mono tabular-nums">
            {criticalCount} críticas · {activeAlerts.length - criticalCount} altas/medias
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Impacto Financiero Observado
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400 mt-2">
            {formatRd(totalImpacto)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
            Sobregiros, dobles nóminas y desvíos
          </p>
        </div>
      </div>

      {/* Gráfico SVG Presupuesto DIGEPRES vs Ejecución Devengada */}
      <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Ejecución Presupuestaria Mensual vs. Techo Aprobado DIGEPRES
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Comparativa consolidada por institución (Objetos 2.1.1 y 2.1.5)
            </p>
          </div>
          <div className="flex items-center gap-5 text-xs text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 inline-block bg-slate-300 dark:bg-slate-600 rounded-xs" />
              Aprobado DIGEPRES
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 inline-block bg-blue-900 dark:bg-blue-500 rounded-xs" />
              Devengado en Nómina
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {chartData.map((d) => {
            const pctAprobado = (d.aprobado / maxChartVal) * 100;
            const pctDevengado = (d.devengado / maxChartVal) * 100;
            const ratio = d.aprobado > 0 ? (d.devengado / d.aprobado) * 100 : 0;
            const overrun = ratio > 100;
            return (
              <div key={d.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{d.name}</span>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    Devengado {formatRd(d.devengado)} / Aprobado {formatRd(d.aprobado)} (
                    <span
                      className={
                        overrun
                          ? 'text-red-700 dark:text-red-400 font-semibold'
                          : 'text-slate-800 dark:text-slate-200 font-semibold'
                      }
                    >
                      {ratio.toFixed(1)}%
                    </span>
                    )
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-xs overflow-hidden">
                    <div
                      className="h-full bg-slate-300 dark:bg-slate-600 transition-all duration-200"
                      style={{ width: `${Math.min(100, pctAprobado)}%` }}
                    />
                  </div>
                  <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-xs overflow-hidden">
                    <div
                      className={`h-full transition-all duration-200 ${
                        overrun ? 'bg-red-600 dark:bg-red-500' : 'bg-blue-900 dark:bg-blue-500'
                      }`}
                      style={{ width: `${Math.min(100, pctDevengado)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bandeja de Alertas en Tiempo Real */}
      <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Alertas de Inconsistencias Presupuestarias y Normativas
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Monitoreo continuo conforme a NOBACI Componente 5 y Ley 10-04
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md">
              {(['ALL', 'CRITICO', 'ALTO', 'MEDIO'] as const).map((sev) => (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setSeverityFilter(sev)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    severityFilter === sev
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {sev === 'ALL' ? 'Todas' : sev === 'CRITICO' ? 'Críticas' : sev === 'ALTO' ? 'Altas' : 'Medias'}
                </button>
              ))}
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | AlertStatus)}
              className="px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-800 dark:text-slate-200"
            >
              <option value="ALL">Todos los estados</option>
              <option value="PENDIENTE">Pendientes</option>
              <option value="EN_REVISION">En revisión</option>
              <option value="RESUELTA">Resueltas</option>
            </select>
          </div>
        </div>

        {filteredFindings.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              No hay alertas para los filtros seleccionados
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Todos los controles evaluados en este subconjunto cumplen con la normativa vigente.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredFindings.map((finding) => {
              const isCritical = finding.severity === 'CRITICO';
              const isHigh = finding.severity === 'ALTO';
              const isResolved = finding.status === 'RESUELTA';

              return (
                <div key={finding.id} className="p-5 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="space-y-1.5 max-w-3xl">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            isResolved
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : isCritical
                              ? 'text-red-700 dark:text-red-400'
                              : isHigh
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {isResolved ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : isCritical ? (
                            <ShieldAlert className="w-3.5 h-3.5" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          )}
                          {finding.severity}
                        </span>
                        <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                        <span className="font-mono text-slate-600 dark:text-slate-400">{finding.codigoNorma}</span>
                        <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                        <span className="text-slate-600 dark:text-slate-400">{finding.institutionName}</span>
                        <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          Estado: {finding.status.replace('_', ' ')}
                        </span>
                      </div>

                      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {finding.titulo}
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {finding.descripcion}
                      </p>

                      {finding.resolutionNote && (
                        <p className="text-xs text-emerald-700 dark:text-emerald-400 pt-1">
                          Nota de auditor ({finding.resolvedBy}): {finding.resolutionNote}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end gap-2 shrink-0">
                      <div className="text-left lg:text-right">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Impacto observado</p>
                        <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                          {formatRd(finding.impactoFinancieroRd)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {finding.recordId && (
                          <button
                            type="button"
                            onClick={() => onNavigateToAudit(finding.recordId)}
                            className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Inspeccionar registro
                          </button>
                        )}
                        {finding.status !== 'EN_REVISION' && finding.status !== 'RESUELTA' && (
                          <button
                            type="button"
                            onClick={() => submitAlertAction(finding.id, 'EN_REVISION')}
                            disabled={savingId === finding.id}
                            className="px-3 py-1.5 text-xs font-medium text-blue-900 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Clock className="w-3.5 h-3.5 inline mr-1" />
                            En revisión
                          </button>
                        )}
                        {finding.status !== 'RESUELTA' && (
                          <button
                            type="button"
                            onClick={() => {
                              setResolvingId(resolvingId === finding.id ? null : finding.id);
                              setNoteInput('');
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-900 hover:bg-blue-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Resolver hallazgo
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {resolvingId === finding.id && (
                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder="Justificación o referencia de oficio CCRD / corrección..."
                        className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => submitAlertAction(finding.id, 'RESUELTA')}
                        disabled={savingId === finding.id}
                        className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {savingId === finding.id ? 'Guardando...' : 'Confirmar resolución'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setResolvingId(null)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
