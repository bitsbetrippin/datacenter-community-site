import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { HouseholdProvider } from "./context/HouseholdContext";
import "./index.css";
import "./themes.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <HouseholdProvider>
          <App />
        </HouseholdProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
