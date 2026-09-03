/* Single place where Vervox reads configuration.
   ------------------------------------------------------------------
   Precedence:
     1. import.meta.env  → Vite / modern bundlers (VITE_* and REACT_APP_*)
     2. process.env      → CRA, Next, Webpack DefinePlugin inlines these at build
     3. window.__VERVOX_ENV__ → optional runtime injection (Vercel/Netlify
        snippets, Docker entrypoints) for deploys that substitute at serve time

   Nothing secret is ever hardcoded in client JS: Firebase and Flutterwave
   credentials come from .env / hosting-provider environment variables only.
   ------------------------------------------------------------------ */

const meta = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}) as Record<
  string,
  string | undefined
>;

const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

const injected = (globalThis as { __VERVOX_ENV__?: Record<string, string | undefined> }).__VERVOX_ENV__ ?? {};

/** Returns the first non-empty value for the given keys. */
export function getEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = meta[key] ?? proc[key] ?? injected[key];
    if (value && value.trim()) return value.trim();
  }
  return "";
}

/** Convenience: read both the REACT_APP_ and VITE_ spellings of a variable. */
export const envPair = (name: string): string => getEnv(`REACT_APP_${name}`, `VITE_${name}`);
