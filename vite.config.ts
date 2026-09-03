import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    hmr: {
      clientPort: 5173,
    },
  },
  define: {
    "import.meta.env.REACT_APP_FIREBASE_API_KEY": JSON.stringify(process.env.VITE_FIREBASE_API_KEY),
    "import.meta.env.REACT_APP_FIREBASE_AUTH_DOMAIN": JSON.stringify(process.env.VITE_FIREBASE_AUTH_DOMAIN),
    "import.meta.env.REACT_APP_FIREBASE_PROJECT_ID": JSON.stringify(process.env.VITE_FIREBASE_PROJECT_ID),
    "import.meta.env.REACT_APP_FIREBASE_STORAGE_BUCKET": JSON.stringify(process.env.VITE_FIREBASE_STORAGE_BUCKET),
    "import.meta.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID": JSON.stringify(process.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    "import.meta.env.REACT_APP_FIREBASE_APP_ID": JSON.stringify(process.env.VITE_FIREBASE_APP_ID),
    "import.meta.env.REACT_APP_FIREBASE_MEASUREMENT_ID": JSON.stringify(process.env.VITE_FIREBASE_MEASUREMENT_ID),
  },
});
