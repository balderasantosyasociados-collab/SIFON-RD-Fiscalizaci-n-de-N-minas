import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Calculator,
  FileArchive,
  FileSpreadsheet,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Moon,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { AuthGate, AuthSession } from './components/AuthGate.tsx';
import { ComparativeMatrices } from './components/ComparativeMatrices.tsx';
import { ComplianceAndSecurity } from './components/ComplianceAndSecurity.tsx';
import { DashboardOverview } from './components/DashboardOverview.tsx';
import { ForensicExportModal } from './components/ForensicExportModal.tsx';
import { LegalCalculator } from './components/LegalCalculator.tsx';
import { PayrollAuditTable } from './components/PayrollAuditTable.tsx';
import { AuditLogEntry } from './lib/forensicExport.ts';
import {
  AlertStatus,
  AuditedPayrollRow,
  AuditFinding,
  DigepresComparisonRow,
  PayrollRecord,
} from './shared/dominicanPayroll.ts';
import { NobaciControlItem } from './shared/seedData.ts';

type ActiveTab = 'overview' | 'payroll' | 'calculator' | 'comparatives' | 'nobaci' | 'security';

interface DashboardStatePayload {
  auditedRows: AuditedPayrollRow[];
  findings: AuditFinding[];
  digepresComparisons: DigepresComparisonRow[];
  nobaciControls: NobaciControlItem[];
  auditLogs: AuditLogEntry[];
  chainIntegrity: { valid: boolean; count: number; latestHash: string };
}

const NAV_ITEMS: Array<{ id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Resumen y Alertas', icon: LayoutDashboard },
  { id: 'payroll', label: 'Auditoría de Nómina', icon: FileSpreadsheet },
  { id: 'calculator', label: 'Calculadora Legal RD', icon: Calculator },
  { id: 'comparatives', label: 'Cuadros Comparativos', icon: BarChart3 },
  { id: 'nobaci', label: 'NOBACI y Ley 172-13', icon: ShieldCheck },
  { id: 'security', label: 'Cifrado E2EE y Bitácora', icon: Lock },
];

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [selectedInstitution, setSelectedInstitution] = useState<string>('ALL');
  const [focusedRecordId, setFocusedRecordId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardStatePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  const fetchDashboard = useCallback(
    async (silent = false) => {
      if (!session) return;
      if (!silent) setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch('/api/dashboard/state', {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        if (res.status === 401) {
          setSession(null);
          return;
        }
        if (!res.ok) throw new Error('Error cargando estado de fiscalización.');
        const data = (await res.json()) as DashboardStatePayload;
        setDashboard(data);
      } catch (err) {
        if (!silent) {
          setLoadError(err instanceof Error ? err.message : 'Error de comunicación.');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [session]
  );

  useEffect(() => {
    if (!session) return;
    fetchDashboard(false);
    const interval = setInterval(() => {
      fetchDashboard(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [session, fetchDashboard]);

  async function handleUpdateAlertStatus(alertId: string, status: AlertStatus, resolutionNote: string) {
    if (!session) return;
    const res = await fetch(`/api/alerts/${encodeURIComponent(alertId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ status, resolutionNote }),
    });
    if (res.ok) {
      const data = (await res.json()) as DashboardStatePayload;
      setDashboard(data);
    }
  }

  async function handleImportRecords(records: Array<Partial<PayrollRecord>>) {
    if (!session) return;
    const res = await fetch('/api/payrolls/records', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ records }),
    });
    if (res.ok) {
      const data = (await res.json()) as DashboardStatePayload;
      setDashboard(data);
    }
  }

  async function handleResetDataset() {
    if (!session) return;
    const res = await fetch('/api/payrolls/reset', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}` },
    });
    if (res.ok) {
      const data = (await res.json()) as DashboardStatePayload;
      setDashboard(data);
    }
  }

  async function handleToggleNobaci(id: string, verificado: boolean) {
    if (!session) return;
    const res = await fetch(`/api/nobaci/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ verificado }),
    });
    if (res.ok) {
      const data = await res.json();
      setDashboard((prev) =>
        prev
          ? {
              ...prev,
              nobaciControls: data.nobaciControls,
              auditLogs: data.auditLogs,
              chainIntegrity: data.chainIntegrity,
            }
          : prev
      );
    }
  }

  async function handleLogAuditEvent(action: string, resource: string, detail: string) {
    if (!session) return;
    const res = await fetch('/api/audit/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ action, resource, detail }),
    });
    if (res.ok) {
      const data = await res.json();
      setDashboard((prev) =>
        prev
          ? {
              ...prev,
              auditLogs: data.auditLogs,
              chainIntegrity: data.chainIntegrity,
            }
          : prev
      );
    }
  }

  if (!session) {
    return <AuthGate onAuthenticated={setSession} />;
  }

  const activeNavLabel = NAV_ITEMS.find((i) => i.id === activeTab)?.label || 'Resumen';
  const activeAlertsCount =
    dashboard?.findings.filter((f) => f.status !== 'RESUELTA').length ?? 0;

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Sidebar fijo escritorio + móvil */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
            <span className="text-base font-bold tracking-tight text-blue-950 dark:text-slate-100 whitespace-nowrap shrink-0">
              CCRD · SIFON-RD
            </span>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1 text-slate-500 cursor-pointer"
              aria-label="Cerrar menú"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <nav className="p-3 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-blue-900 text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.id === 'overview' && activeAlertsCount > 0 && (
                    <span
                      className={`font-mono tabular-nums text-[11px] ${
                        isActive ? 'text-blue-100' : 'text-red-700 dark:text-red-400 font-semibold'
                      }`}
                    >
                      {activeAlertsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3 text-xs">
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
              {session.auditorName}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {session.authMethod === 'BIOMETRIC_WEBAUTHN'
                ? 'Sesión Biométrica WebAuthn'
                : session.authMethod === 'ECDSA_FIDO'
                ? 'Sesión FIDO ECDSA P-256'
                : 'Sesión Verificada scrypt'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSession(null)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Overlay móvil */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
        />
      )}

      {/* Área principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contrato SaaS */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-md cursor-pointer"
              aria-label="Abrir navegación"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              <span>Cámara de Cuentas RD</span>
              <span className="mx-2">/</span>
              <span>Fiscalización de Nóminas</span>
              <span className="mx-2">/</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {activeNavLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              className="p-2 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer"
              aria-label="Alternar tema claro u oscuro"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              disabled={!dashboard}
              onClick={() => setExportModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileArchive className="w-4 h-4" />
              Generar ZIP Forense
            </button>
          </div>
        </header>

        {/* Contenido principal */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {loading && !dashboard ? (
            <div className="space-y-4">
              <div className="h-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg animate-pulse" />
              <div className="h-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg animate-pulse" />
            </div>
          ) : loadError && !dashboard ? (
            <div className="p-6 border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 rounded-lg">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">{loadError}</p>
              <button
                type="button"
                onClick={() => fetchDashboard(false)}
                className="mt-3 px-4 py-2 text-xs font-medium bg-blue-900 text-white rounded-md cursor-pointer"
              >
                Reintentar carga
              </button>
            </div>
          ) : dashboard ? (
            <>
              {activeTab === 'overview' && (
                <DashboardOverview
                  auditedRows={dashboard.auditedRows}
                  findings={dashboard.findings}
                  digepresComparisons={dashboard.digepresComparisons}
                  selectedInstitution={selectedInstitution}
                  onSelectInstitution={setSelectedInstitution}
                  onUpdateAlertStatus={handleUpdateAlertStatus}
                  onNavigateToAudit={(recId) => {
                    if (recId) setFocusedRecordId(recId);
                    setActiveTab('payroll');
                  }}
                />
              )}

              {activeTab === 'payroll' && (
                <PayrollAuditTable
                  auditedRows={dashboard.auditedRows}
                  selectedInstitution={selectedInstitution}
                  focusedRecordId={focusedRecordId}
                  onClearFocus={() => setFocusedRecordId(null)}
                  onImportRecords={handleImportRecords}
                  onResetDataset={handleResetDataset}
                  onLogAuditEvent={handleLogAuditEvent}
                />
              )}

              {activeTab === 'calculator' && <LegalCalculator />}

              {activeTab === 'comparatives' && (
                <ComparativeMatrices
                  auditedRows={dashboard.auditedRows}
                  digepresComparisons={dashboard.digepresComparisons}
                  selectedInstitution={selectedInstitution}
                />
              )}

              {(activeTab === 'nobaci' || activeTab === 'security') && (
                <ComplianceAndSecurity
                  mode={activeTab}
                  authToken={session.token}
                  auditorName={session.auditorName}
                  auditedRows={dashboard.auditedRows}
                  nobaciControls={dashboard.nobaciControls}
                  auditLogs={dashboard.auditLogs}
                  chainIntegrity={dashboard.chainIntegrity}
                  onToggleNobaci={handleToggleNobaci}
                  onLogAuditEvent={handleLogAuditEvent}
                />
              )}
            </>
          ) : null}
        </main>
      </div>

      {dashboard && (
        <ForensicExportModal
          isOpen={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          auditorName={session.auditorName}
          auditedRows={dashboard.auditedRows}
          findings={dashboard.findings}
          digepresComparisons={dashboard.digepresComparisons}
          nobaciControls={dashboard.nobaciControls}
          auditLogs={dashboard.auditLogs}
          onLogAuditEvent={handleLogAuditEvent}
        />
      )}
    </div>
  );
}
