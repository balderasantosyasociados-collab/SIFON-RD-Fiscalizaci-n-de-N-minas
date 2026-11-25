export type RoleTier =
  | 'MINISTRO'
  | 'VICEMINISTRO_DIRECTOR'
  | 'ENCARGADO_DEPARTAMENTO'
  | 'TECNICO_PROFESIONAL'
  | 'APOYO_OPERATIVO'
  | 'CONTRATADO_ESPECIAL';

export type ObjetoGastoCode =
  | '2.1.1.1.01'
  | '2.1.1.2.02'
  | '2.1.1.5.01'
  | '2.1.5.1.01';

export type FindingSeverity = 'CRITICO' | 'ALTO' | 'MEDIO';

export type AlertStatus = 'PENDIENTE' | 'EN_REVISION' | 'RESUELTA';

export interface PayrollRecord {
  id: string;
  institutionId: string;
  institutionName: string;
  period: string; // e.g. '2026-11'
  cedula: string;
  nombreCompleto: string;
  cargo: string;
  departamento: string;
  roleTier: RoleTier;
  objetoGasto: '2.1.1.1.01' | '2.1.1.2.02';
  banco: string;
  cuentaBancaria: string;
  salarioBase: number;
  compensaciones: number; // gastos de representación, incentivos, dietas
  horasExtras: number;
  salarioAnterior: number;
  resolucionMap?: string;
  exentoDocencia?: boolean;
  // Valores reportados por la entidad auditada (para comparar vs recálculo CCRD)
  tssReportadoEmpleado: number;
  isrReportado: number;
  otrosDescuentosReportados: number;
  netoPagadoReportado: number;
}

export interface LegalCalculationResult {
  salarioBruto: number;
  salarioCotizableTss: number;
  sfsEmpleado: number;
  afpEmpleado: number;
  tssTotalEmpleado: number;
  sfsEmpleador: number;
  afpEmpleador: number;
  srlEmpleador: number;
  tssTotalEmpleador: number;
  baseImponibleIsr: number;
  isrCalculado: number;
  tramoIsrLabel: string;
  regaliaPascualMensual: number;
  netoLegalCalculado: number;
  diferenciaTss: number;
  diferenciaIsr: number;
  diferenciaNeto: number;
}

export interface AuditFinding {
  id: string;
  recordId?: string;
  institutionId: string;
  institutionName: string;
  period: string;
  codigoNorma: string;
  leyAplicable: string;
  categoria:
    | 'DOBLE_PERCEPCION'
    | 'CEDULA_INVALIDA'
    | 'TOPE_SALARIAL'
    | 'DESVIACION_ISR_TSS'
    | 'SOBREGIRO_DIGEPRES'
    | 'VARIACION_ATIPICA'
    | 'COMPENSACION_EXCESIVA';
  severity: FindingSeverity;
  titulo: string;
  descripcion: string;
  impactoFinancieroRd: number;
  status: AlertStatus;
  detectedAt: string;
  resolvedBy?: string;
  resolutionNote?: string;
}

export interface DigepresBudgetLine {
  institutionId: string;
  institutionName: string;
  period: string;
  objetoGasto: ObjetoGastoCode;
  denominacion: string;
  presupuestoAprobadoMensual: number;
}

export interface DigepresComparisonRow {
  institutionId: string;
  institutionName: string;
  objetoGasto: ObjetoGastoCode;
  denominacion: string;
  presupuestoAprobado: number;
  devengadoReportado: number;
  recalculoLegalCcrd: number;
  variacionPresupuestaria: number;
  porcentajeEjecucion: number;
  estadoPresupuestario: 'DENTRO_LIMITE' | 'ALERTA_TEMPRANA' | 'SOBREGIRO';
}

export interface AuditedPayrollRow {
  record: PayrollRecord;
  cedulaValida: boolean;
  calculation: LegalCalculationResult;
  findings: AuditFinding[];
  riesgoNivel: 'CONFORME' | 'OBSERVACION' | 'HALLAZGO_CRITICO';
}

export const SMN_TSS_REFERENCE = 19352.5; // Salario Mínimo Nacional Cotizable Sector Público/TSS (RD$)
export const TOPE_SFS = SMN_TSS_REFERENCE * 10; // 193,525.00
export const TOPE_AFP = SMN_TSS_REFERENCE * 20; // 387,050.00
export const TOPE_SRL = SMN_TSS_REFERENCE * 4; // 77,410.00

export const ROLE_TIER_CAPS: Record<RoleTier, { label: string; capRd: number }> = {
  MINISTRO: { label: 'Ministro / Titular de Órgano', capRd: 300000 },
  VICEMINISTRO_DIRECTOR: { label: 'Viceministro / Director General', capRd: 250000 },
  ENCARGADO_DEPARTAMENTO: { label: 'Encargado Departamental / Director Área', capRd: 160000 },
  TECNICO_PROFESIONAL: { label: 'Analista / Técnico Profesional', capRd: 115000 },
  APOYO_OPERATIVO: { label: 'Personal Administrativo / Apoyo', capRd: 65000 },
  CONTRATADO_ESPECIAL: { label: 'Personal Contratado Especializado', capRd: 140000 },
};

export function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function formatRd(amount: number): string {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Validación oficial de Cédula de Identidad y Electoral Dominicana (JCE) mediante algoritmo Módulo 10.
 */
export function validateDominicanCedula(rawCedula: string): boolean {
  const digits = rawCedula.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false; // rechaza dígitos repetidos como 00000000000

  const weights = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const product = Number(digits[i]) * weights[i];
    sum += product >= 10 ? Math.floor(product / 10) + (product % 10) : product;
  }
  const expectedDigit = (10 - (sum % 10)) % 10;
  return expectedDigit === Number(digits[10]);
}

export function maskCedula(rawCedula: string): string {
  const clean = rawCedula.replace(/\D/g, '');
  if (clean.length !== 11) return '***-*******-*';
  return `${clean.slice(0, 3)}-****${clean.slice(7, 10)}-${clean.slice(10)}`;
}

export function maskAccount(account: string): string {
  if (!account || account.length < 4) return '****';
  return `****${account.slice(-4)}`;
}

/**
 * Cálculo legal exacto conforme a:
 * - Ley 87-01 (TSS: SFS 3.04%/7.09%, AFP 2.87%/7.10%, SRL 1.15%)
 * - Ley 11-92 Art. 296 (Código Tributario / Escala DGII mensual vigente)
 * - Ley 16-92 / Ley 41-08 (Provisión Regalía Pascual 1/12)
 */
export function calculateDominicanPayroll(input: {
  salarioBase: number;
  compensaciones: number;
  horasExtras: number;
  tssReportadoEmpleado?: number;
  isrReportado?: number;
  otrosDescuentosReportados?: number;
  netoPagadoReportado?: number;
}): LegalCalculationResult {
  const salarioBase = Math.max(0, Number(input.salarioBase) || 0);
  const compensaciones = Math.max(0, Number(input.compensaciones) || 0);
  const horasExtras = Math.max(0, Number(input.horasExtras) || 0);
  const otrosDesc = Math.max(0, Number(input.otrosDescuentosReportados) || 0);

  const salarioBruto = round2(salarioBase + compensaciones + horasExtras);
  // Base cotizable TSS: Salario ordinario + comisiones/incentivos ordinarios (hasta topes legales)
  const salarioCotizableTss = round2(salarioBase + horasExtras);

  const baseSfs = Math.min(salarioCotizableTss, TOPE_SFS);
  const baseAfp = Math.min(salarioCotizableTss, TOPE_AFP);
  const baseSrl = Math.min(salarioCotizableTss, TOPE_SRL);

  const sfsEmpleado = round2(baseSfs * 0.0304);
  const afpEmpleado = round2(baseAfp * 0.0287);
  const tssTotalEmpleado = round2(sfsEmpleado + afpEmpleado);

  const sfsEmpleador = round2(baseSfs * 0.0709);
  const afpEmpleador = round2(baseAfp * 0.071);
  const srlEmpleador = round2(baseSrl * 0.0115);
  const tssTotalEmpleador = round2(sfsEmpleador + afpEmpleador + srlEmpleador);

  // Base imponible DGII ISR: Bruto gravable menos retenciones TSS del empleado
  const baseImponibleIsr = round2(Math.max(0, salarioBruto - tssTotalEmpleado));

  let isrCalculado = 0;
  let tramoIsrLabel = 'Exento (≤ RD$34,685.00)';

  if (baseImponibleIsr <= 34685.0) {
    isrCalculado = 0;
    tramoIsrLabel = 'Tramo I · Exento (≤ RD$34,685.00)';
  } else if (baseImponibleIsr <= 52027.42) {
    isrCalculado = round2((baseImponibleIsr - 34685.0) * 0.15);
    tramoIsrLabel = 'Tramo II · 15% excedente RD$34,685.00';
  } else if (baseImponibleIsr <= 72260.25) {
    isrCalculado = round2(2601.33 + (baseImponibleIsr - 52027.42) * 0.2);
    tramoIsrLabel = 'Tramo III · RD$2,601.33 + 20% exc.';
  } else {
    isrCalculado = round2(6647.92 + (baseImponibleIsr - 72260.25) * 0.25);
    tramoIsrLabel = 'Tramo IV · RD$6,647.92 + 25% exc.';
  }

  const regaliaPascualMensual = round2(salarioBase / 12);
  const netoLegalCalculado = round2(salarioBruto - tssTotalEmpleado - isrCalculado - otrosDesc);

  const tssRep = input.tssReportadoEmpleado ?? tssTotalEmpleado;
  const isrRep = input.isrReportado ?? isrCalculado;
  const netoRep = input.netoPagadoReportado ?? netoLegalCalculado;

  return {
    salarioBruto,
    salarioCotizableTss,
    sfsEmpleado,
    afpEmpleado,
    tssTotalEmpleado,
    sfsEmpleador,
    afpEmpleador,
    srlEmpleador,
    tssTotalEmpleador,
    baseImponibleIsr,
    isrCalculado,
    tramoIsrLabel,
    regaliaPascualMensual,
    netoLegalCalculado,
    diferenciaTss: round2(tssRep - tssTotalEmpleado),
    diferenciaIsr: round2(isrRep - isrCalculado),
    diferenciaNeto: round2(netoRep - netoLegalCalculado),
  };
}

/**
 * Motor integral de auditoría CCRD:
 * Evalúa cada registro contra Ley 10-04, Ley 41-08, Ley 105-13, Ley 87-01, Ley 11-92 y Ley 423-06.
 */
export function runFullPayrollAudit(
  records: PayrollRecord[],
  budgets: DigepresBudgetLine[],
  existingStatuses?: Record<string, { status: AlertStatus; resolvedBy?: string; resolutionNote?: string }>
): {
  auditedRows: AuditedPayrollRow[];
  findings: AuditFinding[];
  digepresComparisons: DigepresComparisonRow[];
} {
  const cedulaMap = new Map<string, PayrollRecord[]>();
  for (const r of records) {
    const clean = r.cedula.replace(/\D/g, '');
    const list = cedulaMap.get(clean) ?? [];
    list.push(r);
    cedulaMap.set(clean, list);
  }

  const allFindings: AuditFinding[] = [];
  const auditedRows: AuditedPayrollRow[] = [];

  const applySavedStatus = (finding: AuditFinding): AuditFinding => {
    const saved = existingStatuses?.[finding.id];
    if (saved) {
      return {
        ...finding,
        status: saved.status,
        resolvedBy: saved.resolvedBy,
        resolutionNote: saved.resolutionNote,
      };
    }
    return finding;
  };

  for (const record of records) {
    const calc = calculateDominicanPayroll(record);
    const cedulaValida = validateDominicanCedula(record.cedula);
    const rowFindings: AuditFinding[] = [];
    const nowIso = new Date().toISOString();

    // 1. Validación de Cédula JCE
    if (!cedulaValida) {
      rowFindings.push(
        applySavedStatus({
          id: `CED-${record.id}`,
          recordId: record.id,
          institutionId: record.institutionId,
          institutionName: record.institutionName,
          period: record.period,
          codigoNorma: 'LEY 10-04 ART. 28 / JCE',
          leyAplicable: 'Ley 10-04 de la Cámara de Cuentas',
          categoria: 'CEDULA_INVALIDA',
          severity: 'CRITICO',
          titulo: `Cédula inválida en nómina: ${record.nombreCompleto}`,
          descripcion: `El número de cédula ${maskCedula(record.cedula)} no supera el dígito verificador Módulo 10 de la JCE. Posible registro ficticio o error grave de empadronamiento en ${record.cargo}.`,
          impactoFinancieroRd: calc.salarioBruto,
          status: 'PENDIENTE',
          detectedAt: nowIso,
        })
      );
    }

    // 2. Detección de Doble Percepción (Ley 41-08 Art. 80 & Const. Art. 144)
    const cleanCedula = record.cedula.replace(/\D/g, '');
    const matches = cedulaMap.get(cleanCedula) ?? [];
    if (matches.length > 1 && !record.exentoDocencia) {
      const otherInstitutions = matches
        .filter((m) => m.id !== record.id)
        .map((m) => `${m.institutionName} (${m.cargo})`)
        .join(', ');
      rowFindings.push(
        applySavedStatus({
          id: `DUP-${record.id}`,
          recordId: record.id,
          institutionId: record.institutionId,
          institutionName: record.institutionName,
          period: record.period,
          codigoNorma: 'CONST. ART. 144 / LEY 41-08 ART. 80',
          leyAplicable: 'Ley 41-08 de Función Pública',
          categoria: 'DOBLE_PERCEPCION',
          severity: 'CRITICO',
          titulo: `Doble percepción salarial detectada: ${record.nombreCompleto}`,
          descripcion: `La cédula ${maskCedula(record.cedula)} figura percibiendo remuneración simultánea en: ${otherInstitutions}, sin excepción legal de docencia registrada.`,
          impactoFinancieroRd: calc.salarioBruto,
          status: 'PENDIENTE',
          detectedAt: nowIso,
        })
      );
    }

    // 3. Tope Salarial Estatal (Ley 105-13)
    const tierCap = ROLE_TIER_CAPS[record.roleTier];
    if (calc.salarioBruto > tierCap.capRd) {
      const exceso = round2(calc.salarioBruto - tierCap.capRd);
      rowFindings.push(
        applySavedStatus({
          id: `TOP-${record.id}`,
          recordId: record.id,
          institutionId: record.institutionId,
          institutionName: record.institutionName,
          period: record.period,
          codigoNorma: 'LEY 105-13 ART. 8-12',
          leyAplicable: 'Ley 105-13 Regulación Salarial del Estado',
          categoria: 'TOPE_SALARIAL',
          severity: 'ALTO',
          titulo: `Exceso sobre tope salarial (${tierCap.label})`,
          descripcion: `${record.nombreCompleto} devenga ${formatRd(calc.salarioBruto)}, excediendo en ${formatRd(exceso)} el límite de ${formatRd(tierCap.capRd)} para su nivel jerárquico.`,
          impactoFinancieroRd: exceso,
          status: 'PENDIENTE',
          detectedAt: nowIso,
        })
      );
    }

    // 4. Compensaciones extraordinarias > 30% del salario base (Ley 105-13 Art. 14)
    if (record.salarioBase > 0 && record.compensaciones > record.salarioBase * 0.3) {
      const excesoComp = round2(record.compensaciones - record.salarioBase * 0.3);
      rowFindings.push(
        applySavedStatus({
          id: `CMP-${record.id}`,
          recordId: record.id,
          institutionId: record.institutionId,
          institutionName: record.institutionName,
          period: record.period,
          codigoNorma: 'LEY 105-13 ART. 14 / MAP',
          leyAplicable: 'Ley 105-13 y Normativa MAP',
          categoria: 'COMPENSACION_EXCESIVA',
          severity: 'MEDIO',
          titulo: `Compensación adicional supera 30% del salario base`,
          descripcion: `Las compensaciones (${formatRd(record.compensaciones)}) representan ${((record.compensaciones / record.salarioBase) * 100).toFixed(1)}% del sueldo base de ${record.nombreCompleto}.`,
          impactoFinancieroRd: excesoComp,
          status: 'PENDIENTE',
          detectedAt: nowIso,
        })
      );
    }

    // 5. Desviación en Cálculo Legal TSS / DGII ISR
    const absTssDiff = Math.abs(calc.diferenciaTss);
    const absIsrDiff = Math.abs(calc.diferenciaIsr);
    if (absTssDiff > 5 || absIsrDiff > 5) {
      const impacto = round2(absTssDiff + absIsrDiff);
      rowFindings.push(
        applySavedStatus({
          id: `TAX-${record.id}`,
          recordId: record.id,
          institutionId: record.institutionId,
          institutionName: record.institutionName,
          period: record.period,
          codigoNorma: 'LEY 11-92 ART. 296 / LEY 87-01',
          leyAplicable: 'Código Tributario (DGII) y Seguridad Social (TSS)',
          categoria: 'DESVIACION_ISR_TSS',
          severity: impacto > 3000 ? 'ALTO' : 'MEDIO',
          titulo: `Desviación en retención legal ISR/TSS: ${record.nombreCompleto}`,
          descripcion: `Diferencia detectada frente a escala legal vigente: ISR (${calc.diferenciaIsr >= 0 ? '+' : ''}${formatRd(calc.diferenciaIsr)}) y TSS (${calc.diferenciaTss >= 0 ? '+' : ''}${formatRd(calc.diferenciaTss)}).`,
          impactoFinancieroRd: impacto,
          status: 'PENDIENTE',
          detectedAt: nowIso,
        })
      );
    }

    // 6. Variación Intermensual Atípica > 15% sin Resolución MAP
    if (
      record.salarioAnterior > 0 &&
      (calc.salarioBruto - record.salarioAnterior) / record.salarioAnterior > 0.15 &&
      !record.resolucionMap
    ) {
      const aumento = round2(calc.salarioBruto - record.salarioAnterior);
      rowFindings.push(
        applySavedStatus({
          id: `VAR-${record.id}`,
          recordId: record.id,
          institutionId: record.institutionId,
          institutionName: record.institutionName,
          period: record.period,
          codigoNorma: 'LEY 41-08 / DIGEPRES',
          leyAplicable: 'Ley 41-08 y Reglas de Ejecución MAP',
          categoria: 'VARIACION_ATIPICA',
          severity: 'ALTO',
          titulo: `Incremento salarial >15% sin Resolución MAP`,
          descripcion: `Aumento intermensual de ${formatRd(aumento)} (+${(((calc.salarioBruto - record.salarioAnterior) / record.salarioAnterior) * 100).toFixed(1)}%) para ${record.nombreCompleto} sin código de aprobación MAP.`,
          impactoFinancieroRd: aumento,
          status: 'PENDIENTE',
          detectedAt: nowIso,
        })
      );
    }

    allFindings.push(...rowFindings);

    const hasCritico = rowFindings.some((f) => f.severity === 'CRITICO');
    const riesgoNivel = hasCritico
      ? 'HALLAZGO_CRITICO'
      : rowFindings.length > 0
      ? 'OBSERVACION'
      : 'CONFORME';

    auditedRows.push({
      record,
      cedulaValida,
      calculation: calc,
      findings: rowFindings,
      riesgoNivel,
    });
  }

  // 7. Control Presupuestario DIGEPRES (Ley 423-06) por Institución y Objeto del Gasto
  const digepresComparisons: DigepresComparisonRow[] = [];

  for (const b of budgets) {
    const instRows = auditedRows.filter((r) => r.record.institutionId === b.institutionId);
    let devengadoReportado = 0;
    let recalculoLegalCcrd = 0;

    if (b.objetoGasto === '2.1.1.1.01') {
      const fijos = instRows.filter((r) => r.record.objetoGasto === '2.1.1.1.01');
      devengadoReportado = round2(fijos.reduce((acc, r) => acc + r.record.salarioBase + r.record.horasExtras, 0));
      recalculoLegalCcrd = devengadoReportado;
    } else if (b.objetoGasto === '2.1.1.2.02') {
      const contratados = instRows.filter((r) => r.record.objetoGasto === '2.1.1.2.02');
      devengadoReportado = round2(
        contratados.reduce((acc, r) => acc + r.record.salarioBase + r.record.horasExtras, 0)
      );
      recalculoLegalCcrd = devengadoReportado;
    } else if (b.objetoGasto === '2.1.1.5.01') {
      devengadoReportado = round2(instRows.reduce((acc, r) => acc + r.record.compensaciones, 0));
      recalculoLegalCcrd = round2(
        instRows.reduce(
          (acc, r) => acc + Math.min(r.record.compensaciones, r.record.salarioBase * 0.3),
          0
        )
      );
    } else if (b.objetoGasto === '2.1.5.1.01') {
      devengadoReportado = round2(
        instRows.reduce((acc, r) => acc + r.calculation.tssTotalEmpleador, 0)
      );
      recalculoLegalCcrd = devengadoReportado;
    }

    const variacionPresupuestaria = round2(b.presupuestoAprobadoMensual - devengadoReportado);
    const porcentajeEjecucion =
      b.presupuestoAprobadoMensual > 0
        ? round2((devengadoReportado / b.presupuestoAprobadoMensual) * 100)
        : 0;

    const estadoPresupuestario: DigepresComparisonRow['estadoPresupuestario'] =
      porcentajeEjecucion > 100
        ? 'SOBREGIRO'
        : porcentajeEjecucion >= 90
        ? 'ALERTA_TEMPRANA'
        : 'DENTRO_LIMITE';

    digepresComparisons.push({
      institutionId: b.institutionId,
      institutionName: b.institutionName,
      objetoGasto: b.objetoGasto,
      denominacion: b.denominacion,
      presupuestoAprobado: b.presupuestoAprobadoMensual,
      devengadoReportado,
      recalculoLegalCcrd,
      variacionPresupuestaria,
      porcentajeEjecucion,
      estadoPresupuestario,
    });

    if (estadoPresupuestario === 'SOBREGIRO') {
      const sobregiro = round2(devengadoReportado - b.presupuestoAprobadoMensual);
      allFindings.push(
        applySavedStatus({
          id: `DIG-${b.institutionId}-${b.objetoGasto}`,
          institutionId: b.institutionId,
          institutionName: b.institutionName,
          period: b.period,
          codigoNorma: 'LEY 423-06 ART. 47 / DIGEPRES',
          leyAplicable: 'Ley Orgánica de Presupuesto para el Sector Público',
          categoria: 'SOBREGIRO_DIGEPRES',
          severity: 'CRITICO',
          titulo: `Sobregiro presupuestario en Objeto ${b.objetoGasto} (${b.denominacion})`,
          descripcion: `La ejecución devengada (${formatRd(devengadoReportado)}) supera el monto aprobado DIGEPRES (${formatRd(b.presupuestoAprobadoMensual)}) en ${formatRd(sobregiro)} (${porcentajeEjecucion}%).`,
          impactoFinancieroRd: sobregiro,
          status: 'PENDIENTE',
          detectedAt: new Date().toISOString(),
        })
      );
    } else if (estadoPresupuestario === 'ALERTA_TEMPRANA') {
      allFindings.push(
        applySavedStatus({
          id: `DIG-WARN-${b.institutionId}-${b.objetoGasto}`,
          institutionId: b.institutionId,
          institutionName: b.institutionName,
          period: b.period,
          codigoNorma: 'LEY 423-06 / NOBACI MONITOREO',
          leyAplicable: 'Ley 423-06 y Control Preventivo DIGEPRES',
          categoria: 'SOBREGIRO_DIGEPRES',
          severity: 'MEDIO',
          titulo: `Ejecución preventiva ≥90% en Objeto ${b.objetoGasto}`,
          descripcion: `La partida ${b.denominacion} alcanzó el ${porcentajeEjecucion}% del techo mensual aprobado (${formatRd(b.presupuestoAprobadoMensual)}).`,
          impactoFinancieroRd: 0,
          status: 'PENDIENTE',
          detectedAt: new Date().toISOString(),
        })
      );
    }
  }

  // Ordenar hallazgos por severidad (CRITICO -> ALTO -> MEDIO)
  const severityRank: Record<FindingSeverity, number> = { CRITICO: 0, ALTO: 1, MEDIO: 2 };
  allFindings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return { auditedRows, findings: allFindings, digepresComparisons };
}
