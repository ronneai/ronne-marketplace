import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ProposalArtifactError } from "../domains/submissions/exceptions/errors";
import { MESSAGE_FOR_PEOPLE } from "./message-for-people";
import { errorFields } from "./redact";

it("writes a domain error's name and frames, never its message: it may name an item", () => {
  const error = new ProposalArtifactError("@team/secret-skill", "1.0.0");
  expect(error[MESSAGE_FOR_PEOPLE]).toBe(true);
  const fields = errorFields(error, true);
  expect(fields).toMatchObject({ name: "ProposalArtifactError", message: "[hidden]" });
  expect(String(fields.stack)).toMatch(/^ProposalArtifactError: \[hidden\]\n {4}at /);
  expect(JSON.stringify(fields)).not.toContain("secret-skill");
  // Any other error keeps its message.
  expect(errorFields(new Error("connect ECONNREFUSED"), false)).toMatchObject({
    message: "connect ECONNREFUSED",
  });
});

it("hides a message holding a frame-shaped line, with the rest of it", () => {
  const error = new ProposalArtifactError("a\n    at @team/secret-skill", "1.0.0");
  const fields = errorFields(error, true);
  expect(JSON.stringify(fields)).not.toContain("secret-skill");
  expect(String(fields.stack)).toMatch(/^ProposalArtifactError: \[hidden\]\n {4}at /);
});

it("names every error class explicitly: a production build's classes are anonymous", () => {
  // `new.target.name` is "" once the build minifies them, so each class says its own name.
  const files = [
    ...readdirSync(join(import.meta.dirname, "../domains")).map((domain) =>
      join(import.meta.dirname, "../domains", domain, "exceptions", "errors.ts"),
    ),
    join(import.meta.dirname, "../storage/storage-adapter.ts"),
  ].filter((file) => {
    try {
      return readFileSync(file, "utf8").length > 0;
    } catch {
      return false;
    }
  });
  let classes = 0;
  for (const file of files)
    for (const [, name, body] of readFileSync(file, "utf8").matchAll(
      /class (\w+) extends \w+ \{([\s\S]*?)\n\}/g,
    )) {
      classes++;
      expect(body, `${file}: ${name}`).toContain(`override readonly name: string = "${name}";`);
    }
  expect(classes).toBeGreaterThan(100);
});

it("marks every domain's base error class", () => {
  // A new domain's errors would otherwise write their messages, names and all.
  const domains = join(import.meta.dirname, "../domains");
  const files = readdirSync(domains)
    .map((domain) => join(domains, domain, "exceptions", "errors.ts"))
    .filter((file) => {
      try {
        return readFileSync(file, "utf8").includes("extends Error");
      } catch {
        return false;
      }
    });
  expect(files.length).toBeGreaterThanOrEqual(8);
  for (const file of files)
    for (const [, body] of readFileSync(file, "utf8").matchAll(
      /class \w+ extends Error \{([\s\S]*?)\n\}/g,
    ))
      expect(body, file).toContain("readonly [MESSAGE_FOR_PEOPLE] = true;");
});
