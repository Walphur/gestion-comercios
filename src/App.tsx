import type { ReactNode } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppConfigProvider, useAppConfig } from "./context/AppConfig";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import POS from "./pages/POS";
import Sales from "./pages/Sales";
import Products from "./pages/Products";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import CashSession from "./pages/CashSession";
import AuditLog from "./pages/AuditLog";
import ComingSoon from "./pages/ComingSoon";
import { useAuth } from "./context/AuthContext";
import type { FeatureFlags } from "./types";

/** Solo renderiza la ruta si la función está habilitada en el rubro/overrides. */
function Gated({ feature, children }: { feature: keyof FeatureFlags; children: ReactNode }) {
  const { features } = useAppConfig();
  return features[feature] ? <>{children}</> : <Navigate to="/" replace />;
}

function AdminGated() {
  const { can } = useAuth();
  return can("manage_admin") ? <Admin /> : <Navigate to="/" replace />;
}

function Shell() {
  const { loading } = useAppConfig();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">Cargando...</div>
    );
  }
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="pos" element={<Gated feature="pos"><POS /></Gated>} />
          <Route path="ventas" element={<Gated feature="pos"><Sales /></Gated>} />
          <Route path="productos" element={<Gated feature="products"><Products /></Gated>} />
          <Route path="stock" element={<Gated feature="stock"><ComingSoon title="Stock" etapa="Etapa 4" /></Gated>} />
          <Route path="clientes" element={<Gated feature="customers"><ComingSoon title="Clientes" etapa="Etapa 4" /></Gated>} />
          <Route path="reportes" element={<Gated feature="reports"><ComingSoon title="Reportes" etapa="Etapa 6" /></Gated>} />
          <Route path="facturacion" element={<Gated feature="invoicing"><ComingSoon title="Facturación (ARCA)" etapa="Etapa 7" /></Gated>} />
          <Route path="caja" element={<CashSession />} />
          <Route path="auditoria" element={<AuditLog />} />
          <Route path="admin" element={<AdminGated />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default function App() {
  return (
    <AppConfigProvider>
      <Shell />
    </AppConfigProvider>
  );
}
