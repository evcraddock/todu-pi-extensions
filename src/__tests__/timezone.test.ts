import { describe, expect, it } from "vitest";

import { getSystemTimezone } from "@/utils/timezone";

describe("getSystemTimezone", () => {
  it("returns a non-empty IANA timezone string", () => {
    const tz = getSystemTimezone();
    expect(tz).toBeTruthy();
    expect(tz.length).toBeGreaterThan(0);
    // IANA timezones contain a slash (e.g. America/Chicago, UTC is the exception)
    expect(tz === "UTC" || tz.includes("/")).toBe(true);
  });
});
