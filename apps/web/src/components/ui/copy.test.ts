import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./copy";

// Feature 067: copy works on an insecure page (no clipboard API), and says so when it can't.
const fakeDocument = (execCommand: () => boolean) => {
  const area = {
    value: "",
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    select: vi.fn(),
    setSelectionRange: vi.fn(),
    remove: vi.fn(),
  };
  return {
    area,
    document: {
      createElement: () => area,
      body: { append: vi.fn() },
      activeElement: null,
      execCommand: vi.fn(execCommand),
    },
  };
};

afterEach(() => vi.unstubAllGlobals());

describe("copyText", () => {
  it("uses the clipboard API when there is one", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("document", fakeDocument(() => true).document);
    expect(await copyText("rmk login")).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("rmk login");
  });

  it("falls back to the copy command on an insecure page (no clipboard API)", async () => {
    vi.stubGlobal("navigator", {});
    const { document, area } = fakeDocument(() => true);
    vi.stubGlobal("document", document);
    expect(await copyText("rmk login")).toBe("copied");
    expect(area.value).toBe("rmk login");
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(area.remove).toHaveBeenCalled();
  });

  it("falls back too when the clipboard API refuses", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: async () => {
          throw new Error("NotAllowedError");
        },
      },
    });
    vi.stubGlobal("document", fakeDocument(() => true).document);
    expect(await copyText("x")).toBe("copied");
  });

  it("says when nothing worked, so the caller selects the text instead", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", fakeDocument(() => false).document);
    expect(await copyText("x")).toBe("manual");
  });
});
