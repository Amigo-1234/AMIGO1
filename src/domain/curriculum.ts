/**
 * Initial academic structure, carried over from V1 (see docs/legacy-v1.md).
 *
 * This is seed data only: once in the database, levels and subjects are managed by
 * administrators. Subject codes are stable identifiers and must never be reused for a
 * different subject. Arabic names should be reviewed by the school.
 */
export type LevelDefinition = {
  code: string;
  nameEn: string;
  nameAr: string;
  stageEn: string;
  stageAr: string;
  sortOrder: number;
  /** Code of the level students are promoted into; null means they graduate. */
  nextLevelCode: string | null;
};

export const DEFAULT_LEVELS: readonly LevelDefinition[] = [
  {
    code: "IBT",
    nameEn: "Ibtidā’iyah",
    nameAr: "الابتدائية",
    stageEn: "Beginner",
    stageAr: "المبتدئ",
    sortOrder: 1,
    nextLevelCode: "IDA",
  },
  {
    code: "IDA",
    nameEn: "Idādiyah",
    nameAr: "الإعدادية",
    stageEn: "Middle",
    stageAr: "المتوسط",
    sortOrder: 2,
    nextLevelCode: "THA",
  },
  {
    code: "THA",
    nameEn: "Thanāwiyah",
    nameAr: "الثانوية",
    stageEn: "Senior",
    stageAr: "المتقدم",
    sortOrder: 3,
    nextLevelCode: null,
  },
];

export type SubjectDefinition = { code: string; nameEn: string; nameAr: string };

const subject = (code: string, nameEn: string, nameAr: string): SubjectDefinition => ({
  code,
  nameEn,
  nameAr,
});

/** Subjects per level in curriculum (display) order, exactly as V1 listed them. */
export const DEFAULT_CURRICULUM: Readonly<Record<string, readonly SubjectDefinition[]>> = {
  IBT: [
    subject("IBT-TAJWEED", "Tajweed", "التجويد"),
    subject("IBT-ARABIC", "Arabic", "اللغة العربية"),
    subject("IBT-QURAN", "Qur'an", "القرآن الكريم"),
    subject("IBT-HADITH", "Hadith", "الحديث"),
    subject("IBT-FIQH", "Fiqh", "الفقه"),
    subject("IBT-AKHLAQ", "Akhlaq", "الأخلاق"),
    subject("IBT-NAHWU", "Nahwu", "النحو"),
    subject("IBT-SARF", "Sarf", "الصرف"),
    subject("IBT-DICTATION", "Dictation", "الإملاء"),
    subject("IBT-READING", "Reading", "القراءة"),
  ],
  IDA: [
    subject("IDA-TAJWEED", "Tajweed II", "التجويد (2)"),
    subject("IDA-ARABIC", "Arabic II", "اللغة العربية (2)"),
    subject("IDA-QURAN", "Qur'an II", "القرآن الكريم (2)"),
    subject("IDA-HADITH", "Hadith II", "الحديث (2)"),
    subject("IDA-FIQH", "Fiqh II", "الفقه (2)"),
    subject("IDA-AKHLAQ", "Akhlaq II", "الأخلاق (2)"),
    subject("IDA-NAHWU", "Nahwu II", "النحو (2)"),
    subject("IDA-SARF", "Sarf II", "الصرف (2)"),
    subject("IDA-DICTATION", "Dictation II", "الإملاء (2)"),
    subject("IDA-READING", "Reading II", "القراءة (2)"),
  ],
  THA: [
    subject("THA-TAFSIR", "Tafsir III", "التفسير (3)"),
    subject("THA-BALAGHA", "Balagha III", "البلاغة (3)"),
    subject("THA-QURAN", "Qur'an III", "القرآن الكريم (3)"),
    subject("THA-HADITH", "Hadith III", "الحديث (3)"),
    subject("THA-FIQH", "Fiqh III", "الفقه (3)"),
    subject("THA-SEERAH", "Seerah III", "السيرة النبوية (3)"),
    subject("THA-NAHWU", "Nahwu III", "النحو (3)"),
    subject("THA-SARF", "Sarf III", "الصرف (3)"),
    subject("THA-DICTATION", "Dictation III", "الإملاء (3)"),
    subject("THA-READING", "Reading III", "القراءة (3)"),
  ],
};

export type TermTypeDefinition = {
  code: string;
  nameEn: string;
  nameAr: string;
  sequence: number;
  isLegacy: boolean;
};

/**
 * Term types. Each session gets First, Second and Third terms. "Legacy" holds results
 * imported from V1, which never recorded a term; it is never used for new results and a
 * migrated result can later be moved to its correct term.
 */
export const DEFAULT_TERM_TYPES: readonly TermTypeDefinition[] = [
  { code: "first", nameEn: "First Term", nameAr: "الفصل الأول", sequence: 1, isLegacy: false },
  { code: "second", nameEn: "Second Term", nameAr: "الفصل الثاني", sequence: 2, isLegacy: false },
  { code: "third", nameEn: "Third Term", nameAr: "الفصل الثالث", sequence: 3, isLegacy: false },
  {
    code: "legacy",
    nameEn: "Legacy (term not recorded)",
    nameAr: "سجل سابق (الفصل غير محدد)",
    sequence: 99,
    isLegacy: true,
  },
];

/** V1 stored a calendar year; it maps to the session that starts in that year (2025 → 2025/2026). */
export function sessionLabelForStartYear(startYear: number): string {
  return `${startYear}/${startYear + 1}`;
}
