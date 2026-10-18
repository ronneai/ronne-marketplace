import { describe, expect, it } from "vitest";
import {
  parseActive,
  parseScimUser,
  parseUserFilter,
  parseUserName,
  parseUserPatch,
  ronneName,
  SCIM_PATCH_SCHEMA,
  SCIM_USER_SCHEMA,
  ScimRequestError,
  scimUserResource,
} from "./scim-user";

const ENTERPRISE = "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User";

const refused = (work: () => unknown) => {
  try {
    work();
  } catch (error) {
    if (error instanceof ScimRequestError) return { status: error.status, type: error.scimType };
    throw error;
  }
  return null;
};

describe("userName, the email", () => {
  it("trims ASCII spaces, lowercases, and validates as sign-in does", () => {
    expect(parseUserName("  Ann@Example.COM\r\n")).toBe("ann@example.com");
    expect(refused(() => parseUserName("ann"))).toEqual({ status: 400, type: "invalidValue" });
    expect(refused(() => parseUserName("ann@x.invalid"))).toEqual({
      status: 400,
      type: "invalidValue",
    });
    expect(refused(() => parseUserName(42))).toEqual({ status: 400, type: "invalidValue" });
  });

  it("refuses anything that isn't plain ASCII, before lowercasing could fold it", () => {
    // The Kelvin sign lowercases to `k`.
    expect(refused(() => parseUserName("Kate@example.com"))).toEqual({
      status: 400,
      type: "invalidValue",
    });
    expect(refused(() => parseUserName("kåte@example.com"))).toEqual({
      status: 400,
      type: "invalidValue",
    });
    // A no-break space isn't an ASCII space, so it isn't trimmed: not plain ASCII.
    expect(refused(() => parseUserName(" ann@example.com"))).toEqual({
      status: 400,
      type: "invalidValue",
    });
    expect(refused(() => parseUserName("an n@example.com"))).toEqual({
      status: 400,
      type: "invalidValue",
    });
  });
});

describe("a create or replace body", () => {
  it("reads what Entra sends: capitals, the enterprise extension, roles, string booleans", () => {
    const user = parseScimUser({
      schemas: [SCIM_USER_SCHEMA, ENTERPRISE],
      externalId: "0a21f0f2-8d2a-4f8e-bf98-7363c4aed4ef",
      userName: "Ann@Example.com",
      active: "True",
      emails: [{ primary: true, type: "work", value: "Ann@Example.com" }],
      meta: { resourceType: "User" },
      name: { formatted: "Ann Lee", familyName: "Lee", givenName: "Ann" },
      roles: [],
      [ENTERPRISE]: { department: "Eng" },
    });
    expect(user).toEqual({
      userName: "ann@example.com",
      externalId: "0a21f0f2-8d2a-4f8e-bf98-7363c4aed4ef",
      active: true,
      givenName: "Ann",
      familyName: "Lee",
      displayName: "Ann Lee",
    });
    expect(ronneName(user)).toBe("Ann Lee");
  });

  it("reads what Okta sends, and ignores the password and groups", () => {
    const user = parseScimUser({
      schemas: [SCIM_USER_SCHEMA],
      userName: "bob@example.com",
      name: { givenName: "Bob", familyName: "Ng" },
      emails: [{ primary: true, value: "bob@example.com", type: "work" }],
      displayName: "Bob Ng",
      locale: "en-US",
      externalId: "00u1abcd",
      groups: [],
      password: "ignored-Secret1",
      active: true,
    });
    expect(user).toMatchObject({ userName: "bob@example.com", displayName: "Bob Ng" });
  });

  it("defaults active to true, takes active: false, and needs a userName", () => {
    expect(parseScimUser({ userName: "a@b.co" }).active).toBe(true);
    expect(parseScimUser({ userName: "a@b.co", active: false }).active).toBe(false);
    expect(parseScimUser({ userName: "a@b.co", active: "false" }).active).toBe(false);
    expect(refused(() => parseScimUser({ userName: "a@b.co", active: "maybe" }))).toEqual({
      status: 400,
      type: "invalidValue",
    });
    expect(refused(() => parseScimUser({ externalId: "x" }))).toEqual({
      status: 400,
      type: "invalidValue",
    });
    expect(refused(() => parseScimUser([]))).toEqual({ status: 400, type: "invalidSyntax" });
  });

  it("names the account from the display name, the given and family names, or the email", () => {
    expect(ronneName(parseScimUser({ userName: "a@b.co", name: { givenName: "Ann" } }))).toBe(
      "Ann",
    );
    expect(ronneName(parseScimUser({ userName: "a@b.co" }))).toBe("a@b.co");
    expect(
      parseScimUser({ userName: "a@b.co", name: { formatted: "Formatted" } }).displayName,
    ).toBe("Formatted");
  });

  it("cuts a name to the column and refuses a long external id", () => {
    const long = "x".repeat(150);
    expect(parseScimUser({ userName: "a@b.co", displayName: long }).displayName).toHaveLength(100);
    expect(
      refused(() => parseScimUser({ userName: "a@b.co", externalId: "x".repeat(256) })),
    ).toEqual({
      status: 400,
      type: "invalidValue",
    });
    expect(parseScimUser({ userName: "a@b.co", externalId: "  " }).externalId).toBeNull();
  });

  it("parses active's strings as Entra sends them", () => {
    expect(parseActive("False")).toBe(false);
    expect(parseActive(" TRUE ")).toBe(true);
    expect(refused(() => parseActive(1))).toEqual({ status: 400, type: "invalidValue" });
  });
});

describe("a PATCH body", () => {
  it("reads Entra's path form, with capitalised ops and string booleans", () => {
    expect(
      parseUserPatch({
        schemas: [SCIM_PATCH_SCHEMA],
        Operations: [
          { op: "Replace", path: "active", value: "False" },
          { op: "Replace", path: "name.givenName", value: "Annie" },
          { op: "Add", path: "displayName", value: "Annie Lee" },
          { op: "Replace", path: 'emails[type eq "work"].value', value: "Annie@Example.com" },
          { op: "Replace", path: `${SCIM_USER_SCHEMA}:externalId`, value: "new-id" },
        ],
      }),
    ).toEqual({
      active: false,
      givenName: "Annie",
      displayName: "Annie Lee",
      userName: "annie@example.com",
      externalId: "new-id",
    });
  });

  it("reads Okta's value-object form", () => {
    expect(
      parseUserPatch({
        schemas: [SCIM_PATCH_SCHEMA],
        Operations: [
          {
            op: "replace",
            value: {
              active: false,
              userName: "Bob@Example.com",
              name: { givenName: "Robert", familyName: "Ng" },
              emails: [{ value: "Bob@Example.com", primary: true }],
              id: "ignored",
              groups: [],
            },
          },
        ],
      }),
    ).toEqual({
      active: false,
      userName: "bob@example.com",
      givenName: "Robert",
      familyName: "Ng",
    });
  });

  it("removes what can be removed, and refuses removing what can't", () => {
    expect(
      parseUserPatch({
        Operations: [
          { op: "remove", path: "name.familyName" },
          { op: "remove", path: "externalId" },
        ],
      }),
    ).toEqual({ familyName: null, externalId: null });
    expect(
      refused(() => parseUserPatch({ Operations: [{ op: "remove", path: "active" }] })),
    ).toEqual({ status: 400, type: "mutability" });
    expect(
      refused(() => parseUserPatch({ Operations: [{ op: "remove", path: "userName" }] })),
    ).toEqual({ status: 400, type: "mutability" });
    expect(refused(() => parseUserPatch({ Operations: [{ op: "remove" }] }))).toEqual({
      status: 400,
      type: "noTarget",
    });
  });

  it("ignores read-only and unknown paths, and refuses bad shapes", () => {
    expect(
      parseUserPatch({
        Operations: [
          { op: "replace", path: "groups", value: [{ value: "g" }] },
          { op: "replace", path: "password", value: "x" },
          { op: "replace", path: "urn:unknown:thing", value: 1 },
        ],
      }),
    ).toEqual({});
    expect(refused(() => parseUserPatch({ Operations: [] }))).toEqual({
      status: 400,
      type: "invalidSyntax",
    });
    expect(refused(() => parseUserPatch({ Operations: [{ op: "move", path: "a" }] }))).toEqual({
      status: 400,
      type: "invalidValue",
    });
    expect(
      refused(() =>
        parseUserPatch({ Operations: [{ op: "replace", path: "userName", value: "nope" }] }),
      ),
    ).toEqual({ status: 400, type: "invalidValue" });
  });
});

describe("a filter", () => {
  it("takes eq on userName, externalId and id, the attribute in any case", () => {
    expect(parseUserFilter('userName eq "Ann@Example.com"')).toEqual({
      attribute: "userName",
      value: "ann@example.com",
    });
    expect(parseUserFilter(' USERNAME EQ "ann@example.com" ')).toEqual({
      attribute: "userName",
      value: "ann@example.com",
    });
    expect(parseUserFilter('externalId eq "ab\\"c"')).toEqual({
      attribute: "externalId",
      value: 'ab"c',
    });
    expect(parseUserFilter('id eq "01J"')).toEqual({ attribute: "id", value: "01J" });
  });

  it("refuses other operators and attributes, and matches nothing for a non-ASCII userName", () => {
    expect(refused(() => parseUserFilter('userName co "ann"'))).toEqual({
      status: 400,
      type: "invalidFilter",
    });
    expect(refused(() => parseUserFilter('displayName eq "Ann"'))).toEqual({
      status: 400,
      type: "invalidFilter",
    });
    expect(refused(() => parseUserFilter('userName eq "a" and id eq "b"'))).toEqual({
      status: 400,
      type: "invalidFilter",
    });
    expect(parseUserFilter('userName eq "Kate@example.com"')).toEqual({
      attribute: "userName",
      value: null,
    });
  });
});

describe("the resource", () => {
  it("shows the link with its account's name, emails, groups and meta", () => {
    const resource = scimUserResource(
      {
        id: "01LINK",
        providerId: "acme",
        userId: "01USER",
        externalId: "E-1",
        userName: "ann@example.com",
        givenName: "Ann",
        familyName: null,
        displayName: null,
        active: true,
        createdAt: new Date("2026-10-18T12:00:00.000Z"),
        updatedAt: new Date("2026-10-18T12:05:00.000Z"),
      },
      { name: "Ann Lee" },
      "https://r.example/api/v1/scim/v2",
      [{ id: "01G", displayName: "Engineers" }],
    );
    expect(resource).toEqual({
      schemas: [SCIM_USER_SCHEMA],
      id: "01LINK",
      externalId: "E-1",
      userName: "ann@example.com",
      name: { formatted: "Ann Lee", givenName: "Ann" },
      displayName: "Ann Lee",
      emails: [{ value: "ann@example.com", primary: true, type: "work" }],
      active: true,
      groups: [{ value: "01G", display: "Engineers" }],
      meta: {
        resourceType: "User",
        created: "2026-10-18T12:00:00.000Z",
        lastModified: "2026-10-18T12:05:00.000Z",
        location: "https://r.example/api/v1/scim/v2/Users/01LINK",
      },
    });
    expect(JSON.stringify(resource)).not.toContain("01USER");
  });
});
