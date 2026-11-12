import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@octonote/interactive/styles.css";
import "@octonote/widgets/styles.css";
import "@octonote/motion/styles.css";
import "@octonote/compose/styles.css";
import "./styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
