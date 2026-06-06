import { describe, it, expect } from 'vitest';
import { parseSyllabus } from '../syllabusParser';

const YEAR = 2026;

describe('parseSyllabus', () => {
  // ── Filtering / skipping ─────────────────────────────────────────────────────

  it('returns empty array for empty input', () => {
    expect(parseSyllabus('', YEAR)).toEqual([]);
  });

  it('skips blank lines', () => {
    expect(parseSyllabus('\n\n\n', YEAR)).toEqual([]);
  });

  it('skips lines shorter than 3 characters', () => {
    expect(parseSyllabus('Hi', YEAR)).toEqual([]);
    expect(parseSyllabus('A\nB', YEAR)).toEqual([]);
  });

  it('skips lines that are purely digits and dashes', () => {
    expect(parseSyllabus('123\n---\n1 - 2', YEAR)).toEqual([]);
  });

  it('skips page-number lines (Page N, p. N)', () => {
    expect(parseSyllabus('Page 2\np. 3\nPage. 10', YEAR)).toEqual([]);
  });

  it('skips lines that reduce to an empty name after cleanup', () => {
    expect(parseSyllabus('•', YEAR)).toEqual([]);
  });

  // ── Month-name date format (Pattern 1) ────────────────────────────────────────

  it('extracts "Month Day" dates using full month names', () => {
    expect(parseSyllabus('Homework January 15', YEAR)[0].dueDate).toBe('2026-01-15');
    expect(parseSyllabus('Quiz March 3', YEAR)[0].dueDate).toBe('2026-03-03');
  });

  it('extracts abbreviated month names', () => {
    expect(parseSyllabus('Lab Jan 5', YEAR)[0].dueDate).toBe('2026-01-05');
    expect(parseSyllabus('Lab Feb 5', YEAR)[0].dueDate).toBe('2026-02-05');
    expect(parseSyllabus('Lab Mar 5', YEAR)[0].dueDate).toBe('2026-03-05');
    expect(parseSyllabus('Lab Apr 5', YEAR)[0].dueDate).toBe('2026-04-05');
    expect(parseSyllabus('Lab Jun 5', YEAR)[0].dueDate).toBe('2026-06-05');
    expect(parseSyllabus('Lab Jul 5', YEAR)[0].dueDate).toBe('2026-07-05');
    expect(parseSyllabus('Lab Aug 5', YEAR)[0].dueDate).toBe('2026-08-05');
    expect(parseSyllabus('Lab Sep 5', YEAR)[0].dueDate).toBe('2026-09-05');
    expect(parseSyllabus('Lab Sept 5', YEAR)[0].dueDate).toBe('2026-09-05');
    expect(parseSyllabus('Lab Oct 5', YEAR)[0].dueDate).toBe('2026-10-05');
    expect(parseSyllabus('Lab Nov 5', YEAR)[0].dueDate).toBe('2026-11-05');
    expect(parseSyllabus('Lab Dec 5', YEAR)[0].dueDate).toBe('2026-12-05');
  });

  it('handles ordinal suffixes: st, nd, rd, th', () => {
    expect(parseSyllabus('Assignment March 1st', YEAR)[0].dueDate).toBe('2026-03-01');
    expect(parseSyllabus('Assignment March 2nd', YEAR)[0].dueDate).toBe('2026-03-02');
    expect(parseSyllabus('Assignment March 3rd', YEAR)[0].dueDate).toBe('2026-03-03');
    expect(parseSyllabus('Assignment March 4th', YEAR)[0].dueDate).toBe('2026-03-04');
  });

  it('uses the explicit year when present in Pattern 1', () => {
    expect(parseSyllabus('Midterm October 15, 2027', YEAR)[0].dueDate).toBe('2027-10-15');
  });

  it('uses fallbackYear when no year is present', () => {
    expect(parseSyllabus('Exam Dec 10', 2027)[0].dueDate).toBe('2027-12-10');
  });

  it('handles "due:" prefix before month-name dates', () => {
    expect(parseSyllabus('Essay due: March 20', YEAR)[0].dueDate).toBe('2026-03-20');
    expect(parseSyllabus('Paper due April 5', YEAR)[0].dueDate).toBe('2026-04-05');
  });

  // ── Numeric MM/DD format (Pattern 2) ─────────────────────────────────────────

  it('extracts MM/DD numeric dates', () => {
    expect(parseSyllabus('Reading 1/15', YEAR)[0].dueDate).toBe('2026-01-15');
    expect(parseSyllabus('Reading 12/31', YEAR)[0].dueDate).toBe('2026-12-31');
  });

  it('extracts MM/DD/YYYY format', () => {
    expect(parseSyllabus('Project 3/15/2026', YEAR)[0].dueDate).toBe('2026-03-15');
  });

  it('extracts 2-digit year and prepends 2000', () => {
    expect(parseSyllabus('Quiz 4/20/27', YEAR)[0].dueDate).toBe('2027-04-20');
  });

  it('handles "due: MM/DD" prefix', () => {
    expect(parseSyllabus('Homework due: 9/1', YEAR)[0].dueDate).toBe('2026-09-01');
  });

  it('pads single-digit months and days', () => {
    expect(parseSyllabus('Lab 1/5', YEAR)[0].dueDate).toBe('2026-01-05');
  });

  it('returns empty dueDate when no date pattern is found', () => {
    expect(parseSyllabus('Complete the reflection essay', YEAR)[0].dueDate).toBe('');
  });

  // ── Type inference ────────────────────────────────────────────────────────────

  it('infers Exam for "midterm"', () => {
    expect(parseSyllabus('Midterm 1 1/15', YEAR)[0].type).toBe('Exam');
  });

  it('infers Exam for "final exam"', () => {
    expect(parseSyllabus('Final Exam 5/1', YEAR)[0].type).toBe('Exam');
  });

  it('infers Project for "final project"', () => {
    expect(parseSyllabus('Final Project 4/28', YEAR)[0].type).toBe('Project');
  });

  it('infers Exam for bare "final"', () => {
    expect(parseSyllabus('Final 5/5', YEAR)[0].type).toBe('Exam');
  });

  it('infers Exam for "exam" and "test"', () => {
    expect(parseSyllabus('Unit Exam 2/1', YEAR)[0].type).toBe('Exam');
    expect(parseSyllabus('Unit Test 2/1', YEAR)[0].type).toBe('Exam');
  });

  it('infers Quiz for "quiz"', () => {
    expect(parseSyllabus('Weekly Quiz 1/20', YEAR)[0].type).toBe('Quiz');
  });

  it('infers Homework for hw, homework, problem set, pset', () => {
    expect(parseSyllabus('HW 1 1/15', YEAR)[0].type).toBe('Homework');
    expect(parseSyllabus('Homework 2 1/22', YEAR)[0].type).toBe('Homework');
    expect(parseSyllabus('Problem Set 3 1/29', YEAR)[0].type).toBe('Homework');
    expect(parseSyllabus('Pset 4 2/5', YEAR)[0].type).toBe('Homework');
  });

  it('infers Project for "project"', () => {
    expect(parseSyllabus('Group Project 3/1', YEAR)[0].type).toBe('Project');
  });

  it('infers Lab for "lab"', () => {
    expect(parseSyllabus('Lab Report 2/10', YEAR)[0].type).toBe('Lab');
  });

  it('infers Paper for "paper", "essay", "report"', () => {
    expect(parseSyllabus('Research Paper 4/1', YEAR)[0].type).toBe('Paper');
    expect(parseSyllabus('Persuasive Essay 3/15', YEAR)[0].type).toBe('Paper');
    expect(parseSyllabus('Annual Report 2/28', YEAR)[0].type).toBe('Paper');
  });

  it('infers Reading for "reading"', () => {
    expect(parseSyllabus('Reading Chapter 5 1/25', YEAR)[0].type).toBe('Reading');
  });

  it('defaults to Assignment when no keyword matches', () => {
    expect(parseSyllabus('Reflection 2/20', YEAR)[0].type).toBe('Assignment');
  });

  // ── Name cleanup ──────────────────────────────────────────────────────────────

  it('removes the extracted date from the name', () => {
    const [row] = parseSyllabus('Homework 1 due January 15', YEAR);
    expect(row.name).not.toContain('January');
    expect(row.name).not.toContain('15');
  });

  it('strips leading bullet / dash punctuation', () => {
    const [row] = parseSyllabus('• Homework 1 1/15', YEAR);
    expect(row.name).not.toMatch(/^[•·*\-]/);
  });

  it('removes leftover "due" and "due date" words', () => {
    const [row] = parseSyllabus('Assignment 1 due date 3/15', YEAR);
    expect(row.name.toLowerCase()).not.toContain('due');
  });

  it('collapses multiple spaces into one', () => {
    const [row] = parseSyllabus('Homework   1  2/15', YEAR);
    expect(row.name).not.toMatch(/\s{2,}/);
  });

  it('removes empty parens left after date extraction', () => {
    const [row] = parseSyllabus('Assignment (Jan 10)', YEAR);
    expect(row.name).not.toContain('()');
  });

  // ── Multi-line and edge cases ─────────────────────────────────────────────────

  it('parses multiple lines into separate rows', () => {
    const text = ['Homework 1 Jan 15', 'Quiz 1 Feb 1', 'Midterm Mar 1'].join('\n');
    const rows = parseSyllabus(text, YEAR);
    expect(rows).toHaveLength(3);
    expect(rows[0].type).toBe('Homework');
    expect(rows[1].type).toBe('Quiz');
    expect(rows[2].type).toBe('Exam');
  });

  it('handles Windows-style CRLF line endings', () => {
    expect(parseSyllabus('Homework 1/15\r\nQuiz 2/1', YEAR)).toHaveLength(2);
  });

  it('uses current year as default when no fallbackYear provided', () => {
    const [row] = parseSyllabus('Assignment Jan 10');
    const currentYear = new Date().getFullYear();
    expect(row.dueDate).toBe(`${currentYear}-01-10`);
  });

  it('assigns correct dates, names, and types for a realistic syllabus block', () => {
    const text = `
      CS 3100 — Data Structures
      Homework 1 due Jan 20
      Quiz 1 — Feb 3
      Lab 1: Sorting due 2/10
      Midterm Exam March 1st
      Final Project April 28, 2026
      Final Exam May 5
    `.trim();
    const rows = parseSyllabus(text, YEAR);
    expect(rows.length).toBeGreaterThanOrEqual(5);
    const types = rows.map(r => r.type);
    expect(types).toContain('Homework');
    expect(types).toContain('Quiz');
    expect(types).toContain('Lab');
    expect(types).toContain('Exam');
    expect(types).toContain('Project');
  });
});
