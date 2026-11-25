import JSZip from 'jszip';
import {
  AuditedPayrollRow,
  AuditFinding,
  DigepresComparisonRow,
  formatRd,
  maskAccount,
  maskCedula,
} from '../shared/dominicanPayroll.ts';
import { NobaciControlItem } from '../shared/seedData.ts';
import { encryptJsonE2EE, sha256Hex } from './e2eeCrypto.ts';

export interface AuditLogEntry {
  seq: number;
  timestamp: string;
  actor: string;
  action: string;
  resource: string;
  detail: string;
  prevHash: string;
  entryHash: string;
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  return '\uFEFF' + lines.join('\r\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildAuditedPayrollCsv(rows: AuditedPayrollRow[], includeUnmaskedPii: boolean): string {
  const headers = [
    'ID_Registro',
    'Institucion',
    'Periodo',
    'Cedula',
    'Nombre_Completo',
    'Cargo',
    'Objeto_Gasto',
    'Cuenta_Bancaria',
    'Salario_Base_RD',
    'Compensaciones_RD',
    'Horas_Extras_RD',
    'Salario_Bruto_RD',
    'TSS_SFS_Emp_RD',
    'TSS_AFP_Emp_RD',
    'TSS_Total_Emp_RD',
    'TSS_Reportado_RD',
    'Diferencia_TSS_RD',
    'ISR_Calculado_DGII_RD',
    'ISR_Reportado_RD',
    'Diferencia_ISR_RD',
    'TSS_Patronal_RD',
    'Provision_Regalia_1_12_RD',
    'Neto_Legal_Calculado_RD',
    'Neto_Pagado_Reportado_RD',
    'Cedula_Valida_JCE',
    'Nivel_Riesgo',
    'Hallazgos_Detectados',
  ];

  const dataRows = rows.map(({ record, cedulaValida, calculation, findings, riesgoNivel }) => [
    record.id,
    record.institutionName,
    record.period,
    includeUnmaskedPii ? record.cedula : maskCedula(record.cedula),
    record.nombreCompleto,
    record.cargo,
    record.objetoGasto,
    includeUnmaskedPii ? `${record.banco} ${record.cuentaBancaria}` : `${record.banco} ${maskAccount(record.cuentaBancaria)}`,
    record.salarioBase.toFixed(2),
    record.compensaciones.toFixed(2),
    record.horasExtras.toFixed(2),
    calculation.salarioBruto.toFixed(2),
    calculation.sfsEmpleado.toFixed(2),
    calculation.afpEmpleado.toFixed(2),
    calculation.tssTotalEmpleado.toFixed(2),
    record.tssReportadoEmpleado.toFixed(2),
    calculation.diferenciaTss.toFixed(2),
    calculation.isrCalculado.toFixed(2),
    record.isrReportado.toFixed(2),
    calculation.diferenciaIsr.toFixed(2),
    calculation.tssTotalEmpleador.toFixed(2),
    calculation.regaliaPascualMensual.toFixed(2),
    calculation.netoLegalCalculado.toFixed(2),
    record.netoPagadoReportado.toFixed(2),
    cedulaValida ? 'VALIDA' : 'INVALIDA',
    riesgoNivel,
    findings.map((f) => `[${f.severity}] ${f.codigoNorma}`).join(' | ') || 'Ninguno',
  ]);

  return buildCsv(headers, dataRows);
}

export function buildFindingsCsv(findings: AuditFinding[]): string {
  const headers = [
    'ID_Hallazgo',
    'Institucion',
    'Periodo',
    'Severidad',
    'Estado',
    'Categoria',
    'Norma_Infrigida',
    'Ley_Aplicable',
    'Titulo',
    'Descripcion',
    'Impacto_Financiero_RD',
    'Fecha_Deteccion',
  ];
  const dataRows = findings.map((f) => [
    f.id,
    f.institutionName,
    f.period,
    f.severity,
    f.status,
    f.categoria,
    f.codigoNorma,
    f.leyAplicable,
    f.titulo,
    f.descripcion,
    f.impactoFinancieroRd.toFixed(2),
    f.detectedAt,
  ]);
  return buildCsv(headers, dataRows);
}

export function buildDigepresCsv(comparisons: DigepresComparisonRow[]): string {
  const headers = [
    'Institucion',
    'Objeto_Gasto',
    'Denominacion',
    'Presupuesto_Aprobado_RD',
    'Devengado_Reportado_RD',
    'Recalculo_Legal_CCRD_RD',
    'Variacion_Presupuestaria_RD',
    'Porcentaje_Ejecucion',
    'Estado_Presupuestario',
  ];
  const dataRows = comparisons.map((c) => [
    c.institutionName,
    c.objetoGasto,
    c.denominacion,
    c.presupuestoAprobado.toFixed(2),
    c.devengadoReportado.toFixed(2),
    c.recalculoLegalCcrd.toFixed(2),
    c.variacionPresupuestaria.toFixed(2),
    `${c.porcentajeEjecucion.toFixed(2)}%`,
    c.estadoPresupuestario,
  ]);
  return buildCsv(headers, dataRows);
}

export function buildOfficialHtmlReport(params: {
  institutionLabel: string;
  auditorName: string;
  rows: AuditedPayrollRow[];
  findings: AuditFinding[];
  comparisons: DigepresComparisonRow[];
  integrityHash: string;
}): string {
  const totalBruto = params.rows.reduce((s, r) => s + r.calculation.salarioBruto, 0);
  const totalImpacto = params.findings.reduce((s, f) => s + f.impactoFinancieroRd, 0);
  const criticos = params.findings.filter((f) => f.severity === 'CRITICO').length;

  const findingRowsHtml = params.findings
    .map(
      (f) => `
      <tr>
        <td>${escapeHtml(f.id)}</td>
        <td><strong>${escapeHtml(f.severity)}</strong></td>
        <td>${escapeHtml(f.institutionName)}</td>
        <td>${escapeHtml(f.codigoNorma)}</td>
        <td>${escapeHtml(f.titulo)}</td>
        <td style="text-align:right;font-family:monospace">${escapeHtml(formatRd(f.impactoFinancieroRd))}</td>
      </tr>`
    )
    .join('');

  const compRowsHtml = params.comparisons
    .map(
      (c) => `
      <tr>
        <td>${escapeHtml(c.institutionName)}</td>
        <td style="font-family:monospace">${escapeHtml(c.objetoGasto)}</td>
        <td>${escapeHtml(c.denominacion)}</td>
        <td style="text-align:right;font-family:monospace">${escapeHtml(formatRd(c.presupuestoAprobado))}</td>
        <td style="text-align:right;font-family:monospace">${escapeHtml(formatRd(c.devengadoReportado))}</td>
        <td style="text-align:right;font-family:monospace">${c.porcentajeEjecucion.toFixed(1)}%</td>
        <td>${escapeHtml(c.estadoPresupuestario)}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Informe Forense de Fiscalización de Nóminas - CCRD</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 32px; line-height: 1.5; }
    h1, h2 { color: #0f295c; margin-bottom: 6px; }
    .meta { font-size: 12px; color: #475569; border-bottom: 2px solid #0f295c; padding-bottom: 12px; margin-bottom: 24px; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .kpi { border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; background: #f8fafc; }
    .kpi-label { font-size: 11px; color: #475569; }
    .kpi-val { font-size: 18px; font-weight: bold; font-family: monospace; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 28px; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
    th { background: #f1f5f9; color: #0f295c; }
    .seal { font-family: monospace; font-size: 11px; background: #f1f5f9; padding: 12px; border: 1px solid #cbd5e1; word-break: break-all; }
  </style>
</head>
<body>
  <h1>Cámara de Cuentas de la República Dominicana · Informe Forense de Nóminas</h1>
  <div class="meta">
    Entidad Auditada: <strong>${escapeHtml(params.institutionLabel)}</strong> ·
    Auditor Responsable: <strong>${escapeHtml(params.auditorName)}</strong> ·
    Fecha de Emisión: ${new Date().toLocaleString('es-DO')} ·
    Base Legal: Ley 10-04, Ley 41-08, Ley 105-13, Ley 87-01, Ley 11-92, Ley 423-06, NOBACI y Ley 172-13
  </div>

  <div class="kpis">
    <div class="kpi"><div class="kpi-label">Registros Auditados</div><div class="kpi-val">${params.rows.length}</div></div>
    <div class="kpi"><div class="kpi-label">Monto Bruto Auditado</div><div class="kpi-val">${escapeHtml(formatRd(totalBruto))}</div></div>
    <div class="kpi"><div class="kpi-label">Hallazgos (Críticos)</div><div class="kpi-val">${params.findings.length} (${criticos})</div></div>
    <div class="kpi"><div class="kpi-label">Impacto Financiero Detectado</div><div class="kpi-val">${escapeHtml(formatRd(totalImpacto))}</div></div>
  </div>

  <h2>1. Cuadro Comparativo Presupuestario (DIGEPRES / Ley 423-06)</h2>
  <table>
    <thead>
      <tr>
        <th>Institución</th><th>Objeto</th><th>Denominación</th><th>Aprobado</th><th>Devengado</th><th>Ejecución</th><th>Estado</th>
      </tr>
    </thead>
    <tbody>${compRowsHtml}</tbody>
  </table>

  <h2>2. Hallazgos e Inconsistencias Normativas Detectadas</h2>
  <table>
    <thead>
      <tr>
        <th>ID</th><th>Severidad</th><th>Institución</th><th>Norma</th><th>Hallazgo</th><th>Impacto (RD$)</th>
      </tr>
    </thead>
    <tbody>${findingRowsHtml || '<tr><td colspan="6">Sin hallazgos registrados.</td></tr>'}</tbody>
  </table>

  <h2>3. Sello de Integridad Criptográfica (Ley 126-02 / INTOSAI)</h2>
  <div class="seal">
    SHA-256 Dataset Forense: ${escapeHtml(params.integrityHash)}<br/>
    Nota de Protección de Datos (Ley 172-13): Los datos personales sensibles incluidos en los anexos en formato claro se presentan enmascarados. Los datos íntegros sin enmascarar se encuentran cifrados bajo AES-256-GCM en el archivo 07_Datos_Cifrados_E2EE_AES256.enc.json.
  </div>
</body>
</html>`;
}

export function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ForensicZipBundleResult {
  blob: Blob;
  filename: string;
  manifestHash: string;
  fileCount: number;
  whatsappSummaryText: string;
}

export async function generateForensicZipPackage(params: {
  institutionLabel: string;
  auditorName: string;
  e2eePassphrase: string;
  rows: AuditedPayrollRow[];
  findings: AuditFinding[];
  comparisons: DigepresComparisonRow[];
  nobaciControls: NobaciControlItem[];
  auditLogs: AuditLogEntry[];
}): Promise<ForensicZipBundleResult> {
  const zip = new JSZip();
  const dateStamp = new Date().toISOString().slice(0, 10);
  const safeInst = params.institutionLabel.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 32);
  const filename = `CCRD_Forense_${safeInst}_${dateStamp}.zip`;

  const unmaskedPayload = params.rows.map((r) => ({
    record: r.record,
    calculation: r.calculation,
    findings: r.findings,
  }));

  const e2eeEnvelope = await encryptJsonE2EE(unmaskedPayload, params.e2eePassphrase);
  const datasetHash = e2eeEnvelope.plaintextSha256;

  const files: Record<string, string> = {
    '00_README_EJECUCION_PC.txt': [
      'SIFON-RD · SISTEMA DE FISCALIZACIÓN DE NÓMINAS CCRD',
      '====================================================',
      'Ejecución local en PC:',
      '1. Instale Node.js 20+.',
      '2. En la carpeta del proyecto ejecute: npm install',
      '3. Modo desarrollo local: npm run dev',
      '4. Modo producción local: npm run build && npm start',
      '5. Abra http://localhost:3000 en su navegador.',
      '',
      'Verificación de integridad forense:',
      'Compare el hash SHA-256 de cada archivo con 08_Manifiesto_Integridad_SHA256.txt.',
      'Para descifrar 07_Datos_Cifrados_E2EE_AES256.enc.json utilice la Bóveda E2EE del sistema con su clave de auditor.',
    ].join('\r\n'),
    '01_Informe_Fiscalizacion_CCRD.html': buildOfficialHtmlReport({
      institutionLabel: params.institutionLabel,
      auditorName: params.auditorName,
      rows: params.rows,
      findings: params.findings,
      comparisons: params.comparisons,
      integrityHash: datasetHash,
    }),
    '02_Nomina_Auditada_Enmascarada_Ley172_13.csv': buildAuditedPayrollCsv(params.rows, false),
    '03_Alertas_Inconsistencias_Presupuestarias.csv': buildFindingsCsv(params.findings),
    '04_Cuadro_Comparativo_DIGEPRES.csv': buildDigepresCsv(params.comparisons),
    '05_Cumplimiento_NOBACI_Ley172_13.json': JSON.stringify(
      {
        generadoEn: new Date().toISOString(),
        entidad: params.institutionLabel,
        controlesNobaci: params.nobaciControls,
        ley172_13: {
          enmascaramientoPiiActivo: true,
          cifradoE2ee: 'AES-256-GCM / PBKDF2-SHA256',
          bitacoraHashChain: true,
        },
      },
      null,
      2
    ),
    '06_Bitacora_Auditoria_HashChain.json': JSON.stringify(params.auditLogs, null, 2),
    '07_Datos_Cifrados_E2EE_AES256.enc.json': JSON.stringify(e2eeEnvelope, null, 2),
  };

  const manifestLines: string[] = [
    `MANIFIESTO FORENSE SHA-256 · CÁMARA DE CUENTAS RD`,
    `Generado: ${new Date().toISOString()}`,
    `Entidad: ${params.institutionLabel}`,
    `Auditor: ${params.auditorName}`,
    `Sello E2EE Dataset: ${datasetHash}`,
    `----------------------------------------------------------------`,
  ];

  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content);
    const fileHash = await sha256Hex(content);
    manifestLines.push(`${fileHash}  ${name}`);
  }

  const manifestText = manifestLines.join('\r\n');
  zip.file('08_Manifiesto_Integridad_SHA256.txt', manifestText);
  const manifestHash = await sha256Hex(manifestText);

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  const totalBruto = params.rows.reduce((s, r) => s + r.calculation.salarioBruto, 0);
  const totalImpacto = params.findings.reduce((s, f) => s + f.impactoFinancieroRd, 0);
  const criticos = params.findings.filter((f) => f.severity === 'CRITICO').length;

  const whatsappSummaryText = [
    `*CCRD · Paquete Forense de Auditoría de Nóminas*`,
    `Entidad: ${params.institutionLabel}`,
    `Auditor: ${params.auditorName}`,
    `Registros auditados: ${params.rows.length} | Bruto: ${formatRd(totalBruto)}`,
    `Hallazgos: ${params.findings.length} (${criticos} críticos) | Impacto: ${formatRd(totalImpacto)}`,
    `Cumplimiento: Ley 10-04, 41-08, 105-13, 87-01, 11-92, 423-06, NOBACI y Ley 172-13`,
    `Cifrado E2EE: AES-256-GCM`,
    `Sello SHA-256 Manifiesto: ${manifestHash.slice(0, 24)}...`,
    `Archivo adjunto: ${filename}`,
  ].join('\n');

  return {
    blob,
    filename,
    manifestHash,
    fileCount: Object.keys(files).length + 1,
    whatsappSummaryText,
  };
}
