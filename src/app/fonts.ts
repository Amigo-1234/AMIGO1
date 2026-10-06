import { Manrope, Noto_Kufi_Arabic } from "next/font/google";

// Both are variable fonts, self-hosted by Next.js at build time (no request to Google at runtime).
export const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

// Arabic appears on every page (the school's name), so it is preloaded in both languages.
export const notoKufiArabic = Noto_Kufi_Arabic({
  subsets: ["arabic"],
  variable: "--font-noto-kufi-arabic",
  display: "swap",
});
