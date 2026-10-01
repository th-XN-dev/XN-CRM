import { SLUG_REGEX, slugify } from './slug';

describe('slugify', () => {
  it.each([
    ['Jony Math Academy', 'jony-math-academy'],
    ["O'zbek Til Markazi", 'ozbek-til-markazi'],
    ['Жони Академия', 'joni-akademiya'],
    ['  --Hello__World!!  ', 'hello-world'],
    ['!!!', 'org'],
  ])('%s → %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
    expect(slugify(input)).toMatch(SLUG_REGEX);
  });
});
