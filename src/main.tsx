import React from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./lib/AuthContext";
import RoleRouter from "./RoleRouter";
import "./styles.css";
import "./stops.css";
import "./places.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <RoleRouter />
    </AuthProvider>
  </React.StrictMode>
);
