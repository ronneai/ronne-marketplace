import type { Db } from "../../../db/create-db";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import type { DatabaseDialect } from "../../../db/url";
import { erasedEmail, erasedName } from "../models/user";

/**
 * An account as erasing leaves it (103), written straight into the table: the pseudonym for the
 * email and the name, disabled and erased at `at`, no password row. For tests of what refuses an
 * erased account. `email`, `role` and `disabled: false` seed a row no erasure would leave (an
 * erased row with a real email, one that still says root, one not disabled), to check the flag
 * alone is enough.
 */
export const seedErasedUser = async (
  t: { db: Db; dialect: DatabaseDialect },
  options: { at?: Date; email?: string; role?: "root" | "user"; disabled?: boolean } = {},
): Promise<{ id: string; email: string; name: string }> => {
  const id = newId();
  const at = toDbDate(options.at ?? new Date(), t.dialect);
  const email = options.email ?? erasedEmail(id);
  const name = erasedName(id);
  await t.db
    .insertInto("user")
    .values({
      id,
      name,
      email,
      email_verified: 0,
      image: null,
      created_at: at,
      updated_at: at,
      role: options.role ?? "user",
      disabled_at: options.disabled === false ? null : at,
      erased_at: at,
    })
    .execute();
  return { id, email, name };
};
