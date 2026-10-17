import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { qrModules, qrSvg } from "./qr";

const URI =
  "otpauth://totp/Ronne%20AI%20Marketplace:someone%40example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Ronne%20AI%20Marketplace&algorithm=SHA1&digits=6&period=30";

/** Reads the dark modules back out of the SVG's path (`M x,y h1v1h-1z` per module). */
const drawn = (svg: string): boolean[][] => {
  const size = Number(/viewBox="0 0 (\d+) \1"/.exec(svg)?.[1]);
  const grid = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  for (const [, x, y] of svg.matchAll(/M(\d+),(\d+)h1v1h-1z/g)) {
    const row = grid[Number(y)];
    if (row) row[Number(x)] = true;
  }
  return grid;
};

/**
 * A fixed URI and the modules of its QR code, made once and decoded by a reader that doesn't use
 * uqr (finder, format and version information, Reed-Solomon, segments): it reads exactly this URI,
 * version 7, error correction M, a 4-module quiet zone. So a library that encoded something else,
 * or with other settings, fails here even though it would match its own `encode()`.
 */
const GOLDEN_URI =
  "otpauth://totp/Ronne%20AI%20Marketplace:someone%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Ronne%20AI%20Marketplace";
const golden = readFileSync(new URL("./__golden__/qr-golden.txt", import.meta.url), "utf8")
  .trimEnd()
  .split("\n")
  .map((row) => [...row].map((cell) => cell === "#"));

describe("qrSvg", () => {
  it("draws the golden QR code for the golden URI", () => {
    expect(golden).toHaveLength(53);
    expect(drawn(qrSvg(GOLDEN_URI))).toEqual(golden);
  });

  it("draws exactly the modules the URI encodes to, dark on a white square", () => {
    const svg = qrSvg(URI);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 (\d+) \1">/);
    expect(svg).toContain('<rect fill="#ffffff"');
    expect(svg).toContain('<path fill="#000000"');
    expect(drawn(svg)).toEqual(qrModules(URI));
  });

  it("leaves a four-module quiet zone on every side", () => {
    const grid = qrModules(URI);
    const size = grid.length;
    for (let i = 0; i < size; i++)
      for (let edge = 0; edge < 4; edge++) {
        expect(grid[edge]?.[i]).toBe(false);
        expect(grid[size - 1 - edge]?.[i]).toBe(false);
        expect(grid[i]?.[edge]).toBe(false);
        expect(grid[i]?.[size - 1 - edge]).toBe(false);
      }
    // The finder pattern starts right inside it.
    expect(grid[4]?.[4]).toBe(true);
  });

  it("is the same drawing for the same URI, and another for another", () => {
    expect(qrSvg(URI)).toBe(qrSvg(URI));
    expect(qrSvg(URI)).not.toBe(qrSvg(URI.replace("JBSWY3DP", "KRSXG5CT")));
  });

  it("puts no script, link or text in the drawing (the secret is only in its modules)", () => {
    const svg = qrSvg(URI);
    expect(svg).not.toMatch(/<script|href|<text|on\w+=/i);
    expect(svg).not.toContain("JBSWY3DP");
  });
});
