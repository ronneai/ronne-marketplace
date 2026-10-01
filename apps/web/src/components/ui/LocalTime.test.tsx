import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocalTime, localText, utcText } from "./LocalTime";

const AT = "2026-09-28T01:05:09.000Z";

describe("LocalTime", () => {
  it("renders UTC on the server, with the moment and the UTC time for hover", () => {
    expect(renderToStaticMarkup(<LocalTime value={AT} />)).toBe(
      '<time dateTime="2026-09-28T01:05:09.000Z" title="2026-09-28 01:05 UTC">2026-09-28 01:05 UTC</time>',
    );
    expect(renderToStaticMarkup(<LocalTime value={new Date(AT)} precision="day" />)).toBe(
      '<time dateTime="2026-09-28T01:05:09.000Z" title="2026-09-28 01:05 UTC">2026-09-28</time>',
    );
  });

  it("writes UTC in three precisions", () => {
    expect(utcText(AT)).toBe("2026-09-28 01:05 UTC");
    expect(utcText(AT, "second")).toBe("2026-09-28 01:05:09 UTC");
    expect(utcText(AT, "day")).toBe("2026-09-28");
  });

  it("writes the same moment in a time zone, in the same order, with its name", () => {
    expect(localText(AT, "minute", "America/Sao_Paulo")).toBe("2026-09-27 22:05 GMT-3");
    expect(localText(AT, "second", "Asia/Tokyo")).toBe("2026-09-28 10:05:09 GMT+9");
    expect(localText(AT, "minute", "UTC")).toBe("2026-09-28 01:05 UTC");
  });

  it("gives the reader's own date for a day, across midnight", () => {
    expect(localText(AT, "day", "America/Sao_Paulo")).toBe("2026-09-27");
    expect(localText(AT, "day", "Europe/Lisbon")).toBe("2026-09-28");
  });

  it("uses the offset in force on the moment's own date", () => {
    expect(localText("2026-01-15T12:00:00Z", "minute", "Europe/Lisbon")).toBe(
      "2026-01-15 12:00 GMT",
    );
    expect(localText("2026-07-15T12:00:00Z", "minute", "Europe/Lisbon")).toBe(
      "2026-07-15 13:00 GMT+1",
    );
  });
});
