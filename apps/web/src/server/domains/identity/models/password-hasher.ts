/** Hashes and verifies passwords. The identity domain depends on this, not on a library. */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}
