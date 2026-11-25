import React, { useMemo, useState } from 'react';
import { Calculator, CheckCircle2, XCircle } from 'lucide-react';
import {
  ROLE_TIER_CAPS,
  RoleTier,
  calculateDominicanPayroll,
  formatRd,
  validateDominicanCedula,
} from '../shared/dominicanPayroll.ts';

export const LegalCalculator: React.FC = () => {
  const [cedula, setCedula] = useState('001-1234567-3');
  const [salarioBase, setSalarioBase] = useState('85000');
  const [compensaciones, setCompensaciones] = useState('10000');
  const [horasExtras, setHorasExtras] = useState('0');
  const [otrosDescuentos, setOtrosDescuentos] = useState('0');
  const [roleTier, setRoleTier] = useState<RoleTier>('TECNICO_PROFESIONAL');
  const [tssReportado, setTssReportado] = useState('');
  const [isrReportado, setIsrReportado] = useState('');

  const cedulaValid = useMemo(() => validateDominicanCedula(cedula), [cedula]);

  const result = useMemo(() => {
    const base = Number(salarioBase) || 0;
    const comp = Number(compensaciones) || 0;
    const he = Number(horasExtras) || 0;
    const otros = Number(otrosDescuentos) || 0;
    return calculateDominicanPayroll({
      salarioBase: base,
      compensaciones: comp,
      horasExtras: he,
      otrosDescuentosReportados: otros,
      tssReportadoEmpleado: tssReportado !== '' ? Number(tssReportado) : undefined,
      isrReportado: isrReportado !== '' ? Number(isrReportado) : undefined,
    });
  }, [salarioBase, compensaciones, horasExtras, otrosDescuentos, tssReportado, isrReportado]);

  const tierInfo = ROLE_TIER_CAPS[roleTier];
  const exceedsCap = result.salarioBruto > tierInfo.capRd;
  const compRatio =
    (Number(salarioBase) || 0) > 0
      ? ((Number(compensaciones) || 0) / (Number(salarioBase) || 1)) * 100
      : 0;

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Módulo de Cálculo Automático Normativo (República Dominicana)
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Motor de verificación aritmética para TSS (Ley 87-01), Retención ISR DGII (Ley 11-92 Art.
          296), Topes Salariales (Ley 105-13) y Validación JCE.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Formulario de parámetros */}
        <div className="lg:col-span-5 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <Calculator className="w-4 h-4 text-blue-900 dark:text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Parámetros del Servidor Público
            </h3>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Cédula de Identidad (JCE)
              </label>
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium ${
                  cedulaValid
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-red-700 dark:text-red-400'
                }`}
              >
                {cedulaValid ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Dígito Módulo 10 válido
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5" /> Cédula inválida
                  </>
                )}
              </span>
            </div>
            <input
              type="text"
              value={cedula}
              onChange={(e) => setCedula(e.target.value)}
              placeholder="001-0000000-0"
              className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nivel Jerárquico (Ley 105-13)
            </label>
            <select
              value={roleTier}
              onChange={(e) => setRoleTier(e.target.value as RoleTier)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
            >
              {Object.entries(ROLE_TIER_CAPS).map(([key, val]) => (
                <option key={key} value={key}>
                  {val.label} (Tope {formatRd(val.capRd)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Salario Base (RD$)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={salarioBase}
                onChange={(e) => setSalarioBase(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Compensaciones (RD$)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={compensaciones}
                onChange={(e) => setCompensaciones(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Horas Extras (RD$)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={horasExtras}
                onChange={(e) => setHorasExtras(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Otros Descuentos (RD$)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={otrosDescuentos}
                onChange={(e) => setOtrosDescuentos(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
              Comparación contra valores reportados por la entidad (opcional)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  TSS Reportado (RD$)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={tssReportado}
                  onChange={(e) => setTssReportado(e.target.value)}
                  placeholder={result.tssTotalEmpleado.toFixed(2)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  ISR Reportado (RD$)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={isrReportado}
                  onChange={(e) => setIsrReportado(e.target.value)}
                  placeholder={result.isrCalculado.toFixed(2)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Desglose Legal Auditado */}
        <div className="lg:col-span-7 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Desglose Legal Determinado (CCRD)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {result.tramoIsrLabel}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 dark:text-slate-400">Salario Neto Legal</p>
              <p className="text-xl font-bold font-mono tabular-nums text-blue-900 dark:text-blue-400">
                {formatRd(result.netoLegalCalculado)}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2 text-left font-medium">Concepto Legal</th>
                  <th className="py-2 text-left font-medium">Base / Tasa Normativa</th>
                  <th className="py-2 text-right font-medium">Monto (RD$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                <tr>
                  <td className="py-2.5 font-medium text-slate-900 dark:text-slate-100">Total Ingresos Brutos</td>
                  <td className="py-2.5 text-slate-500 dark:text-slate-400">Base + Compensaciones + H. Extras</td>
                  <td className="py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                    {formatRd(result.salarioBruto)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 text-slate-800 dark:text-slate-200">Retención SFS (Empleado)</td>
                  <td className="py-2.5 text-slate-500 dark:text-slate-400">Ley 87-01 · 3.04% (Tope 10 SMN)</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    - {formatRd(result.sfsEmpleado)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 text-slate-800 dark:text-slate-200">Retención AFP (Empleado)</td>
                  <td className="py-2.5 text-slate-500 dark:text-slate-400">Ley 87-01 · 2.87% (Tope 20 SMN)</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    - {formatRd(result.afpEmpleado)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 text-slate-800 dark:text-slate-200">Base Imponible ISR (DGII)</td>
                  <td className="py-2.5 text-slate-500 dark:text-slate-400">Bruto menos TSS Empleado</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    {formatRd(result.baseImponibleIsr)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 text-slate-800 dark:text-slate-200">Retención ISR (DGII)</td>
                  <td className="py-2.5 text-slate-500 dark:text-slate-400">Ley 11-92 Art. 296</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-red-700 dark:text-red-400 font-medium">
                    - {formatRd(result.isrCalculado)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 text-slate-800 dark:text-slate-200">Aporte Patronal TSS (SFS + AFP + SRL)</td>
                  <td className="py-2.5 text-slate-500 dark:text-slate-400">7.09% + 7.10% + 1.15%</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    {formatRd(result.tssTotalEmpleador)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 text-slate-800 dark:text-slate-200">Provisión Regalía Pascual (1/12)</td>
                  <td className="py-2.5 text-slate-500 dark:text-slate-400">Ley 16-92 / Sueldo 13 exento</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    {formatRd(result.regaliaPascualMensual)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Verificaciones normativas instantáneas */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <p className="text-slate-500 dark:text-slate-400">Tope Ley 105-13</p>
              <p
                className={`font-semibold mt-0.5 ${
                  exceedsCap
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {exceedsCap
                  ? `Excedido por ${formatRd(result.salarioBruto - tierInfo.capRd)}`
                  : 'Dentro del límite legal'}
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Proporción Compensaciones</p>
              <p
                className={`font-semibold font-mono tabular-nums mt-0.5 ${
                  compRatio > 30
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {compRatio.toFixed(1)}% ({compRatio > 30 ? 'Supera 30%' : 'Conforme'})
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Desviación Reportada (TSS / ISR)</p>
              <p
                className={`font-semibold font-mono tabular-nums mt-0.5 ${
                  Math.abs(result.diferenciaTss) > 5 || Math.abs(result.diferenciaIsr) > 5
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {formatRd(result.diferenciaTss)} / {formatRd(result.diferenciaIsr)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
