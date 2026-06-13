import { codeBlockOptions } from '@blocknote/code-block';

// M0 finding: BlockNote's default code block lists all 48 Shiki languages, each shipped as
// its own lazy grammar chunk. Students don't need 48. We trim the *menu* to a focused set;
// the grammars still load on demand (only when a block actually uses that language), and
// limiting the list means we never offer one whose grammar we wouldn't want loaded.
const supported = codeBlockOptions.supportedLanguages;

// Typed against the real key set, so a typo or a key removed upstream is a compile error.
const STUDENT_LANGUAGES: (keyof typeof supported)[] = [
  'text',
  'javascript',
  'typescript',
  'python',
  'java',
  'c',
  'cpp',
  'csharp',
  'html',
  'css',
  'sql',
  'shellscript', // bash/sh
  'json',
  'markdown',
];

export const studeoCodeBlock = {
  ...codeBlockOptions,
  supportedLanguages: Object.fromEntries(
    STUDENT_LANGUAGES.map((key) => [key, supported[key]]),
  ),
};
