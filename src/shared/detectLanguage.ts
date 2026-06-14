// Lightweight, dependency-free heuristic to guess a code block's language from its text, so
// the editor can auto-apply syntax highlighting as you type. Each language is scored by a few
// distinctive signals; we only return a guess when one language clearly wins (enough score AND
// a clear margin over the runner-up). Otherwise null — better to leave a block unhighlighted
// than to mislabel an ambiguous snippet. Returned ids match the code block's supported set
// (see features/notes/codeBlock.ts). This is intentionally simple, not a real classifier.

type Signal = [pattern: RegExp, weight: number];

const SIGNALS: Record<string, Signal[]> = {
  python: [
    [/\bdef\s+\w+\s*\(/, 3], [/^\s*from\s+[\w.]+\s+import\b/m, 3], [/^\s*import\s+\w+/m, 1],
    [/\bprint\s*\(/, 1], [/\belif\b/, 3], [/\bself\b/, 2], [/\b__\w+__\b/, 2], [/:\s*$/m, 1],
  ],
  typescript: [
    [/\binterface\s+\w+/, 3], [/\btype\s+\w+\s*=/, 3], [/:\s*(string|number|boolean|any|void|unknown)\b/, 3],
    [/\benum\s+\w+/, 2], [/\bas\s+\w+/, 1], [/\bexport\s+(const|function|class|type|interface)\b/, 1],
  ],
  javascript: [
    [/\bconst\s+\w+\s*=/, 1], [/\blet\s+\w+/, 1], [/\bfunction\s*\*?\s*\w*\s*\(/, 2],
    [/=>/, 1], [/\bconsole\.log\s*\(/, 3], [/\brequire\s*\(/, 2], [/\bdocument\.\w+/, 2],
  ],
  java: [
    [/\bpublic\s+class\s+\w+/, 3], [/\bpublic\s+static\s+void\s+main\b/, 4],
    [/\bSystem\.out\.print/, 3], [/\bimport\s+java\./, 3],
  ],
  cpp: [
    [/#include\s*<(iostream|vector|string|map|algorithm)>/, 4], [/\bstd::/, 3],
    [/\bcout\s*<</, 3], [/\busing\s+namespace\b/, 3], [/\btemplate\s*</, 2],
  ],
  c: [
    [/#include\s*<\w+\.h>/, 3], [/\bint\s+main\s*\(/, 2], [/\bprintf\s*\(/, 3], [/\bscanf\s*\(/, 2],
  ],
  csharp: [
    [/\busing\s+System\b/, 3], [/\bnamespace\s+\w+/, 2], [/\bConsole\.WriteLine/, 4],
  ],
  php: [[/<\?php/, 5], [/\$\w+\s*=/, 1], [/\becho\s+/, 1], [/->\w+\(/, 1]],
  ruby: [[/\bputs\s+/, 3], [/\bdo\s*\|/, 3], [/\brequire\s+['"]/, 2], [/\bend\b/, 1], [/\b@\w+/, 1]],
  rust: [[/\bfn\s+\w+\s*\(/, 3], [/\blet\s+mut\b/, 3], [/\bprintln!\s*\(/, 4], [/\bimpl\s+\w+/, 2]],
  swift: [[/\bfunc\s+\w+\s*\(/, 3], [/\bguard\s+let\b/, 3], [/\bvar\s+\w+\s*:/, 1], [/\b(UI|NS)\w+/, 2]],
  kotlin: [[/\bfun\s+\w+\s*\(/, 3], [/\bval\s+\w+/, 2], [/\bprintln\s*\(/, 2], [/\bcompanion\s+object\b/, 3]],
  sql: [
    [/\bSELECT\b[\s\S]*\bFROM\b/i, 4], [/\bINSERT\s+INTO\b/i, 3], [/\bCREATE\s+TABLE\b/i, 3],
    [/\bWHERE\b/i, 1], [/\bJOIN\b/i, 1],
  ],
  shellscript: [[/^#!.*\b(sh|bash|zsh)\b/m, 4], [/\$\(\w/, 2], [/\bfi\b/, 2], [/\bdone\b/, 2], [/\bsudo\b/, 2]],
  html: [[/<!DOCTYPE\s+html>/i, 4], [/<html[\s>]/i, 3], [/<\/(div|span|body|head|p|a|ul|li)>/i, 2]],
  css: [[/@media\b/, 2], [/\b(margin|padding|background|font-size|border-radius)\s*:/, 2], [/[.#][\w-]+\s*\{/, 1]],
  json: [[/^\s*[{[]/, 1], [/"[\w-]+"\s*:/, 2]],
  yaml: [[/^---\s*$/m, 2], [/^[\w-]+:\s+\S/m, 1], [/^\s*-\s+\w/m, 1]],
  markdown: [[/^#{1,6}\s+\S/m, 3], [/\[[^\]]+\]\([^)]+\)/, 2], [/^[-*]\s+\S/m, 1]],
  latex: [[/\\documentclass\b/, 4], [/\\begin\{/, 3], [/\\\w+\{/, 1]],
};

/**
 * Guess the language of a code snippet, or return null when it's too short or ambiguous.
 * Conservative by design: callers should leave the block as-is on null.
 */
export function detectCodeLanguage(code: string): string | null {
  const text = code.trim();
  if (text.length < 12) return null; // too little to judge confidently

  const scores: Array<[string, number]> = [];
  for (const [lang, signals] of Object.entries(SIGNALS)) {
    let score = 0;
    for (const [pattern, weight] of signals) {
      if (pattern.test(text)) score += weight;
    }
    if (score > 0) scores.push([lang, score]);
  }
  if (scores.length === 0) return null;

  scores.sort((a, b) => b[1] - a[1]);
  const [bestLang, bestScore] = scores[0];
  const runnerUp = scores[1]?.[1] ?? 0;

  // Need a real signal and a clear lead, or we'd rather not guess.
  if (bestScore < 3) return null;
  if (bestScore - runnerUp < 2) return null;
  return bestLang;
}
