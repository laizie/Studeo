import { describe, it, expect } from 'vitest';
import { plainMathToLatex, isLatexSource } from '../plainMath';

// These assertions are the notation's contract: they're what the editor's help text
// promises a student can type. Written against the LaTeX output rather than the rendered
// glyphs because that's the boundary this module owns — KaTeX's job starts after it.

describe('the LaTeX escape hatch', () => {
  it('treats any source containing a backslash as LaTeX and leaves it alone', () => {
    expect(isLatexSource('\\frac{1}{2}')).toBe(true);
    expect(plainMathToLatex('\\frac{1}{2}')).toBe('\\frac{1}{2}');
  });

  it('passes through an environment untouched rather than half-parsing it', () => {
    const source = '\\begin{aligned} x &= 1 \\\\ y &= 2 \\end{aligned}';
    expect(plainMathToLatex(source)).toBe(source);
  });

  it('treats backslash-free source as plain maths', () => {
    expect(isLatexSource('1/2')).toBe(false);
  });
});

describe('fractions', () => {
  it('turns a slash into a real fraction', () => {
    expect(plainMathToLatex('1/2')).toBe('\\frac{1}{2}');
  });

  it('takes a parenthesised group as the whole numerator, without printing the parens', () => {
    expect(plainMathToLatex('(x + 1)/2')).toBe('\\frac{x + 1}{2}');
  });

  it('lets scripts bind tighter than the slash', () => {
    expect(plainMathToLatex('x^2/2')).toBe('\\frac{x^{2}}{2}');
  });

  it('chains left-to-right', () => {
    expect(plainMathToLatex('a/b/c')).toBe('\\frac{\\frac{a}{b}}{c}');
  });
});

describe('scripts', () => {
  it('braces a superscript', () => {
    expect(plainMathToLatex('x^2')).toBe('x^{2}');
  });

  it('braces a multi-character script written as a group', () => {
    expect(plainMathToLatex('e^(2x)')).toBe('e^{2 x}');
  });

  it('takes a subscript and a superscript together', () => {
    expect(plainMathToLatex('sum_(i=1)^n')).toBe('\\sum_{i = 1}^{n}');
  });

  it('keeps parentheses on the base when they are the base', () => {
    expect(plainMathToLatex('(a+b)^2')).toBe('\\left( a + b \\right)^{2}');
  });
});

describe('named symbols', () => {
  it('translates greek letters', () => {
    expect(plainMathToLatex('alpha beta pi')).toBe('\\alpha \\beta \\pi');
  });

  it('translates relations', () => {
    expect(plainMathToLatex('a <= b')).toBe('a \\leq b');
    expect(plainMathToLatex('a != b')).toBe('a \\neq b');
    expect(plainMathToLatex('a ~~ b')).toBe('a \\approx b');
  });

  it('prefers the longest match, so <= is not < followed by =', () => {
    expect(plainMathToLatex('x >= y')).toBe('x \\geq y');
    expect(plainMathToLatex('A sube B')).toBe('A \\subseteq B');
  });

  it('renders function names upright', () => {
    expect(plainMathToLatex('sin(x)')).toBe('\\sin \\left( x \\right)');
  });

  it('does not match a symbol name buried inside a longer word', () => {
    // `in` is a relation, but `int` is the integral and `inf` is a function — and a bare
    // identifier like `pint` must not become `p \in t`.
    expect(plainMathToLatex('int')).toBe('\\int');
    expect(plainMathToLatex('pint')).toBe('p i n t');
  });

  it('leaves unknown letters as individual variables', () => {
    expect(plainMathToLatex('xy')).toBe('x y');
  });
});

describe('builders', () => {
  it('builds a square root', () => {
    expect(plainMathToLatex('sqrt(x + 1)')).toBe('\\sqrt{x + 1}');
  });

  it('takes an unbracketed argument too', () => {
    expect(plainMathToLatex('sqrt 2')).toBe('\\sqrt{2}');
  });

  it('builds an nth root from its two arguments', () => {
    expect(plainMathToLatex('root(3)(x)')).toBe('\\sqrt[3]{x}');
  });

  it('builds absolute value and accents', () => {
    expect(plainMathToLatex('abs(x)')).toBe('\\left|x\\right|');
    expect(plainMathToLatex('vec(v)')).toBe('\\vec{v}');
    expect(plainMathToLatex('bar(x)')).toBe('\\overline{x}');
  });
});

describe('grouping', () => {
  it('keeps parentheses that are doing real work', () => {
    expect(plainMathToLatex('(a + b)')).toBe('\\left( a + b \\right)');
  });

  it('treats braces as invisible grouping, the way LaTeX does', () => {
    expect(plainMathToLatex('x^{2n}')).toBe('x^{2 n}');
  });

  it('joins a comma list inside brackets', () => {
    expect(plainMathToLatex('f(x, y)')).toBe('f \\left( x, y \\right)');
  });
});

describe('matrices', () => {
  it('reads nested square brackets as a bracketed matrix', () => {
    expect(plainMathToLatex('[[1,2],[3,4]]')).toBe(
      '\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}',
    );
  });

  it('reads nested parentheses as a parenthesised matrix', () => {
    expect(plainMathToLatex('((a,b),(c,d))')).toBe(
      '\\begin{pmatrix}a & b \\\\ c & d\\end{pmatrix}',
    );
  });

  it('does not mistake an ordinary coordinate pair for a matrix', () => {
    expect(plainMathToLatex('(x, y)')).toBe('\\left( x, y \\right)');
  });
});

describe('literal text', () => {
  it('takes a quoted string as words, not variables', () => {
    expect(plainMathToLatex('"if" x > 0')).toBe('\\text{if} x \\gt 0');
  });

  it('takes text(...) literally', () => {
    expect(plainMathToLatex('text(total cost)')).toBe('\\text{total cost}');
  });
});

describe('robustness', () => {
  // The source is re-parsed on every keystroke, so half-finished input is the normal
  // case, not an edge case: it must never throw or hang.
  it('survives partial input mid-keystroke', () => {
    const partials = ['(', 'sqrt(', 'x^', 'sum_(i=1)^', '1/', '[[1,', 'root(3)', '"', ')'];
    for (const partial of partials) {
      expect(() => plainMathToLatex(partial)).not.toThrow();
    }
  });

  it('returns empty for empty input', () => {
    expect(plainMathToLatex('')).toBe('');
    expect(plainMathToLatex('   ')).toBe('');
  });
});
