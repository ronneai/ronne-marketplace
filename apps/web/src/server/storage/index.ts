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
