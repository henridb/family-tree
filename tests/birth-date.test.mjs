import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { birthDate } from "../src/lib/birth-date.ts";
import {
  formatBirthDate,
  formatBirthYear,
} from "../src/lib/format-birth-date.ts";

test("birth dates retain their known precision, including unknown dates", () => {
  for (const [source, year, details] of [
    ["1910", "1910", "1910"],
    ["1956-02", "1956", "02/1956"],
    ["2000-01-01", "2000", "01/01/2000"],
    ["2000-02-29", "2000", "29/02/2000"],
    [undefined, "?", "?"],
  ]) {
    const value = source === undefined ? undefined : birthDate(source);
    assert.equal(value, source);
    assert.equal(formatBirthYear(value), year);
    assert.equal(formatBirthDate(value), details);
  }
});

test("birth dates reject invalid calendar dates and timestamp values", () => {
  for (const value of [
    "",
    "1956-13",
    "2000-04-31",
    "1900-02-29",
    "2000-01-01T00:00:00Z",
  ]) {
    assert.throws(() => birthDate(value));
  }
});

test("birth years and details are identical across timezones", () => {
  const moduleUrl = new URL("../src/lib/birth-date.ts", import.meta.url).href;
  const formatterUrl = new URL(
    "../src/lib/format-birth-date.ts",
    import.meta.url,
  ).href;
  const script = `
    import { birthDate } from ${JSON.stringify(moduleUrl)};
    import { formatBirthDate, formatBirthYear } from ${JSON.stringify(formatterUrl)};
    console.log(JSON.stringify(["1910", "1956-02", "2000-01-01"].map(source => {
      const value = birthDate(source);
      return [formatBirthYear(value), formatBirthDate(value)];
    })));
  `;
  for (const timezone of ["UTC", "America/Los_Angeles", "Pacific/Auckland"]) {
    const output = execFileSync(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "-e", script],
      { env: { ...process.env, TZ: timezone }, windowsHide: true },
    );
    assert.deepEqual(
      JSON.parse(output.toString()),
      [
        ["1910", "1910"],
        ["1956", "02/1956"],
        ["2000", "01/01/2000"],
      ],
      timezone,
    );
  }
});
