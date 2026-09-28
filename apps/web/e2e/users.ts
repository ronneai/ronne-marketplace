/**
 * One user per test, so the per-email sign-in limit (5 a minute) never trips across tests. The
 * password is a test value for this throwaway instance only.
 */
export const E2E_PASSWORD = "e2e correct horse battery";

export const E2E_USERS = {
  root: "root@e2e.test",
  wrongPassword: "wrong-password@e2e.test",
  remember: "remember@e2e.test",
  signOut: "sign-out@e2e.test",
  changePassword: "change-password@e2e.test",
  notRoot: "not-root@e2e.test",
  tokens: "tokens@e2e.test",
  submitter: "submitter@e2e.test",
} as const;

/** The display names, which the header shows (not the email). */
export const E2E_NAMES: Record<keyof typeof E2E_USERS, string> = {
  root: "Root",
  wrongPassword: "Wrong Password",
  remember: "Remember Me",
  signOut: "Sign Out Tester",
  changePassword: "Change Password Tester",
  notRoot: "Not Root",
  tokens: "Token Tester",
  submitter: "Submitter",
};

/**
 * A scope the seed creates, for tests that need one without signing in as root: root already
 * signs in 5 times in a run, the per-email limit a minute.
 */
export const E2E_SCOPE = "e2e-seeded";
