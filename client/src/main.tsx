import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Maintain backward compatibility for users with legacy hash URLs
// e.g., /#/explore/UGA/Maize -> /explore/UGA/Maize
if (window.location.hash && window.location.hash.startsWith("#/")) {
  const newPath = window.location.hash.slice(1);
  window.history.replaceState(null, "", newPath);
}

createRoot(document.getElementById("root")!).render(<App />);
