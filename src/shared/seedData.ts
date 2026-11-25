import {
  DigepresBudgetLine,
  PayrollRecord,
  calculateDominicanPayroll,
} from './dominicanPayroll.ts';

/**
 * Genera una cédula dominicana de 11 dígitos con dígito verificador Módulo 10 válido.
 */
function buildValidCedula(prefix10: string): string {
  const digits = prefix10.replace(/\D/g, '').slice(0, 10);
  const weights = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const p = Number(digits[i]) * weights[i];
    sum += p >= 10 ? Math.floor(p / 10) + (p % 10) : p;
  }
  const check = (10 - (sum % 10)) % 10;
  const full = digits + String(check);
  return `${full.slice(0, 3)}-${full.slice(3, 10)}-${full.slice(10)}`;
}

function makeCleanRecord(
  partial: Omit<
    PayrollRecord,
    'tssReportadoEmpleado' | 'isrReportado' | 'otrosDescuentosReportados' | 'netoPagadoReportado'
  > & {
    tssOverride?: number;
    isrOverride?: number;
    otrosDescuentos?: number;
  }
): PayrollRecord {
  const calc = calculateDominicanPayroll({
    salarioBase: partial.salarioBase,
    compensaciones: partial.compensaciones,
    horasExtras: partial.horasExtras,
    otrosDescuentosReportados: partial.otrosDescuentos ?? 0,
  });

  const tssReportadoEmpleado = partial.tssOverride ?? calc.tssTotalEmpleado;
  const isrReportado = partial.isrOverride ?? calc.isrCalculado;
  const otrosDescuentosReportados = partial.otrosDescuentos ?? 0;
  const netoPagadoReportado =
    Math.round(
      (calc.salarioBruto - tssReportadoEmpleado - isrReportado - otrosDescuentosReportados) * 100
    ) / 100;

  return {
    id: partial.id,
    institutionId: partial.institutionId,
    institutionName: partial.institutionName,
    period: partial.period,
    cedula: partial.cedula,
    nombreCompleto: partial.nombreCompleto,
    cargo: partial.cargo,
    departamento: partial.departamento,
    roleTier: partial.roleTier,
    objetoGasto: partial.objetoGasto,
    banco: partial.banco,
    cuentaBancaria: partial.cuentaBancaria,
    salarioBase: partial.salarioBase,
    compensaciones: partial.compensaciones,
    horasExtras: partial.horasExtras,
    salarioAnterior: partial.salarioAnterior,
    resolucionMap: partial.resolucionMap,
    exentoDocencia: partial.exentoDocencia,
    tssReportadoEmpleado,
    isrReportado,
    otrosDescuentosReportados,
    netoPagadoReportado,
  };
}

const CEDULA_DOBLE_NOMINA = buildValidCedula('0011489203');

export const INITIAL_PAYROLL_RECORDS: PayrollRecord[] = [
  // 1. MINISTERIO DE OBRAS PÚBLICAS Y COMUNICACIONES (MOPC)
  makeCleanRecord({
    id: 'MOPC-001',
    institutionId: 'MOPC',
    institutionName: 'Ministerio de Obras Públicas (MOPC)',
    period: '2026-11',
    cedula: buildValidCedula('0010458912'),
    nombreCompleto: 'Rafael Antonio Mejía Castillo',
    cargo: 'Viceministro de Supervisión Vial',
    departamento: 'Despacho Viceministerial',
    roleTier: 'VICEMINISTRO_DIRECTOR',
    objetoGasto: '2.1.1.1.01',
    banco: 'Banreservas',
    cuentaBancaria: '9601448219',
    salarioBase: 225000,
    compensaciones: 20000,
    horasExtras: 0,
    salarioAnterior: 245000,
    resolucionMap: 'MAP-2025-0412',
  }),
  makeCleanRecord({
    id: 'MOPC-002',
    institutionId: 'MOPC',
    institutionName: 'Ministerio de Obras Públicas (MOPC)',
    period: '2026-11',
    cedula: buildValidCedula('0011294810'),
    nombreCompleto: 'Yudelka Mercedes Peña Almonte',
    cargo: 'Directora de Planificación y Presupuesto',
    departamento: 'Planificación Institucional',
    roleTier: 'ENCARGADO_DEPARTAMENTO',
    objetoGasto: '2.1.1.1.01',
    banco: 'Banreservas',
    cuentaBancaria: '9602387410',
    salarioBase: 145000,
    compensaciones: 12000,
    horasExtras: 0,
    salarioAnterior: 157000,
    // Hallazgo intencional: sub-retención ISR DGII (reportó RD$4,200 menos de lo debido)
    isrOverride: 17500,
  }),
  makeCleanRecord({
    id: 'MOPC-003',
    institutionId: 'MOPC',
    institutionName: 'Ministerio de Obras Públicas (MOPC)',
    period: '2026-11',
    cedula: buildValidCedula('0310554321'),
    nombreCompleto: 'Carlos Manuel Rodríguez Taveras',
    cargo: 'Ingeniero Inspector Senior',
    departamento: 'Fiscalización de Obras',
    roleTier: 'TECNICO_PROFESIONAL',
    objetoGasto: '2.1.1.1.01',
    banco: 'Banco Popular',
    cuentaBancaria: '7412908831',
    salarioBase: 92000,
    compensaciones: 8000,
    horasExtras: 4500,
    salarioAnterior: 100000,
  }),
  makeCleanRecord({
    id: 'MOPC-004',
    institutionId: 'MOPC',
    institutionName: 'Ministerio de Obras Públicas (MOPC)',
    period: '2026-11',
    cedula: CEDULA_DOBLE_NOMINA, // Hallazgo crítico: Doble percepción con ADN
    nombreCompleto: 'Héctor Luis Paredes Guzmán',
    cargo: 'Asesor Técnico de Infraestructura',
    departamento: 'Consultoría Técnica',
    roleTier: 'CONTRATADO_ESPECIAL',
    objetoGasto: '2.1.1.2.02',
    banco: 'Banreservas',
    cuentaBancaria: '9604519022',
    salarioBase: 118000,
    compensaciones: 15000,
    horasExtras: 0,
    salarioAnterior: 133000,
  }),
  makeCleanRecord({
    id: 'MOPC-005',
    institutionId: 'MOPC',
    institutionName: 'Ministerio de Obras Públicas (MOPC)',
    period: '2026-11',
    cedula: '001-9988776-0', // Hallazgo crítico: Dígito verificador JCE inválido
    nombreCompleto: 'Kelvin José Ramírez Suero',
    cargo: 'Supervisor Regional de Mantenimiento',
    departamento: 'Operaciones Norte',
    roleTier: 'TECNICO_PROFESIONAL',
    objetoGasto: '2.1.1.2.02',
    banco: 'BHD León',
    cuentaBancaria: '1120498821',
    salarioBase: 78000,
    compensaciones: 0,
    horasExtras: 0,
    salarioAnterior: 78000,
  }),
  makeCleanRecord({
    id: 'MOPC-006',
    institutionId: 'MOPC',
    institutionName: 'Ministerio de Obras Públicas (MOPC)',
    period: '2026-11',
    cedula: buildValidCedula('0470198234'),
    nombreCompleto: 'Marisol Altagracia Núñez Brito',
    cargo: 'Encargada de Compras y Contrataciones',
    departamento: 'Administración y Finanzas',
    roleTier: 'ENCARGADO_DEPARTAMENTO',
    objetoGasto: '2.1.1.1.01',
    banco: 'Banreservas',
    cuentaBancaria: '9608823415',
    salarioBase: 135000,
    compensaciones: 58000, // Hallazgo: compensación > 30% + excede tope de Encargado Depto (160k)
    horasExtras: 0,
    salarioAnterior: 150000, // +28.7% sin resolución MAP
  }),
  makeCleanRecord({
    id: 'MOPC-007',
    institutionId: 'MOPC',
    institutionName: 'Ministerio de Obras Públicas (MOPC)',
    period: '2026-11',
    cedula: buildValidCedula('0011784329'),
    nombreCompleto: 'Ana Gabriela Rosario Pérez',
    cargo: 'Analista Contable II',
    departamento: 'Contabilidad Gubernamental',
    roleTier: 'TECNICO_PROFESIONAL',
    objetoGasto: '2.1.1.1.01',
    banco: 'Banreservas',
    cuentaBancaria: '9603190024',
    salarioBase: 68500,
    compensaciones: 0,
    horasExtras: 0,
    salarioAnterior: 68500,
  }),
  makeCleanRecord({
    id: 'MOPC-008',
    institutionId: 'MOPC',
    institutionName: 'Ministerio de Obras Públicas (MOPC)',
    period: '2026-11',
    cedula: buildValidCedula('0020918273'),
    nombreCompleto: 'Domingo Enrique Santana Lora',
    cargo: 'Auxiliar de Archivo y Correspondencia',
    departamento: 'Servicios Generales',
    roleTier: 'APOYO_OPERATIVO',
    objetoGasto: '2.1.1.1.01',
    banco: 'Banreservas',
    cuentaBancaria: '9607712340',
    salarioBase: 32500,
    compensaciones: 0,
    horasExtras: 2200,
    salarioAnterior: 34700,
  }),

  // 2. AYUNTAMIENTO DEL DISTRITO NACIONAL (ADN)
  makeCleanRecord({
    id: 'ADN-001',
    institutionId: 'ADN',
    institutionName: 'Ayuntamiento del Distrito Nacional (ADN)',
    period: '2026-11',
    cedula: buildValidCedula('0010837461'),
    nombreCompleto: 'Francisco Alberto Gómez Báez',
    cargo: 'Director de Aseo Urbano y Equipos',
    departamento: 'Gestión Ambiental',
    roleTier: 'ENCARGADO_DEPARTAMENTO',
    objetoGasto: '2.1.1.1.01',
    banco: 'Banreservas',
    cuentaBancaria: '9605129873',
    salarioBase: 142000,
    compensaciones: 15000,
    horasExtras: 0,
    salarioAnterior: 157000,
  }),
  makeCleanRecord({
    id: 'ADN-002',
    institutionId: 'ADN',
    institutionName: 'Ayuntamiento del Distrito Nacional (ADN)',
    period: '2026-11',
    cedula: CEDULA_DOBLE_NOMINA, // Misma cédula que MOPC-004
    nombreCompleto: 'Héctor Luis Paredes Guzmán',
    cargo: 'Consultor de Movilidad Urbana',
    departamento: 'Planeamiento Urbano',
    roleTier: 'CONTRATADO_ESPECIAL',
    objetoGasto: '2.1.1.2.02',
    banco: 'Banco Popular',
    cuentaBancaria: '7419901234',
    salarioBase: 110000,
    compensaciones: 0,
    horasExtras: 0,
    salarioAnterior: 110000,
  }),
  makeCleanRecord({
    id: 'ADN-003',
    institutionId: 'ADN',
    institutionName: 'Ayuntamiento del Distrito Nacional (ADN)',
    period: '2026-11',
    cedula: buildValidCedula('0011649281'),
    nombreCompleto: 'Claribel Josefina Matos Polanco',
    cargo: 'Coordinadora de Recaudación Municipal',
    departamento: 'Tesorería Municipal',
    roleTier: 'TECNICO_PROFESIONAL',
    objetoGasto: '2.1.1.1.01',
    banco: 'Banreservas',
    cuentaBancaria: '9609438271',
    salarioBase: 86000,
    compensaciones: 5000,
    horasExtras: 0,
    salarioAnterior: 91000,
  }),
  makeCleanRecord({
    id: 'ADN-004',
    institutionId: 'ADN',
    institutionName: 'Ayuntamiento del Distrito Nacional (ADN)',
    period: '2026-11',
    cedula: buildValidCedula('0011902384'),
    nombreCompleto: 'Pedro Julio Alcántara Reyes',
    cargo: 'Inspector de Espacios Públicos (Contratado)',
    departamento: 'Defensoría del Espacio Público',
    roleTier: 'CONTRATADO_ESPECIAL',
    objetoGasto: '2.1.1.2.02',
    banco: 'Banreservas',
    cuentaBancaria: '9602234918',
    salarioBase: 75000,
    compensaciones: 0,
    horasExtras: 0,
    salarioAnterior: 75000,
  }),

  // 3. DIRECCIÓN GENERAL DE ADUANAS (DGA)
  makeCleanRecord({
    id: 'DGA-001',
    institutionId: 'DGA',
    institutionName: 'Dirección General de Aduanas (DGA)',
    period: '2026-11',
    cedula: buildValidCedula('0010519283'),
    nombreCompleto: 'Eduardo Miguel Valenzuela Ortiz',
    cargo: 'Subdirector Técnico Aduanero',
    departamento: 'Subdirección Técnica',
    roleTier: 'VICEMINISTRO_DIRECTOR',
    objetoGasto: '2.1.1.1.01',
    banco: 'Banreservas',
    cuentaBancaria: '9601102938',
    salarioBase: 215000,
    compensaciones: 25000,
    horasExtras: 0,
    salarioAnterior: 240000,
    resolucionMap: 'MAP-2025-0108',
  }),
  makeCleanRecord({
    id: 'DGA-002',
    institutionId: 'DGA',
    institutionName: 'Dirección General de Aduanas (DGA)',
    period: '2026-11',
    cedula: buildValidCedula('0011348920'),
    nombreCompleto: 'Laura Patricia Estrella Cruz',
    cargo: 'Especialista en Valoración Aduanera',
    departamento: 'Gestión de Riesgos',
    roleTier: 'TECNICO_PROFESIONAL',
    objetoGasto: '2.1.1.1.01',
    banco: 'BHD León',
    cuentaBancaria: '1129873412',
    salarioBase: 98000,
    compensaciones: 0,
    horasExtras: 0,
    salarioAnterior: 98000,
  }),
  makeCleanRecord({
    id: 'DGA-003',
    institutionId: 'DGA',
    institutionName: 'Dirección General de Aduanas (DGA)',
    period: '2026-11',
    cedula: buildValidCedula('0340081927'),
    nombreCompleto: 'Miguel Ángel Sosa Marte',
    cargo: 'Oficial de Verificación Portuaria',
    departamento: 'Aduana Multimodal Caucedo',
    roleTier: 'TECNICO_PROFESIONAL',
    objetoGasto: '2.1.1.1.01',
    banco: 'Banreservas',
    cuentaBancaria: '9606651234',
    salarioBase: 64000,
    compensaciones: 6000,
    horasExtras: 4200,
    salarioAnterior: 74200,
    // Pequeña diferencia TSS reportada
    tssOverride: 3450,
  }),
];

export const INITIAL_DIGEPRES_BUDGETS: DigepresBudgetLine[] = [
  // MOPC
  {
    institutionId: 'MOPC',
    institutionName: 'Ministerio de Obras Públicas (MOPC)',
    period: '2026-11',
    objetoGasto: '2.1.1.1.01',
    denominacion: 'Sueldos Fijos Personal Estatutario',
    presupuestoAprobadoMensual: 720000,
  },
  {
    institutionId: 'MOPC',
    institutionName: 'Ministerio de Obras Públicas (MOPC)',
    period: '2026-11',
    objetoGasto: '2.1.1.2.02',
    denominacion: 'Sueldos Personal Contratado',
    presupuestoAprobadoMensual: 180000, // MOPC tiene 118k + 78k = 196k -> Sobregiro DIGEPRES!
  },
  {
    institutionId: 'MOPC',
    institutionName: 'Ministerio de Obras Públicas (MOPC)',
    period: '2026-11',
    objetoGasto: '2.1.1.5.01',
    denominacion: 'Compensaciones e Incentivos Especiales',
    presupuestoAprobadoMensual: 95000, // 113,000 devengado -> Sobregiro!
  },
  {
    institutionId: 'MOPC',
    institutionName: 'Ministerio de Obras Públicas (MOPC)',
    period: '2026-11',
    objetoGasto: '2.1.5.1.01',
    denominacion: 'Contribuciones Patronales TSS',
    presupuestoAprobadoMensual: 145000,
  },

  // ADN
  {
    institutionId: 'ADN',
    institutionName: 'Ayuntamiento del Distrito Nacional (ADN)',
    period: '2026-11',
    objetoGasto: '2.1.1.1.01',
    denominacion: 'Sueldos Fijos Personal Estatutario',
    presupuestoAprobadoMensual: 245000, // 228k -> 93% Alerta temprana
  },
  {
    institutionId: 'ADN',
    institutionName: 'Ayuntamiento del Distrito Nacional (ADN)',
    period: '2026-11',
    objetoGasto: '2.1.1.2.02',
    denominacion: 'Sueldos Personal Contratado',
    presupuestoAprobadoMensual: 150000, // 185k -> Sobregiro!
  },
  {
    institutionId: 'ADN',
    institutionName: 'Ayuntamiento del Distrito Nacional (ADN)',
    period: '2026-11',
    objetoGasto: '2.1.1.5.01',
    denominacion: 'Compensaciones e Incentivos Especiales',
    presupuestoAprobadoMensual: 35000,
  },
  {
    institutionId: 'ADN',
    institutionName: 'Ayuntamiento del Distrito Nacional (ADN)',
    period: '2026-11',
    objetoGasto: '2.1.5.1.01',
    denominacion: 'Contribuciones Patronales TSS',
    presupuestoAprobadoMensual: 75000,
  },

  // DGA
  {
    institutionId: 'DGA',
    institutionName: 'Dirección General de Aduanas (DGA)',
    period: '2026-11',
    objetoGasto: '2.1.1.1.01',
    denominacion: 'Sueldos Fijos Personal Estatutario',
    presupuestoAprobadoMensual: 420000,
  },
  {
    institutionId: 'DGA',
    institutionName: 'Dirección General de Aduanas (DGA)',
    period: '2026-11',
    objetoGasto: '2.1.1.5.01',
    denominacion: 'Compensaciones e Incentivos Especiales',
    presupuestoAprobadoMensual: 40000,
  },
  {
    institutionId: 'DGA',
    institutionName: 'Dirección General de Aduanas (DGA)',
    period: '2026-11',
    objetoGasto: '2.1.5.1.01',
    denominacion: 'Contribuciones Patronales TSS',
    presupuestoAprobadoMensual: 68000,
  },
];

export interface NobaciControlItem {
  id: string;
  componente:
    | '1. Ambiente de Control'
    | '2. Valoración y Administración de Riesgos'
    | '3. Actividades de Control'
    | '4. Información y Comunicación'
    | '5. Monitoreo y Evaluación';
  codigo: string;
  norma: string;
  descripcion: string;
  baseLegal: string;
  verificado: boolean;
  automatizado: boolean;
  evidencia: string;
}

export const INITIAL_NOBACI_CONTROLS: NobaciControlItem[] = [
  {
    id: 'NOB-01',
    componente: '1. Ambiente de Control',
    codigo: 'NOBACI-AC-01',
    norma: 'Segregación de funciones y control de acceso biométrico/criptográfico',
    descripcion:
      'Acceso restringido mediante autenticación WebAuthn/FIDO2 y credenciales derivadas con scrypt; roles diferenciados para auditores.',
    baseLegal: 'NOBACI Componente 1 · Ley 10-04 Art. 10',
    verificado: true,
    automatizado: true,
    evidencia: 'Sesión verificada en servidor + Llave biométrica/ECDSA registrada',
  },
  {
    id: 'NOB-02',
    componente: '1. Ambiente de Control',
    codigo: 'NOBACI-AC-04',
    norma: 'Integridad ética y detección de incompatibilidad de cargos públicos',
    descripcion:
      'Cruce automático de cédulas entre entidades del Estado para identificar doble percepción salarial prohibida.',
    baseLegal: 'Constitución Art. 144 · Ley 41-08 Art. 80',
    verificado: true,
    automatizado: true,
    evidencia: 'Motor de cruce interinstitucional activo en tiempo real',
  },
  {
    id: 'NOB-03',
    componente: '2. Valoración y Administración de Riesgos',
    codigo: 'NOBACI-VR-02',
    norma: 'Evaluación de riesgos presupuestarios y topes salariales',
    descripcion:
      'Detección temprana (≥90%) y alerta de sobregiro (>100%) por Objeto del Gasto DIGEPRES y jerarquía Ley 105-13.',
    baseLegal: 'Ley 423-06 Art. 47 · Ley 105-13 Art. 8',
    verificado: true,
    automatizado: true,
    evidencia: 'Matriz comparativa DIGEPRES vinculada a alertas automáticas',
  },
  {
    id: 'NOB-04',
    componente: '3. Actividades de Control',
    codigo: 'NOBACI-ACT-01',
    norma: 'Recálculo independiente de retenciones TSS e ISR DGII',
    descripcion:
      'Verificación matemática exacta de SFS, AFP, SRL y tramos progresivos Art. 296 Código Tributario en cada registro.',
    baseLegal: 'Ley 87-01 · Ley 11-92 Art. 296',
    verificado: true,
    automatizado: true,
    evidencia: 'Recálculo automático aplicado al 100% de la nómina auditada',
  },
  {
    id: 'NOB-05',
    componente: '3. Actividades de Control',
    codigo: 'NOBACI-ACT-05',
    norma: 'Validación de identidad JCE y autorización MAP',
    descripcion:
      'Comprobación Módulo 10 de cédulas dominicanas y exigencia de resolución MAP en aumentos superiores al 15%.',
    baseLegal: 'Ley 41-08 · Normativa MAP',
    verificado: true,
    automatizado: true,
    evidencia: 'Validador JCE activo + verificación de códigos de resolución',
  },
  {
    id: 'NOB-06',
    componente: '4. Información y Comunicación',
    codigo: 'NOBACI-IC-02',
    norma: 'Protección de Datos Personales y Enmascaramiento PII (Ley 172-13)',
    descripcion:
      'Enmascaramiento por defecto de cédulas y cuentas bancarias; cifrado E2EE AES-256-GCM en tránsito/exportación.',
    baseLegal: 'Ley 172-13 Arts. 5, 16, 20 · ISO/IEC 27001',
    verificado: true,
    automatizado: true,
    evidencia: 'Enmascaramiento activo + Bóveda E2EE AES-256-GCM operacional',
  },
  {
    id: 'NOB-07',
    componente: '4. Información y Comunicación',
    codigo: 'NOBACI-IC-05',
    norma: 'Exportación forense con cadena de custodia criptográfica',
    descripcion:
      'Empaquetado estándar CSV/JSON/HTML/ZIP con manifiesto SHA-256 verificable para análisis forense y remisión.',
    baseLegal: 'INTOSAI ISSAI 100 / Ley 126-02 Comercio Electrónico y Documentos Digitales',
    verificado: true,
    automatizado: true,
    evidencia: 'Generador ZIP con manifiesto SHA-256 de integridad',
  },
  {
    id: 'NOB-08',
    componente: '5. Monitoreo y Evaluación',
    codigo: 'NOBACI-ME-01',
    norma: 'Bitácora inmutable encadenada por hash en tiempo real',
    descripcion:
      'Registro continuo de accesos, importaciones, desencriptaciones y resoluciones encadenado por SHA-256.',
    baseLegal: 'NOBACI Componente 5 · Ley 10-04',
    verificado: true,
    automatizado: true,
    evidencia: 'Cadena hash SHA-256 auditada y verificable desde consola',
  },
];
