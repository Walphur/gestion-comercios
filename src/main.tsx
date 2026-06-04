import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { AppearanceProvider } from "./context/AppearanceContext";
import { ConfirmProvider } from "./context/ConfirmContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <ConfirmProvider>
        <AppearanceProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </AppearanceProvider>
      </ConfirmProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
