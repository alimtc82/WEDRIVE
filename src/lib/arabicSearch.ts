const ARABIC_EQUIVALENTS: Record<string, string> = {
  "أ": "ا", "إ": "ا", "آ": "ا", "ة": "ه", "ى": "ي", "ؤ": "و", "ئ": "ي",
};

export function normalizeArabic(text: string): string {
  return text.toLocaleLowerCase("ar").replace(/[أإآةىؤئ]/g, (letter) => ARABIC_EQUIVALENTS[letter] || letter);
}

export function findArabicMatch(text: string, query: string): { start: number; length: number } | null {
  const needle = normalizeArabic(query.trim());
  if (!needle) return null;
  const start = normalizeArabic(text).indexOf(needle);
  return start < 0 ? null : { start, length: needle.length };
}
