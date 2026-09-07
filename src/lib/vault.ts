/**
 * Persistent silent hardware vault.
 * Anchors a persistent cryptographic UUID (`vervox_hardware_id`) and one-time immutable
 * username across browser storage (`sys_secure_vault`) and IndexedDB.
 */
import { metaGet, metaSet } from "./idb";
import { deviceUuid } from "./utils";

export const VAULT_STORAGE_KEY = "sys_secure_vault";

export interface SecureVaultData {
  vervox_hardware_id: string;
  username: string | null;
  username_locked: boolean;
  created_at: number;
  last_seen: number;
}

let memoryVault: SecureVaultData | null = null;

function readLocalStorageVault(): SecureVaultData | null {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.vervox_hardware_id === "string") {
      return parsed as SecureVaultData;
    }
  } catch {
    /* localStorage blocked or corrupted */
  }
  return null;
}

function writeLocalStorageVault(data: SecureVaultData): void {
  try {
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

/**
 * Resolves or initializes the permanent silent hardware ID and vault state.
 * Survives reloads, reinstall attempts, and storage clearing through dual-vault redundancy.
 */
export async function resolveSecureVault(): Promise<SecureVaultData> {
  if (memoryVault) return memoryVault;

  // 1. Check browser localStorage vault
  let localData = readLocalStorageVault();

  // 2. Check IndexedDB mirror
  let idbHardwareId: string | undefined;
  let idbUsername: string | undefined;
  let idbLocked: boolean | undefined;

  try {
    idbHardwareId = await metaGet<string>("vervox_hardware_id");
    idbUsername = await metaGet<string>("vervox_username");
    idbLocked = await metaGet<boolean>("vervox_username_locked");
  } catch {
    /* IndexedDB unavailable */
  }

  // 3. Reconcile storage sources
  const hardwareId = localData?.vervox_hardware_id || idbHardwareId || `hw_${deviceUuid()}`;
  const username = localData?.username || idbUsername || null;
  const username_locked = Boolean(localData?.username_locked || idbLocked || (username && username.trim().length > 0));

  const vault: SecureVaultData = {
    vervox_hardware_id: hardwareId,
    username,
    username_locked,
    created_at: localData?.created_at || Date.now(),
    last_seen: Date.now(),
  };

  // 4. Save to both tiers
  writeLocalStorageVault(vault);
  try {
    await metaSet("vervox_hardware_id", vault.vervox_hardware_id);
    if (vault.username) await metaSet("vervox_username", vault.username);
    await metaSet("vervox_username_locked", vault.username_locked);
  } catch {
    /* ignore */
  }

  memoryVault = vault;
  return vault;
}

/** Returns the permanent hardware ID silently. */
export async function resolveHardwareId(): Promise<string> {
  const vault = await resolveSecureVault();
  return vault.vervox_hardware_id;
}

/** Returns the immutable username if one has been set and locked. */
export async function getLockedUsername(): Promise<string | null> {
  const vault = await resolveSecureVault();
  return vault.username;
}

/** Irrevocably saves and locks the username to this device's hardware ID. */
export async function setLockedUsername(username: string): Promise<SecureVaultData> {
  const clean = username.trim().replace(/^@+/, "");
  if (!clean) throw new Error("Username cannot be empty");

  const vault = await resolveSecureVault();
  vault.username = clean;
  vault.username_locked = true;
  vault.last_seen = Date.now();

  writeLocalStorageVault(vault);
  try {
    await metaSet("vervox_username", clean);
    await metaSet("vervox_username_locked", true);
  } catch {
    /* ignore */
  }

  memoryVault = vault;
  return vault;
}
