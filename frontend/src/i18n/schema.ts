import type en from './locales/en';

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** Every locale must provide exactly the keys of the English source. */
export type MessageSchema = Widen<typeof en>;
