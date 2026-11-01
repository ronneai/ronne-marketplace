import { describe, expect, it } from "vitest";
import { announceSetup, setupCodeIn, setupCodeLines, setupLink } from "./setup-code.js";

const reader = (files: Record<string, string>) => (path: string) => files[path];

describe("the setup code on a terminal (161)", () => {
  it("reads the data folder's code, in groups of five", () => {
    expect(
      setupCodeIn("/data", reader({ "/data/setup-code": "1kq2mabcdefghjkmnpqrstvwx0\n" })),
    ).toBe("1KQ2M-ABCDE-FGHJK-MNPQR-STVWX-0");
  });

  it("is null without a file or with one that holds no code", () => {
    expect(setupCodeIn("/data", reader({}))).toBeNull();
    expect(setupCodeIn("/data", reader({ "/data/setup-code": "" }))).toBeNull();
    expect(setupCodeIn("/data", reader({ "/data/setup-code": "hello" }))).toBeNull();
    expect(setupCodeIn("/data", reader({ "/data/setup-code": "U".repeat(26) }))).toBeNull();
  });

  it("rmk-server start prints the code once ready, and opens the page with it filled in", () => {
    const written: string[] = [];
    const opened: string[] = [];
    const effects = {
      read: reader({ "/data/setup-code": "1KQ2MABCDEFGHJKMNPQRSTVWX0\n" }),
      write: (text: string) => written.push(text),
      openBrowser: (url: string) => opened.push(url),
    };
    announceSetup({ url: "http://localhost:7650", dataDir: "/data", open: true }, effects);
    expect(written.join("")).toContain("Setup code: 1KQ2M-ABCDE-FGHJK-MNPQR-STVWX-0");
    expect(opened).toEqual(["http://localhost:7650/setup#code=1KQ2M-ABCDE-FGHJK-MNPQR-STVWX-0"]);
    // --no-open: printed, nothing opened.
    announceSetup({ url: "http://localhost:7650", dataDir: "/data", open: false }, effects);
    expect(written).toHaveLength(2);
    expect(opened).toHaveLength(1);
  });

  it("rmk-server start without a code opens the address and prints nothing", () => {
    const written: string[] = [];
    const opened: string[] = [];
    announceSetup(
      { url: "http://localhost:7650", dataDir: "/data", open: true },
      {
        read: reader({}),
        write: (text) => written.push(text),
        openBrowser: (url) => opened.push(url),
      },
    );
    expect(written).toEqual([]);
    expect(opened).toEqual(["http://localhost:7650"]);
  });

  it("says where to enter it, and links to the page with the code in the fragment", () => {
    expect(setupCodeLines("http://localhost:7650/", "1KQ2M-X")).toBe(
      "Setup code: 1KQ2M-X\nOpen http://localhost:7650/setup and enter it. Only you have it: it's in the server's log too, and rmk-server setup-code prints it again.\n",
    );
    expect(setupLink("http://localhost:7650", "1KQ2M-X")).toBe(
      "http://localhost:7650/setup#code=1KQ2M-X",
    );
  });
});
