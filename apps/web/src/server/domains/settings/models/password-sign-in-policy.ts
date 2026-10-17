/**
 * Who may sign in with a password (feature 106), as root sets it:
 * - `everyone`: every account with a password (a new instance's default);
 * - `root_only`: root keeps its password; everyone else signs in with an identity provider.
 * It takes effect only while an identity provider is on: with none (turned off, or by
 * `rmk-server disable-sso`), everyone may use their password again. Root's password sign-in can't
 * be turned off by anyone, anywhere (106, lockout protection).
 */
export const PASSWORD_SIGN_IN_POLICIES = ["everyone", "root_only"] as const;
export type PasswordSignInPolicy = (typeof PASSWORD_SIGN_IN_POLICIES)[number];

export const DEFAULT_PASSWORD_SIGN_IN_POLICY: PasswordSignInPolicy = "everyone";

export const isPasswordSignInPolicy = (value: unknown): value is PasswordSignInPolicy =>
  typeof value === "string" && (PASSWORD_SIGN_IN_POLICIES as readonly string[]).includes(value);

/** The setting's key in `instance_settings`. */
export const PASSWORD_SIGN_IN_POLICY_KEY = "password_sign_in";
