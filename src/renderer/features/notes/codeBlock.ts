import { codeBlockOptions } from '@blocknote/code-block';

// BlockNote's default code block lists all 48 Shiki languages. We curate the *menu* down to
// the popular ones students actually reach for; each grammar still loads on demand (only when
// a block uses that language), so listing more here doesn't grow the bundle — it just decides
// what the language picker offers. (Note: this Shiki bundle has no `go`/`golang` grammar.)
const supported = codeBlockOptions.supportedLanguages;

// Typed against the real key set, so a typo or a key removed upstream is a compile error.
const STUDENT_LANGUAGES: (keyof typeof supported)[] = [
  'text',
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'python',
  'java',
  'c',
  'cpp',
  'csharp',
  'objective-c',
  'php',
  'ruby',
  'rust',
  'swift',
  'kotlin',
  'scala',
  'haskell',
  'lua',
  'r',
  'sql',
  'shellscript', // bash/sh
  'html',
  'css',
  'scss',
  'json',
  'yaml',
  'xml',
  'markdown',
  'latex',
];

export const studeoCodeBlock = {
  ...codeBlockOptions,
  supportedLanguages: Object.fromEntries(
    STUDENT_LANGUAGES.map((key) => [key, supported[key]]),
  ),
};
