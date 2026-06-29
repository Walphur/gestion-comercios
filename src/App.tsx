import type { ReactNode } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppConfigProvider, useAppConfig } from "./context/AppConfig";
import { LicenseProvider } from "./context/LicenseContext";
import LicenseGate from "./components/LicenseGate";
import LicenseRubroSync from "./components/LicenseRubroSync";
import UserNoticeHost from "./components/UserNoticeHost";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import POS from "./pages/POS";
import Sales from "./pages/Sales";
import Products from "./pages/Products";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import CashSession from "./pages/CashSession";
import AuditLog from "./pages/AuditLog";
import Stock from "./pages/Stock";
import Reports from "./pages/Reports";
import Invoicing from "./pages/Invoicing";
import Customers from "./pages/Customers";
import Employees from "./pages/Employees";
import Quotes from "./pages/Quotes";
import QuoteEditor from "./pages/QuoteEditor";
import Appointments from "./pages/Appointments";
import AppointmentEditor from "./pages/AppointmentEditor";
import DeliveryNotes from "./pages/DeliveryNotes";
import DeliveryNoteEditor from "./pages/DeliveryNoteEditor";
import ServiceOrders from "./pages/ServiceOrders";
import ServiceOrderEditor from "./pages/ServiceOrderEditor";
import type { ProModuleKey } from "./config/modules";
import type { FeatureFlags } from "./types";

/** Solo renderiza la ruta si la función está habilitada en el rubro/overrides. */
function Gated({ feature, children }: { feature: keyof FeatureFlags; children: ReactNode }) {
  const { features } = useAppConfig();
  return features[feature] ? <>{children}</> : <Navigate to="/" replace />;
}

function ProGated({ module, children }: { module: ProModuleKey; children: ReactNode }) {
  const { isProModuleActive } = useAppConfig();
  return isProModuleActive(module) ? <>{children}</> : <Navigate to="/" replace />;
}

function Shell() {
  const { loading } = useAppConfig();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-ink-muted">Cargando...</div>
    );
  }
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="sesion" element={<Navigate to="/empleados" replace />} />
          <Route path="pos" element={<Gated feature="pos"><POS /></Gated>} />
          <Route path="ventas" element={<Gated feature="pos"><Sales /></Gated>} />
          <Route path="productos" element={<Gated feature="products"><Products /></Gated>} />
          <Route path="stock" element={<Gated feature="stock"><Stock /></Gated>} />
          <Route path="clientes" element={<Gated feature="customers"><Customers /></Gated>} />
          <Route path="reportes" element={<Gated feature="reports"><Reports /></Gated>} />
          <Route path="facturacion" element={<Gated feature="invoicing"><Invoicing /></Gated>} />
          <Route path="caja" element={<CashSession />} />
          <Route path="empleados" element={<Employees />} />
          <Route path="auditoria" element={<AuditLog />} />
          <Route path="admin" element={<Admin />} />
          <Route
            path="presupuestos"
            element={
              <ProGated module="quotes">
                <Quotes />
              </ProGated>
            }
          />
          <Route
            path="presupuestos/nuevo"
            element={
              <ProGated module="quotes">
                <QuoteEditor />
              </ProGated>
            }
          />
          <Route
            path="presupuestos/:id"
            element={
              <ProGated module="quotes">
                <QuoteEditor />
              </ProGated>
            }
          />
          <Route
            path="turnos"
            element={
              <ProGated module="appointments">
                <Appointments />
              </ProGated>
            }
          />
          <Route
            path="turnos/nuevo"
            element={
              <ProGated module="appointments">
                <AppointmentEditor />
              </ProGated>
            }
          />
          <Route
            path="turnos/:id"
            element={
              <ProGated module="appointments">
                <AppointmentEditor />
              </ProGated>
            }
          />
          <Route
            path="remitos"
            element={
              <ProGated module="delivery_notes">
                <DeliveryNotes />
              </ProGated>
            }
          />
          <Route
            path="remitos/nuevo"
            element={
              <ProGated module="delivery_notes">
                <DeliveryNoteEditor />
              </ProGated>
            }
          />
          <Route
            path="remitos/:id"
            element={
              <ProGated module="delivery_notes">
                <DeliveryNoteEditor />
              </ProGated>
            }
          />
          <Route
            path="ordenes"
            element={
              <ProGated module="service_orders">
                <ServiceOrders />
              </ProGated>
            }
          />
          <Route
            path="ordenes/nuevo"
            element={
              <ProGated module="service_orders">
                <ServiceOrderEditor />
              </ProGated>
            }
          />
          <Route
            path="ordenes/:id"
            element={
              <ProGated module="service_orders">
                <ServiceOrderEditor />
              </ProGated>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default function App() {
  return (
    <LicenseProvider>
      <LicenseGate>
        <UserNoticeHost />
        <AppConfigProvider>
          <LicenseRubroSync />
          <Shell />
        </AppConfigProvider>
      </LicenseGate>
    </LicenseProvider>
  );
}
