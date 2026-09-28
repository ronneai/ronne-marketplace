import { loadConfig } from "../config";
import { localStorage } from "./local-storage";
import type { StorageAdapter } from "./storage-adapter";

export type { StorageAdapter } from "./storage-adapter";
export { StorageConflictError, StorageError, StorageKeyError } from "./storage-adapter";

let storage: StorageAdapter | undefined;

/** The instance's storage: local disk under STORAGE_PATH (setup writes it; ./data/storage by default). */
export const getStorage = (): StorageAdapter => {
  storage ??= localStorage(loadConfig().storagePath);
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
