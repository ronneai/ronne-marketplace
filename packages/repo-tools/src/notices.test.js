import { describe, expect, it } from "vitest";
import { LICENSE_FILE, MIT_TEXT, noticeEntries, RULE, renderNotices, section } from "./notices.js";

describe("THIRD_PARTY_NOTICES (084)", () => {
  it("takes one entry per name@version from pnpm's licence list, with each version's folder", () => {
    const byLicense = {
      MIT: [
        { name: "zod", versions: ["4.6.5"], paths: ["/store/zod"] },
        { name: "@better-auth/utils", versions: ["0.4.2", "0.5.0"], paths: ["/a", "/b"] },
      ],
      "Apache-2.0": [{ name: "@swc/helpers", versions: ["0.5.23"], paths: ["/swc"] }],
      ISC: [{ name: "zod", versions: ["4.6.5"], paths: ["/store/zod"] }],
    };
    const read = (folder) => `text of ${folder}`;
    expect(noticeEntries(byLicense, read)).toEqual([
      { name: "@better-auth/utils", version: "0.4.2", license: "MIT", text: "text of /a" },
      { name: "@better-auth/utils", version: "0.5.0", license: "MIT", text: "text of /b" },
      { name: "@swc/helpers", version: "0.5.23", license: "Apache-2.0", text: "text of /swc" },
      { name: "zod", version: "4.6.5", license: "MIT", text: "text of /store/zod" },
    ]);
  });

  it("gives MIT's text when an MIT package ships no licence file, and says so for others", () => {
    expect(section({ name: "pgpass", version: "1.0.5", license: "MIT", text: "" })).toContain(
      MIT_TEXT,
    );
    expect(section({ name: "x", version: "1.0.0", license: "0BSD", text: "" })).toBe(
      "x 1.0.0 (0BSD)\n\n(No licence file in the package; its package.json says 0BSD.)",
    );
  });

  it("separates the packages, each under a name, version and licence heading", () => {
    const text = renderNotices("Title", [
      { name: "a", version: "1.0.0", license: "MIT", text: "A" },
      { name: "b", version: "2.0.0", license: "ISC", text: "B" },
    ]);
    expect(text).toBe(`Title\n\na 1.0.0 (MIT)\n\nA\n\n${RULE}\n\nb 2.0.0 (ISC)\n\nB\n`);
  });

  it("reads licence files, never source files", () => {
    for (const name of [
      "LICENSE",
      "LICENCE.md",
      "license.txt",
      "COPYING",
      "NOTICE",
      "LICENSE-MIT",
      "LICENSE-APACHE.txt",
    ])
      expect(LICENSE_FILE.test(name), name).toBe(true);
    for (const name of ["license.js", "LICENSE.ts", "licenses.json", "notice.d.ts"])
      expect(LICENSE_FILE.test(name), name).toBe(false);
  });
});
