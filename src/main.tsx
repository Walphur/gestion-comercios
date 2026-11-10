import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { AppearanceProvider } from "./context/AppearanceContext";
import { ConfirmProvider } from "./context/ConfirmContext";
import "./index.css";
import "./e2eBridge";

const WebSessionGate = lazy(() => import("./web/WebSessionGate"));

const app = (
  <ThemeProvider>
    <ConfirmProvider>
      <AppearanceProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </AppearanceProvider>
    </ConfirmProvider>
  </ThemeProvider>
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {import.meta.env.MODE === "web" ? (
      <Suspense fallback={null}>
        <WebSessionGate>{app}</WebSessionGate>
      </Suspense>
    ) : (
      app
    )}
  </React.StrictMode>,
);
