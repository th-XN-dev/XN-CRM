import { type TransformFnParams } from 'class-transformer';

export const trimString = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export const toUpperTrimmed = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export const toLowerTrimmed = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Query-string booleans: "true"/"false" → boolean; anything else is left for validation. */
export const toBoolean = ({ value }: TransformFnParams): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;
