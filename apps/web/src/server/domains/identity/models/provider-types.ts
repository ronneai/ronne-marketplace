import { UnknownProviderTypeError } from "../exceptions/errors";
import type { AuthProviderType } from "./auth-provider-type";

/** The provider types an instance knows, by id (feature 106). */
export type ProviderTypeRegistry = {
  all(): AuthProviderType[];
  /** The type, or UnknownProviderTypeError. */
  get(id: string): AuthProviderType;
};

export const providerTypeRegistry = (types: readonly AuthProviderType[]): ProviderTypeRegistry => {
  const byId = new Map(types.map((type) => [type.id, type]));
  return {
    all: () => [...byId.values()],
    get: (id) => {
      const type = byId.get(id);
      if (!type) throw new UnknownProviderTypeError(id);
      return type;
    },
  };
};
