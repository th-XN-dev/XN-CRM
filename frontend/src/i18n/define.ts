/** Same keys as `T`, any string values (a translation of the English source). */
export type Translation<T> = { [K in keyof T]: T[K] extends string ? string : Translation<T[K]> };

/**
 * One feature's messages in every language, side by side. The compiler
 * rejects a missing or extra key in `uz` / `ru`; locales.spec checks the rest.
 */
export function defineMessages<T>(messages: { en: T; uz: Translation<T>; ru: Translation<T> }) {
  return messages;
}
