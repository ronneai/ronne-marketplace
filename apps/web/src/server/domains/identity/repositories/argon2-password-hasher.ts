import { hash, verify } from "@node-rs/argon2";
import type { PasswordHasher } from "../models/password-hasher";

/**
 * argon2id with OWASP's recommended minimum parameters (19 MiB memory, 2 iterations, 1 lane).
 * argon2id is the library's default algorithm; it's not passed explicitly because the library
 * declares it as a `const enum`, which isolatedModules can't reference. A test checks the prefix.
 */
const PARAMS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const argon2PasswordHasher: PasswordHasher = {
  hash: (password) => hash(password, PARAMS),
  verify: (passwordHash, password) => verify(passwordHash, password),
};
