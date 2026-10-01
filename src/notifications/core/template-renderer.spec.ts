import {
  pickAllowed,
  renderTemplate,
  templateVariables,
  unknownVariables,
} from './template-renderer';

describe('template renderer', () => {
  const allowed = ['studentName', 'amount'];

  it('substitutes allow-listed variables only', () => {
    expect(
      renderTemplate(
        '{{studentName}} paid {{ amount }} ({{secret}})',
        {
          studentName: 'Ali',
          amount: '450 000',
          secret: 'x',
        },
        allowed,
      ),
    ).toBe('Ali paid 450 000 ()');
  });

  it('never evaluates expressions', () => {
    const template = '{{constructor.constructor("return 1")()}} {{7*7}} {{studentName}}';
    expect(renderTemplate(template, { studentName: 'Ali' }, allowed)).toBe(
      '{{constructor.constructor("return 1")()}} {{7*7}} Ali',
    );
  });

  it('missing values render empty', () => {
    expect(renderTemplate('[{{amount}}]', {}, allowed)).toBe('[]');
  });

  it('finds unknown variables and filters stored data', () => {
    expect(templateVariables('{{a}} {{ b }}')).toEqual(['a', 'b']);
    expect(unknownVariables(['{{studentName}} {{password}}', '{{password}}'], allowed)).toEqual([
      'password',
    ]);
    expect(pickAllowed({ studentName: 'Ali', token: 't', amount: null }, allowed)).toEqual({
      studentName: 'Ali',
    });
  });
});
