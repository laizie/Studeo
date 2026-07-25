import { describe, it, expect } from 'vitest';
import { assertOneOf, assertOptionalOneOf, assertHexColor } from '../validate';
import { ASSIGNMENT_TYPES, ASSIGNMENT_STATUSES } from '../types';

describe('assertOneOf', () => {
  it('accepts a member of the list', () => {
    expect(() => assertOneOf('Exam', ASSIGNMENT_TYPES, 'type')).not.toThrow();
    expect(() => assertOneOf('completed', ASSIGNMENT_STATUSES, 'status')).not.toThrow();
  });

  it('rejects a non-member', () => {
    expect(() => assertOneOf('Midterm', ASSIGNMENT_TYPES, 'type')).toThrow(/type must be one of/);
  });

  it('is case-sensitive — the enum values are exact', () => {
    expect(() => assertOneOf('exam', ASSIGNMENT_TYPES, 'type')).toThrow();
  });

  it('rejects non-strings, including the ones that sneak through a truthiness check', () => {
    for (const bad of [undefined, null, 42, {}, [], true]) {
      expect(() => assertOneOf(bad, ASSIGNMENT_TYPES, 'type')).toThrow(/type must be one of/);
    }
  });

  it('names the field and lists the options, since the message reaches the user', () => {
    expect(() => assertOneOf('nope', ASSIGNMENT_STATUSES, 'status')).toThrow(
      'status must be one of: not_started, in_progress, completed',
    );
  });
});

describe('assertOptionalOneOf', () => {
  it('allows undefined — an absent field on an update means "leave it alone"', () => {
    expect(() => assertOptionalOneOf(undefined, ASSIGNMENT_TYPES, 'type')).not.toThrow();
  });

  it('still rejects a present-but-invalid value', () => {
    expect(() => assertOptionalOneOf('Midterm', ASSIGNMENT_TYPES, 'type')).toThrow();
  });

  it('rejects null — that is an explicit value, not an absent one', () => {
    expect(() => assertOptionalOneOf(null, ASSIGNMENT_TYPES, 'type')).toThrow();
  });
});

describe('assertHexColor', () => {
  it('accepts 6-digit hex in either case', () => {
    expect(() => assertHexColor('#6393e1')).not.toThrow();
    expect(() => assertHexColor('#6393E1')).not.toThrow();
  });

  it('rejects shapes that would render as a broken swatch', () => {
    for (const bad of ['6393e1', '#639', '#6393e', '#6393e12', 'red', '', undefined, null, 0x6393e1]) {
      expect(() => assertHexColor(bad)).toThrow(/hex color/);
    }
  });

  it('rejects a CSS injection attempt dressed as a color', () => {
    expect(() => assertHexColor('red; background: url(evil)')).toThrow();
  });
});
