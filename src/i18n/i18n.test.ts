import { describe, expect, it } from "vitest";
import {
  defaultLocale,
  getDirection,
  isLocale,
  localeNames,
  locales,
  negotiateLocale,
} from "./config";
import { dictionaries } from "./dictionaries";
import { formatDate, formatNaira, formatNumber, interpolate } from "./format";
import { localeFromPathname, localizedPath, switchLocalePath } from "./paths";

describe("locale config", () => {
  it("supports English (LTR) and Arabic (RTL)", () => {
    expect(locales).toEqual(["en", "ar"]);
    expect(getDirection("en")).toBe("ltr");
    expect(getDirection("ar")).toBe("rtl");
    expect(localeNames.ar).toBe("العربية");
  });

  it("recognises only supported locales", () => {
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe("negotiateLocale", () => {
  it("prefers a valid remembered choice", () => {
    expect(negotiateLocale({ cookie: "ar", acceptLanguage: "en-US,en;q=0.9" })).toBe("ar");
  });

  it("ignores an invalid remembered choice", () => {
    expect(negotiateLocale({ cookie: "xx", acceptLanguage: "ar-SA" })).toBe("ar");
  });

  it("uses the highest-quality supported language", () => {
    expect(negotiateLocale({ acceptLanguage: "fr;q=1, en;q=0.5, ar;q=0.8" })).toBe("ar");
    expect(negotiateLocale({ acceptLanguage: "ha-NG, en-GB;q=0.7" })).toBe("en");
  });

  it("ignores languages refused with q=0", () => {
    expect(negotiateLocale({ acceptLanguage: "ar;q=0, en;q=0.1" })).toBe("en");
  });

  it("falls back to the default", () => {
    expect(negotiateLocale({})).toBe(defaultLocale);
    expect(negotiateLocale({ acceptLanguage: "yo, ig" })).toBe(defaultLocale);
  });
});

describe("dictionaries", () => {
  function leaves(value: unknown, prefix = ""): Map<string, string> {
    const out = new Map<string, string>();
    if (typeof value === "string") {
      out.set(prefix, value);
    } else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        for (const [path, text] of leaves(child, prefix ? `${prefix}.${key}` : key)) {
          out.set(path, text);
        }
      }
    }
    return out;
  }
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  const english = leaves(dictionaries.en);

  it.each(locales)("%s has exactly the English keys, none empty", (locale) => {
    const translated = leaves(dictionaries[locale]);
    expect([...translated.keys()].sort()).toEqual([...english.keys()].sort());
    for (const [path, text] of translated) {
      expect(text.trim(), path).not.toBe("");
    }
  });

  it.each(locales)("%s keeps the same placeholders as English", (locale) => {
    for (const [path, text] of leaves(dictionaries[locale])) {
      expect(placeholders(text), path).toEqual(placeholders(english.get(path)!));
    }
  });

  it("Arabic strings are actually Arabic", () => {
    const arabic = /[؀-ۿ]/;
    for (const [path, text] of leaves(dictionaries.ar)) {
      expect(arabic.test(text), path).toBe(true);
    }
  });
});

describe("formatting", () => {
  it("interpolates placeholders and leaves unknown ones visible", () => {
    expect(interpolate("© {year} Markaz il Ginna", { year: 2026 })).toBe("© 2026 Markaz il Ginna");
    expect(interpolate("Hello {name}", {})).toBe("Hello {name}");
  });

  it("formats Naira in both languages with Western digits", () => {
    expect(formatNaira(40000, "en")).toBe("₦40,000");
    expect(formatNaira(40000, "ar")).toContain("40,000");
    expect(formatNaira(40000, "ar")).toContain("₦");
    expect(formatNaira(1250.5, "en", { kobo: true })).toBe("₦1,250.50");
  });

  it("formats numbers and dates", () => {
    expect(formatNumber(1234567, "ar")).toBe("1,234,567");
    // Midnight in Lagos is still the same calendar day there.
    expect(formatDate(new Date("2026-10-05T23:30:00Z"), "en")).toBe("6 Oct 2026");
  });
});

describe("localized paths", () => {
  it("reads the locale prefix", () => {
    expect(localeFromPathname("/ar/portal")).toBe("ar");
    expect(localeFromPathname("/en")).toBe("en");
    expect(localeFromPathname("/portal")).toBeUndefined();
    expect(localeFromPathname("/english")).toBeUndefined();
  });

  it("builds localized hrefs", () => {
    expect(localizedPath("en")).toBe("/en");
    expect(localizedPath("ar", "/staff/login")).toBe("/ar/staff/login");
    expect(localizedPath("ar", "portal")).toBe("/ar/portal");
  });

  it("switches the language of the current page", () => {
    expect(switchLocalePath("/en/staff/login", "ar")).toBe("/ar/staff/login");
    expect(switchLocalePath("/ar", "en")).toBe("/en");
    expect(switchLocalePath("/", "ar")).toBe("/ar");
  });
});
