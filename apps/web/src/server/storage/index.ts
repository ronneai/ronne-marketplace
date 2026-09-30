import { loadConfig } from "../config";
import { localStorage } from "./local-storage";
import type { StorageAdapter } from "./storage-adapter";

export type { StorageAdapter } from "./storage-adapter";
export { StorageConflictError, StorageError, StorageKeyError } from "./storage-adapter";

// One adapter per path, kept on globalThis like the database pools: the settings are read per
// request (setup can change them without a restart, feature 036), and hot reloads keep the map.
const adapters = globalThis as typeof globalThis & { __ronneStorage?: Map<string, StorageAdapter> };

/** The instance's storage: local disk under STORAGE_PATH (setup writes it; ./data/storage by default). */
export const getStorage = (): StorageAdapter => {
  const path = loadConfig().storagePath;
  adapters.__ronneStorage ??= new Map();
  let storage = adapters.__ronneStorage.get(path);
  if (!storage) {
    storage = localStorage(path);
    adapters.__ronneStorage.set(path, storage);
  }
  return storage;
};

/**
 * The instance's storage, found on first use: for entry points whose callers only sometimes read
 * artifacts (a change proposal's checks, 017), so the rest never load the configuration.
 */
export const instanceStorage: StorageAdapter = {
  put: (key, bytes) => getStorage().put(key, bytes),
  get: (key) => getStorage().get(key),
  exists: (key) => getStorage().exists(key),
  size: (key) => getStorage().size(key),
};
