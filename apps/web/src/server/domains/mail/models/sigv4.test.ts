import { describe, expect, it } from "vitest";
import { amzDate, signV4 } from "./sigv4";

// AWS's published examples: the Signature Version 4 test suite's "get-vanilla" and
// "post-vanilla" (credentials AKIDEXAMPLE, region us-east-1, service "service", 2015-08-30
// 12:36:00 UTC), and the IAM ListUsers example from "Create a signed AWS API request".
const credentials = {
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
};
const at = new Date("2015-08-30T12:36:00Z");
const signature = (headers: Record<string, string>) =>
  /Signature=([0-9a-f]{64})$/.exec(headers.authorization ?? "")?.[1];

describe("signV4 (189)", () => {
  it("writes the date as SigV4 does", () => {
    expect(amzDate(at)).toBe("20150830T123600Z");
  });

  it("signs the test suite's get-vanilla request", () => {
    const signed = signV4(
      { method: "GET", url: "https://example.amazonaws.com/", headers: {}, body: "" },
      credentials,
      { region: "us-east-1", service: "service" },
      at,
    );
    expect(signed.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
    );
  });

  it("signs the test suite's post-vanilla request", () => {
    const signed = signV4(
      { method: "POST", url: "https://example.amazonaws.com/", headers: {}, body: "" },
      credentials,
      { region: "us-east-1", service: "service" },
      at,
    );
    expect(signature(signed)).toBe(
      "5da7c1a2acd57cee7505fc6676e4e544621c30862966e37dddb68e92efbe5d6b",
    );
  });

  it("signs the IAM ListUsers example, its query sorted", () => {
    const signed = signV4(
      {
        method: "GET",
        url: "https://iam.amazonaws.com/?Version=2010-05-08&Action=ListUsers",
        headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
        body: "",
      },
      credentials,
      { region: "us-east-1", service: "iam" },
      at,
    );
    expect(signature(signed)).toBe(
      "5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7",
    );
  });

  it("signs the test suite's get-header-value-trim request (values trimmed, inner spaces folded)", () => {
    const signed = signV4(
      {
        method: "GET",
        url: "https://example.amazonaws.com/",
        headers: { "My-Header1": " value1", "My-Header2": ' "a   b   c"' },
        body: "",
      },
      credentials,
      { region: "us-east-1", service: "service" },
      at,
    );
    expect(signature(signed)).toBe(
      "acc3ed3afb60bb290fc8d2dd0098b9911fcaa05412b367055dee359757a9c736",
    );
  });

  it("changes with the body, so a changed request doesn't keep its signature", () => {
    const request = (body: string) =>
      signV4(
        {
          method: "POST",
          url: "https://email.eu-west-1.amazonaws.com/v2/email/outbound-emails",
          headers: {},
          body,
        },
        credentials,
        { region: "eu-west-1", service: "ses" },
        at,
      );
    expect(signature(request("{}"))).not.toBe(signature(request("{ }")));
  });
});
