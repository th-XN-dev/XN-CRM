interface Person {
  firstName: string;
  lastName: string;
  middleName?: string | null;
}

/** "Karimov Ali" — surname first, as lists are sorted and as people are addressed on paper. */
export function fullName(person: Person | null | undefined): string {
  if (!person) return '';
  return [person.lastName, person.firstName].filter(Boolean).join(' ');
}

/** "Karimov Ali Valiyevich". */
export function fullNameWithMiddle(person: Person): string {
  return [person.lastName, person.firstName, person.middleName].filter(Boolean).join(' ');
}
