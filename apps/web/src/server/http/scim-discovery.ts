import { SCIM_SCHEMAS } from "./scim-format";

/**
 * SCIM's discovery documents (RFC 7643 §5-7, feature 108): what Ronne supports, for identity
 * providers that read them. Public, as RFC 7644 §4 allows. `base` is `<PUBLIC_URL>/api/v1/scim/v2`.
 */

/** The most results one list returns, whatever `count` asks for. */
export const SCIM_MAX_RESULTS = 100;

export const serviceProviderConfig = (base: string) => ({
  schemas: [SCIM_SCHEMAS.serviceProviderConfig],
  patch: { supported: true },
  bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
  // Only `eq` on `userName`, `externalId` (Users) and `displayName` (Groups).
  filter: { supported: true, maxResults: SCIM_MAX_RESULTS },
  changePassword: { supported: false },
  sort: { supported: false },
  etag: { supported: false },
  authenticationSchemes: [
    {
      type: "oauthbearertoken",
      name: "OAuth Bearer Token",
      description:
        "The SCIM token made for this identity provider in Ronne (Admin › Settings › Authentication).",
      primary: true,
    },
  ],
  meta: { resourceType: "ServiceProviderConfig", location: `${base}/ServiceProviderConfig` },
});

type Attribute = {
  name: string;
  type: "string" | "boolean" | "complex" | "reference";
  multiValued: boolean;
  required: boolean;
  mutability: "readOnly" | "readWrite" | "immutable" | "writeOnly";
  returned: "always" | "default" | "never";
  uniqueness: "none" | "server";
  caseExact: boolean;
  description: string;
  subAttributes?: Attribute[];
  referenceTypes?: string[];
};

const attribute = (
  name: string,
  description: string,
  fields: Partial<Omit<Attribute, "name" | "description">> = {},
): Attribute => ({
  name,
  type: "string",
  multiValued: false,
  required: false,
  mutability: "readWrite",
  returned: "default",
  uniqueness: "none",
  caseExact: false,
  description,
  ...fields,
});

const USER_ATTRIBUTES: Attribute[] = [
  attribute("userName", "The person's email, lowercased: their Ronne email.", {
    required: true,
    uniqueness: "server",
  }),
  attribute("name", "The person's name.", {
    type: "complex",
    subAttributes: [
      attribute("formatted", "The full name."),
      attribute("givenName", "The given name."),
      attribute("familyName", "The family name."),
    ],
  }),
  attribute("displayName", "The name Ronne shows."),
  attribute("emails", "Email addresses; the primary one is the Ronne email.", {
    type: "complex",
    multiValued: true,
    subAttributes: [
      attribute("value", "The address."),
      attribute("type", "work, home or other."),
      attribute("primary", "Whether it's the primary address.", { type: "boolean" }),
    ],
  }),
  attribute("active", "False disables the account in Ronne.", { type: "boolean" }),
  attribute("groups", "The groups the person is in, changed through Groups.", {
    type: "complex",
    multiValued: true,
    mutability: "readOnly",
    subAttributes: [
      attribute("value", "The group's id.", { mutability: "readOnly" }),
      attribute("display", "The group's name.", { mutability: "readOnly" }),
    ],
  }),
];

const GROUP_ATTRIBUTES: Attribute[] = [
  attribute("displayName", "The group's name, matched by the provider's group mappings.", {
    required: true,
    caseExact: true,
  }),
  attribute("members", "The users in the group, by their SCIM id.", {
    type: "complex",
    multiValued: true,
    subAttributes: [
      attribute("value", "The user's SCIM id.", { mutability: "immutable" }),
      attribute("display", "The user's name.", { mutability: "readOnly" }),
    ],
  }),
];

const schema = (base: string, id: string, name: string, attributes: Attribute[]) => ({
  schemas: [SCIM_SCHEMAS.schema],
  id,
  name,
  description: `${name} as Ronne provisions it.`,
  attributes,
  meta: { resourceType: "Schema", location: `${base}/Schemas/${id}` },
});

export const schemaDocuments = (base: string) => [
  schema(base, SCIM_SCHEMAS.user, "User", USER_ATTRIBUTES),
  schema(base, SCIM_SCHEMAS.group, "Group", GROUP_ATTRIBUTES),
];

export const resourceTypeDocuments = (base: string) => [
  {
    schemas: [SCIM_SCHEMAS.resourceType],
    id: "User",
    name: "User",
    endpoint: "/Users",
    description: "A Ronne account",
    schema: SCIM_SCHEMAS.user,
    meta: { resourceType: "ResourceType", location: `${base}/ResourceTypes/User` },
  },
  {
    schemas: [SCIM_SCHEMAS.resourceType],
    id: "Group",
    name: "Group",
    endpoint: "/Groups",
    description: "A group whose mappings give workspace roles",
    schema: SCIM_SCHEMAS.group,
    meta: { resourceType: "ResourceType", location: `${base}/ResourceTypes/Group` },
  },
];

/** A list of resources (RFC 7644 §3.4.2): one page of `total`, or all of them when no page is given. */
export const listResponse = (
  resources: unknown[],
  page: { total: number; startIndex: number } = { total: resources.length, startIndex: 1 },
) => ({
  schemas: [SCIM_SCHEMAS.listResponse],
  totalResults: page.total,
  startIndex: page.startIndex,
  itemsPerPage: resources.length,
  Resources: resources,
});
