import { providerTypeRegistry } from "../models/provider-types";
import { oidcProviderType } from "./oidc-provider-type";

/** The provider types this instance knows (feature 106): OpenID Connect today; SAML or LDAP later. */
export const PROVIDER_TYPES = providerTypeRegistry([oidcProviderType]);
