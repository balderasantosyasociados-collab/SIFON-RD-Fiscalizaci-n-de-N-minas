import React, { useMemo } from 'react';
import { Download } from 'lucide-react';
import {
  AuditedPayrollRow,
  DigepresComparisonRow,
  formatRd,
} from '../shared/dominicanPayroll.ts';
import {
  buildAuditedPayrollCsv,
  buildDigepresCsv,
  triggerFileDownload,
} from '../lib/forensicExport.ts';

interface ComparativeMatricesProps {
  auditedRows: AuditedPayrollRow[];
  digepresComparisons: DigepresComparisonRow[];
  selectedInstitution: string;
}

export const ComparativeMatrices: React.FC<ComparativeMatricesProps> = ({
  auditedRows,
  digepresComparisons,
  selectedInstitution,
}) => {
  const filteredComparisons = useMemo(
    () =>
      selectedInstitution === 'ALL'
        ? digepresComparisons
        : digepresComparisons.filter((c) => c.institutionId === selectedInstitution),
    [digepresComparisons, selectedInstitution]
  );

  const filteredRows = useMemo(
    () =>
      selectedInstitution === 'ALL'
        ? auditedRows
        : auditedRows.filter((r) => r.record.institutionId === selectedInstitution),
    [auditedRows, selectedInstitution]
  );

  const totals = useMemo(() => {
    return filteredComparisons.reduce(
      (acc, c) => ({
        aprobado: acc.aprobado + c.presupuestoAprobado,
        devengado: acc.devengado + c.devengadoReportado,
        legal: acc.legal + c.recalculoLegalCcrd,
        variacion: acc.variacion + c.variacionPresupuestaria,
      }),
      { aprobado: 0, devengado: 0, legal: 0, variacion: 0 }
    );
  }, [filteredComparisons]);

  function exportDigepres() {
    const csv = buildDigepresCsv(filteredComparisons);
    triggerFileDownload(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      `CCRD_Cuadro_Comparativo_DIGEPRES_${selectedInstitution}.csv`
    );
  }

  function exportInterperiod() {
    const csv = buildAuditedPayrollCsv(filteredRows, false);
    triggerFileDownload(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      `CCRD_Comparativo_Retenciones_Periodo_${selectedInstitution}.csv`
    );
  }

  return (
    <div className="space-y-8">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Cuadros Comparativos para Fiscalización Gubernamental
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Contrastación directa entre Presupuesto Aprobado (DIGEPRES), Nómina Devengada, Recálculo
          Legal CCRD y Variación Intermensual.
        </p>
      </div>

      {/* Cuadro 1: DIGEPRES vs Devengado vs Recálculo Legal */}
      <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              01. Cuadro Comparativo por Objeto del Gasto (DIGEPRES · Ley 423-06)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Variación presupuestaria mensual y determinación de sobregiros no autorizados
            </p>
          </div>
          <button
            type="button"
            onClick={exportDigepres}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV DIGEPRES
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                <th className="py-2.5 px-3 text-left font-medium">Entidad</th>
                <th className="py-2.5 px-3 text-left font-medium">Objeto</th>
                <th className="py-2.5 px-3 text-left font-medium">Denominación de Partida</th>
                <th className="py-2.5 px-3 text-right font-medium">Aprobado DIGEPRES</th>
                <th className="py-2.5 px-3 text-right font-medium">Devengado</th>
                <th className="py-2.5 px-3 text-right font-medium">Recálculo Legal</th>
                <th className="py-2.5 px-3 text-right font-medium">Saldo / Variación</th>
                <th className="py-2.5 px-3 text-right font-medium">Ejecución</th>
                <th className="py-2.5 px-3 text-left font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredComparisons.map((c) => {
                const isOver = c.estadoPresupuestario === 'SOBREGIRO';
                const isWarn = c.estadoPresupuestario === 'ALERTA_TEMPRANA';
                return (
                  <tr key={`${c.institutionId}-${c.objetoGasto}`} className="h-10 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {c.institutionId}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {c.objetoGasto}
                    </td>
                    <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{c.denominacion}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {formatRd(c.presupuestoAprobado)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {formatRd(c.devengadoReportado)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {formatRd(c.recalculoLegalCcrd)}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-mono tabular-nums font-medium whitespace-nowrap ${
                        c.variacionPresupuestaria < 0
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {formatRd(c.variacionPresupuestaria)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {c.porcentajeEjecucion.toFixed(1)}%
                    </td>
                    <td
                      className={`py-2 px-3 font-semibold whitespace-nowrap ${
                        isOver
                          ? 'text-red-700 dark:text-red-400'
                          : isWarn
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {isOver ? 'Sobregiro' : isWarn ? 'Alerta ≥90%' : 'En límite'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 dark:bg-slate-950 border-t border-slate-300 dark:border-slate-700 font-semibold">
                <td colSpan={3} className="py-2.5 px-3 text-slate-900 dark:text-slate-100">
                  Totales Consolidados del Cuadro Comparativo
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                  {formatRd(totals.aprobado)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                  {formatRd(totals.devengado)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                  {formatRd(totals.legal)}
                </td>
                <td
                  className={`py-2.5 px-3 text-right font-mono tabular-nums ${
                    totals.variacion < 0
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {formatRd(totals.variacion)}
                </td>
                <td colSpan={2} className="py-2.5 px-3 text-right font-mono tabular-nums">
                  {totals.aprobado > 0 ? ((totals.devengado / totals.aprobado) * 100).toFixed(1) : '0.0'}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Cuadro 2: Comparativo Intermensual y Desviación de Retenciones */}
      <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              02. Cuadro Comparativo Intermensual y Desviación de Retenciones (TSS / DGII)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Variación salarial respecto al período previo y diferencias entre retención reportada y
              legal
            </p>
          </div>
          <button
            type="button"
            onClick={exportInterperiod}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar Matriz CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                <th className="py-2.5 px-3 text-left font-medium">ID</th>
                <th className="py-2.5 px-3 text-left font-medium">Servidor Público</th>
                <th className="py-2.5 px-3 text-right font-medium">Bruto Anterior</th>
                <th className="py-2.5 px-3 text-right font-medium">Bruto Actual</th>
                <th className="py-2.5 px-3 text-right font-medium">Variación %</th>
                <th className="py-2.5 px-3 text-right font-medium">Dif. TSS (RD$)</th>
                <th className="py-2.5 px-3 text-right font-medium">Dif. ISR DGII (RD$)</th>
                <th className="py-2.5 px-3 text-left font-medium">Resolución MAP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredRows.map(({ record, calculation }) => {
                const varPct =
                  record.salarioAnterior > 0
                    ? ((calculation.salarioBruto - record.salarioAnterior) / record.salarioAnterior) * 100
                    : 0;
                const highVar = varPct > 15 && !record.resolucionMap;
                const taxMismatch =
                  Math.abs(calculation.diferenciaTss) > 5 || Math.abs(calculation.diferenciaIsr) > 5;

                return (
                  <tr key={record.id} className="h-10 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {record.id}
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">
                      {record.nombreCompleto}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {formatRd(record.salarioAnterior)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums font-medium whitespace-nowrap">
                      {formatRd(calculation.salarioBruto)}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap ${
                        highVar ? 'text-red-700 dark:text-red-400 font-semibold' : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {varPct >= 0 ? '+' : ''}
                      {varPct.toFixed(1)}%
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap ${
                        Math.abs(calculation.diferenciaTss) > 5
                          ? 'text-amber-700 dark:text-amber-400 font-semibold'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {formatRd(calculation.diferenciaTss)}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap ${
                        taxMismatch && Math.abs(calculation.diferenciaIsr) > 5
                          ? 'text-red-700 dark:text-red-400 font-semibold'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {formatRd(calculation.diferenciaIsr)}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {record.resolucionMap || (highVar ? 'Faltante' : 'N/A')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
