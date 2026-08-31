import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import StartupLoader from "../app/StartupLoader";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StartupLoader />
  </StrictMode>,
);
