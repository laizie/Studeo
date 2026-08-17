// Plain math → LaTeX. Pure logic, no Electron/Node imports, so it stays testable.
//
// Why this exists: LaTeX is the only realistic way to *typeset* an equation, but it's a
// terrible way to *write* one when you're trying to keep up with a lecture — `\frac{1}{2}`
// is eleven keystrokes and two brace pairs for a number you could write as `1/2`. So the
// note editor lets you type maths roughly the way you'd write it on paper and translates
// to LaTeX before KaTeX ever sees it.
//
// The notation is AsciiMath-flavoured, which is the long-established convention for this
// (MathJax, Moodle and a pile of LMSes accept it), so it's a syntax students may already
// have met rather than one invented here.
//
//   1/2                 →  ½ as a real fraction
//   (x^2 + 1)/2         →  the whole parenthesised part becomes the numerator
//   sqrt(x)   root(3)(x)
//   sum_(i=1)^n i^2     →  Σ with limits above and below
//   int_0^1 x dx
//   alpha beta pi       →  α β π
//   <= >= != ~~ +- -> oo
//   [[1,2],[3,4]]       →  a bracketed matrix
//
// The escape hatch: if the source contains a backslash anywhere, it is treated as LaTeX
// and passed through untouched. That rule is deliberately blunt — it's one sentence to
// explain in the UI, it can't half-apply, and it means pasting a formula from a textbook,
// a lecture PDF or a chatbot always does the obvious thing.

interface Node {
  /** The LaTeX for this node, delimiters included. */
  tex: string;
  /** The same content *without* its surrounding delimiters, when this node was a bracketed
   *  group. Fractions and scripts use this so `(x+1)/2` gives `\frac{x+1}{2}` rather than
   *  `\frac{\left(x+1\right)}{2}` — writing the parens is how you say "this whole thing is
   *  the numerator", not a request to see parens in the output. */
  inner?: string;
  /** Set when this node was a bracketed group holding a top-level comma list, e.g. `[1,2]`.
   *  A group whose every item carries this is a matrix row set. */
  items?: string[];
}

type Entry =
  | { kind: 'const'; tex: string }
  | { kind: 'unary'; build: (a: string) => string }
  | { kind: 'binary'; build: (a: string, b: string) => string }
  | { kind: 'open'; tex: string; close: string; matrix: string }
  | { kind: 'close' };

const c = (tex: string): Entry => ({ kind: 'const', tex });
const u = (build: (a: string) => string): Entry => ({ kind: 'unary', build });
const b = (build: (a: string, b: string) => string): Entry => ({ kind: 'binary', build });

const GREEK = [
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta',
  'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau',
  'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega',
];

// Rendered as upright operator names (`\sin x`, not `s·i·n·x`).
const FUNCTIONS = [
  'sin', 'cos', 'tan', 'csc', 'sec', 'cot', 'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp', 'det', 'dim', 'lim', 'mod',
  'gcd', 'min', 'max', 'sup', 'inf', 'deg', 'ker',
];

const SYMBOLS: Record<string, Entry> = {
  // ── Grouping ──────────────────────────────────────────────────────────────
  '(': { kind: 'open', tex: '(', close: ')', matrix: 'pmatrix' },
  ')': { kind: 'close' },
  '[': { kind: 'open', tex: '[', close: ']', matrix: 'bmatrix' },
  ']': { kind: 'close' },
  // Braces group invisibly, the way they do in LaTeX itself — someone who has seen any
  // LaTeX will reach for `{}` to mean "treat this as one thing", and being surprised by
  // literal braces in the output is a worse outcome than not being able to draw a set.
  '{': { kind: 'open', tex: '', close: '}', matrix: 'Bmatrix' },
  '}': { kind: 'close' },

  // ── Arithmetic and big operators ──────────────────────────────────────────
  '*': c('\\cdot'), '**': c('\\ast'), 'xx': c('\\times'), '-:': c('\\div'),
  '@': c('\\circ'), 'o+': c('\\oplus'), 'ox': c('\\otimes'), 'o.': c('\\odot'),
  'sum': c('\\sum'), 'prod': c('\\prod'), 'int': c('\\int'), 'oint': c('\\oint'),
  'del': c('\\partial'), 'partial': c('\\partial'), 'grad': c('\\nabla'), 'nabla': c('\\nabla'),
  '+-': c('\\pm'), '-+': c('\\mp'), 'oo': c('\\infty'), 'infty': c('\\infty'),
  'O/': c('\\emptyset'), 'aleph': c('\\aleph'),

  // ── Relations ─────────────────────────────────────────────────────────────
  '<': c('\\lt'), '>': c('\\gt'),
  '!=': c('\\neq'), '<=': c('\\leq'), '>=': c('\\geq'),
  '-=': c('\\equiv'), '~=': c('\\cong'), '~~': c('\\approx'), 'prop': c('\\propto'),
  '-<': c('\\prec'), '>-': c('\\succ'),
  'in': c('\\in'), '!in': c('\\notin'), 'notin': c('\\notin'),
  'sub': c('\\subset'), 'subset': c('\\subset'), 'sube': c('\\subseteq'),
  'supset': c('\\supset'), 'supe': c('\\supseteq'),
  'nn': c('\\cap'), 'uu': c('\\cup'), '^^': c('\\wedge'), 'vv': c('\\vee'),

  // ── Logic and arrows ──────────────────────────────────────────────────────
  'not': c('\\neg'), 'and': c('\\text{ and }'), 'or': c('\\text{ or }'),
  '=>': c('\\Rightarrow'), 'implies': c('\\Rightarrow'),
  '<=>': c('\\Leftrightarrow'), 'iff': c('\\Leftrightarrow'),
  'AA': c('\\forall'), 'forall': c('\\forall'),
  'EE': c('\\exists'), 'exists': c('\\exists'),
  '->': c('\\to'), 'to': c('\\to'), '|->': c('\\mapsto'),
  '<-': c('\\leftarrow'), '<->': c('\\leftrightarrow'),
  'uarr': c('\\uparrow'), 'darr': c('\\downarrow'),

  // ── Punctuation and spacing ───────────────────────────────────────────────
  '...': c('\\ldots'), 'cdots': c('\\cdots'), 'vdots': c('\\vdots'), 'ddots': c('\\ddots'),
  'quad': c('\\quad'), ':.': c('\\therefore'), '/_': c('\\angle'),

  // ── Unary builders ────────────────────────────────────────────────────────
  'sqrt': u((a) => `\\sqrt{${a}}`),
  'abs': u((a) => `\\left|${a}\\right|`),
  'norm': u((a) => `\\left\\|${a}\\right\\|`),
  'floor': u((a) => `\\left\\lfloor ${a}\\right\\rfloor`),
  'ceil': u((a) => `\\left\\lceil ${a}\\right\\rceil`),
  'hat': u((a) => `\\hat{${a}}`),
  'bar': u((a) => `\\overline{${a}}`),
  'vec': u((a) => `\\vec{${a}}`),
  'dot': u((a) => `\\dot{${a}}`),
  'ddot': u((a) => `\\ddot{${a}}`),
  'tilde': u((a) => `\\tilde{${a}}`),
  'ul': u((a) => `\\underline{${a}}`),
  'cancel': u((a) => `\\cancel{${a}}`),
  'bb': u((a) => `\\mathbf{${a}}`),
  'bbb': u((a) => `\\mathbb{${a}}`),
  'cc': u((a) => `\\mathcal{${a}}`),
  'tt': u((a) => `\\texttt{${a}}`),
  'text': u((a) => `\\text{${a}}`),

  // ── Binary builders ───────────────────────────────────────────────────────
  'frac': b((x, y) => `\\frac{${x}}{${y}}`),
  'root': b((x, y) => `\\sqrt[${x}]{${y}}`),
  'stackrel': b((x, y) => `\\stackrel{${x}}{${y}}`),
  'overset': b((x, y) => `\\overset{${x}}{${y}}`),
  'underset': b((x, y) => `\\underset{${x}}{${y}}`),
};

for (const name of GREEK) SYMBOLS[name] = c(`\\${name}`);
// `lim`/`sum` style names must not be clobbered by the function list, so functions are
// only added where nothing has claimed the name already.
for (const name of FUNCTIONS) SYMBOLS[name] ??= c(`\\${name}`);

// Longest match wins, so `<=` beats `<` and `sube` beats `sub`.
const SYMBOL_KEYS = Object.keys(SYMBOLS).sort((x, y) => y.length - x.length);

/** True when the source should be handed to KaTeX untouched — see the escape hatch above. */
export function isLatexSource(source: string): boolean {
  return source.includes('\\');
}

/**
 * Translate plain maths notation to LaTeX. Source already containing a backslash is
 * returned unchanged, on the assumption that it is LaTeX.
 */
export function plainMathToLatex(source: string): string {
  if (isLatexSource(source)) return source;
  const parser = new Parser(source);
  return parser.parseExpression().tex;
}

class Parser {
  private pos = 0;

  constructor(private readonly src: string) {}

  // ── Scanning ────────────────────────────────────────────────────────────────

  private skipSpace() {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos += 1;
  }

  /** The next token's text without consuming it, or '' at end of input. */
  private peek(): string {
    this.skipSpace();
    if (this.pos >= this.src.length) return '';

    for (const key of SYMBOL_KEYS) {
      if (this.src.startsWith(key, this.pos)) {
        // A word-shaped symbol must only match a whole word, checked on BOTH sides:
        // `int` must not fire on the tail of `pint`, nor `in` on the head of `input`.
        // (Unknown letters are consumed one at a time, so the scanner really does end up
        // mid-word.) Symbols made of punctuation have no such risk — `2pi` should match.
        if (/^[A-Za-z]/.test(key)) {
          const before = this.src[this.pos - 1] ?? '';
          const after = this.src[this.pos + key.length] ?? '';
          if (/[A-Za-z]/.test(before) || /[A-Za-z]/.test(after)) continue;
        }
        return key;
      }
    }

    const rest = this.src.slice(this.pos);
    const number = rest.match(/^\d+(\.\d+)?/);
    if (number) return number[0];
    return this.src[this.pos];
  }

  private take(): string {
    const token = this.peek();
    this.pos += token.length;
    return token;
  }

  // ── Grammar ─────────────────────────────────────────────────────────────────

  /** A run of terms, stopping at a closing bracket or a comma (the caller's business). */
  parseExpression(): Node {
    const parts: Node[] = [];
    for (;;) {
      const next = this.peek();
      if (next === '' || next === ',' || SYMBOLS[next]?.kind === 'close') break;
      parts.push(this.parseFraction());
    }
    // A single part is returned as itself so `inner`/`items` survive — that's what lets
    // `[[1,2],[3,4]]` see its rows, and `(x+1)/2` drop the numerator's parens.
    if (parts.length === 1) return parts[0];
    return { tex: parts.map((p) => p.tex).join(' ') };
  }

  /** `a/b`, left-associative, binding looser than scripts so `x^2/2` is (x²)/2. */
  private parseFraction(): Node {
    let left = this.parseScripted();
    while (this.peek() === '/') {
      this.take();
      const right = this.parseScripted();
      left = { tex: `\\frac{${content(left)}}{${content(right)}}` };
    }
    return left;
  }

  /** An atom with any `_` subscript and `^` superscript, in either order. */
  private parseScripted(): Node {
    const base = this.parseAtom();
    let sub = '';
    let sup = '';
    for (let i = 0; i < 2; i += 1) {
      const next = this.peek();
      if (next === '_' && !sub) {
        this.take();
        sub = `_{${content(this.parseAtom())}}`;
      } else if (next === '^' && !sup) {
        this.take();
        sup = `^{${content(this.parseAtom())}}`;
      } else {
        break;
      }
    }
    if (!sub && !sup) return base;
    // Scripts attach to the delimited form: `(a+b)^2` needs its parens back.
    return { tex: `${base.tex}${sub}${sup}` };
  }

  private parseAtom(): Node {
    const token = this.peek();
    if (token === '') return { tex: '' };

    if (token === '"') return this.parseQuoted();

    const entry = SYMBOLS[token];

    if (entry?.kind === 'open') {
      this.take();
      return this.parseGroup(entry);
    }

    if (entry?.kind === 'close') {
      // An unmatched closer: emit it rather than looping forever on it.
      this.take();
      return { tex: token };
    }

    if (entry?.kind === 'unary') {
      this.take();
      // `text(...)` takes its argument literally — otherwise "if" would be parsed as
      // maths and come out as three italic variables.
      if (token === 'tt' || token === 'text') return { tex: entry.build(this.parseRaw()) };
      return { tex: entry.build(content(this.parseAtom())) };
    }

    if (entry?.kind === 'binary') {
      this.take();
      const first = content(this.parseAtom());
      const second = content(this.parseAtom());
      return { tex: entry.build(first, second) };
    }

    if (entry?.kind === 'const') {
      this.take();
      return { tex: entry.tex };
    }

    this.take();
    return { tex: token };
  }

  /** The contents of a bracket pair: a comma list, which may turn out to be a matrix. */
  private parseGroup(open: Extract<Entry, { kind: 'open' }>): Node {
    const items: Node[] = [];
    for (;;) {
      items.push(this.parseExpression());
      if (this.peek() === ',') {
        this.take();
        continue;
      }
      break;
    }
    if (this.peek() === open.close) this.take();

    // Every item is itself a bracketed comma list → read the whole thing as a matrix.
    const rows = items.map((item) => item.items);
    if (items.length > 1 && rows.every((row): row is string[] => row !== undefined)) {
      const body = rows.map((row) => row.join(' & ')).join(' \\\\ ');
      return { tex: `\\begin{${open.matrix}}${body}\\end{${open.matrix}}` };
    }

    const inner = items.map((item) => item.tex).join(', ');
    const tex = open.tex
      ? `\\left${open.tex} ${inner} \\right${open.close}`
      : inner; // invisible braces
    return { tex, inner, items: items.map((item) => item.tex) };
  }

  /** `"…"` — literal text inside an equation ("if x > 0"). */
  private parseQuoted(): Node {
    this.take(); // opening quote
    const end = this.src.indexOf('"', this.pos);
    const text = end === -1 ? this.src.slice(this.pos) : this.src.slice(this.pos, end);
    this.pos = end === -1 ? this.src.length : end + 1;
    return { tex: `\\text{${text}}` };
  }

  /** The raw characters of a bracketed argument, for `text(...)`. */
  private parseRaw(): string {
    this.skipSpace();
    if (this.src[this.pos] !== '(') return content(this.parseAtom());
    this.pos += 1;
    const end = this.src.indexOf(')', this.pos);
    const text = end === -1 ? this.src.slice(this.pos) : this.src.slice(this.pos, end);
    this.pos = end === -1 ? this.src.length : end + 1;
    return text;
  }
}

/** A node's content with any grouping delimiters removed — see `Node.inner`. */
function content(node: Node): string {
  return node.inner ?? node.tex;
}
