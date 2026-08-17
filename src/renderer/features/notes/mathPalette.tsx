/**
 * The equation block's symbol palette.
 *
 * Plain-math notation (shared/plainMath.ts) covers the common cases well, but a few things
 * stay awkward to type from memory no matter how friendly the syntax is — matrices, sums
 * with both limits, the Greek letter whose name you can picture but not spell. These are
 * the buttons for those.
 *
 * Every snippet is written in **plain notation, not LaTeX**, so pressing a button teaches
 * you the syntax for next time instead of dumping backslashes you then have to work around.
 * The label is the rendered glyph; the snippet underneath is what lands in the source.
 */

export interface MathSnippet {
  /** What the button shows — the glyph or shape you're looking for. */
  label: string;
  /** Screen-reader name and tooltip, since a lone "∑" isn't a description. */
  title: string;
  /** The plain-maths text inserted at the cursor. */
  insert: string;
  /** Where the caret lands afterwards, as an offset into `insert`. */
  caret: number;
  /** When true, selected text is placed inside the snippet's first `()` instead of
   *  being replaced — so you can select `x+1` and press √ to get `sqrt(x+1)`. */
  wraps?: boolean;
}

interface PaletteGroup {
  name: string;
  items: MathSnippet[];
}

export const MATH_PALETTE: PaletteGroup[] = [
  {
    name: 'Structure',
    items: [
      { label: 'a⁄b', title: 'Fraction',        insert: '()/()',        caret: 1, wraps: true },
      { label: '√',   title: 'Square root',     insert: 'sqrt()',       caret: 5, wraps: true },
      { label: 'ⁿ√',  title: 'Nth root',        insert: 'root()()',     caret: 5 },
      { label: 'x²',  title: 'Superscript',     insert: '^()',          caret: 2 },
      { label: 'xₙ',  title: 'Subscript',       insert: '_()',          caret: 2 },
      { label: '|x|', title: 'Absolute value',  insert: 'abs()',        caret: 4, wraps: true },
    ],
  },
  {
    name: 'Operators',
    items: [
      { label: '∑',  title: 'Sum with limits',      insert: 'sum_()^()',  caret: 5 },
      { label: '∏',  title: 'Product with limits',  insert: 'prod_()^()', caret: 6 },
      { label: '∫',  title: 'Integral with limits', insert: 'int_()^()',  caret: 5 },
      { label: '∂',  title: 'Partial derivative',   insert: 'del ',       caret: 4 },
      { label: '∇',  title: 'Gradient',             insert: 'grad ',      caret: 5 },
      { label: 'lim', title: 'Limit',               insert: 'lim_()',     caret: 5 },
    ],
  },
  {
    name: 'Relations',
    items: [
      { label: '≤', title: 'Less than or equal',    insert: ' <= ', caret: 4 },
      { label: '≥', title: 'Greater than or equal', insert: ' >= ', caret: 4 },
      { label: '≠', title: 'Not equal',             insert: ' != ', caret: 4 },
      { label: '≈', title: 'Approximately equal',   insert: ' ~~ ', caret: 4 },
      { label: '±', title: 'Plus or minus',         insert: ' +- ', caret: 4 },
      { label: '→', title: 'Arrow',                 insert: ' -> ', caret: 4 },
      { label: '∈', title: 'Element of',            insert: ' in ', caret: 4 },
      { label: '∞', title: 'Infinity',              insert: 'oo',   caret: 2 },
    ],
  },
  {
    name: 'Greek',
    items: [
      { label: 'π', title: 'pi',    insert: 'pi ',    caret: 3 },
      { label: 'α', title: 'alpha', insert: 'alpha ', caret: 6 },
      { label: 'β', title: 'beta',  insert: 'beta ',  caret: 5 },
      { label: 'θ', title: 'theta', insert: 'theta ', caret: 6 },
      { label: 'λ', title: 'lambda', insert: 'lambda ', caret: 7 },
      { label: 'μ', title: 'mu',    insert: 'mu ',    caret: 3 },
      { label: 'σ', title: 'sigma', insert: 'sigma ', caret: 6 },
      { label: 'Δ', title: 'Delta', insert: 'Delta ', caret: 6 },
    ],
  },
  {
    name: 'Layout',
    items: [
      // The matrix lands complete rather than as an empty shell: seeing `[[1,2],[3,4]]`
      // once is how you learn that rows are bracketed and comma-separated.
      { label: '[ ]', title: 'Matrix',      insert: '[[1,2],[3,4]]', caret: 2 },
      { label: '( )', title: 'Parentheses', insert: '()',            caret: 1, wraps: true },
      { label: 'abc', title: 'Words',       insert: '"" ',           caret: 1 },
    ],
  },
];
