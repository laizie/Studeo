import { describe, it, expect } from 'vitest';
import { detectCodeLanguage } from '../detectLanguage';

describe('detectCodeLanguage', () => {
  it('returns null for snippets too short to judge', () => {
    expect(detectCodeLanguage('x = 1')).toBeNull();
    expect(detectCodeLanguage('   ')).toBeNull();
  });

  it('detects common languages from distinctive code', () => {
    expect(detectCodeLanguage('def greet(name):\n    print(f"hi {name}")')).toBe('python');
    expect(detectCodeLanguage('const sum = (a, b) => a + b;\nconsole.log(sum(1, 2));')).toBe('javascript');
    expect(detectCodeLanguage('interface User { name: string; age: number; }')).toBe('typescript');
    expect(detectCodeLanguage('public class Main { public static void main(String[] a) {} }')).toBe('java');
    expect(detectCodeLanguage('#include <iostream>\nint main(){ std::cout << "hi"; }')).toBe('cpp');
    expect(detectCodeLanguage('fn main() {\n    let mut x = 5;\n    println!("{}", x);\n}')).toBe('rust');
    expect(detectCodeLanguage('SELECT id, name FROM users WHERE age > 18;')).toBe('sql');
    expect(detectCodeLanguage('<!DOCTYPE html>\n<html><body><p>hi</p></body></html>')).toBe('html');
  });

  it('detects php and shell by their strong markers', () => {
    expect(detectCodeLanguage('<?php echo "hello world"; $x = 1; ?>')).toBe('php');
    expect(detectCodeLanguage('#!/bin/bash\nfor f in *.txt; do echo "$f"; done')).toBe('shellscript');
  });

  it('returns null when the snippet is genuinely ambiguous', () => {
    // Bare assignments / arithmetic match nothing distinctive.
    expect(detectCodeLanguage('a = b + c\nd = e * f\ng = h - i')).toBeNull();
  });
});
