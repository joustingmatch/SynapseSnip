import { describe, expect, it } from "vitest";
import { formatFilename } from "../filename";

describe("formatFilename", () => {
  const now = new Date(2026, 3, 13, 9, 8, 7);

  it("formats standard date tokens", () => {
    expect(formatFilename("{yyyy}-{MM}-{dd}", "png", now)).toBe("2026-04-13.png");
  });

  it("replaces repeated tokens", () => {
    expect(formatFilename("{yyyy}_{yyyy}", "png", now)).toBe("2026_2026.png");
  });

  it("returns only the extension for an empty template", () => {
    expect(formatFilename("", "png", now)).toBe(".png");
  });

  it("leaves unknown tokens untouched", () => {
    expect(formatFilename("{foo}", "png", now)).toBe("{foo}.png");
  });
});
