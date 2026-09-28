/**
 * Upload limits (MVP §12). The defaults are exported; root will be able to change them in instance
 * settings later, so every check takes them as a parameter.
 */
export type PackageLimits = {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxPackedBytes: number;
};

export const DEFAULT_LIMITS: PackageLimits = {
  maxFiles: 500,
  maxFileBytes: 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
  maxPackedBytes: 5 * 1024 * 1024,
};

export const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(bytes % (1024 * 1024) ? 1 : 0)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
