import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createTestDb } from './helpers';

const mockDb = vi.hoisted(() => ({ current: null as DatabaseSync | null }));

vi.mock('../connection', () => ({
  getDb: () => mockDb.current!,
}));

import { listTasks, getTask, createTask, createTasks, updateTask, deleteTask } from '../repositories/taskRepo';

beforeEach(() => {
  mockDb.current = createTestDb();
});

describe('taskRepo', () => {
  // ── listTasks ───────────────────────────────────────────────────────────────

  describe('listTasks', () => {
    it('returns empty array when no tasks exist', () => {
      expect(listTasks()).toEqual([]);
    });

    it('orders tasks by due_date ascending', () => {
      createTask({ name: 'Later',   dueDate: '2026-09-10' });
      createTask({ name: 'Earlier', dueDate: '2026-09-01' });
      const list = listTasks();
      expect(list[0].name).toBe('Earlier');
      expect(list[1].name).toBe('Later');
    });

    it('returns all tasks', () => {
      createTask({ name: 'T1', dueDate: '2026-09-01' });
      createTask({ name: 'T2', dueDate: '2026-09-02' });
      createTask({ name: 'T3', dueDate: '2026-09-03' });
      expect(listTasks()).toHaveLength(3);
    });
  });

  // ── getTask ─────────────────────────────────────────────────────────────────

  describe('getTask', () => {
    it('returns null for a nonexistent id', () => {
      expect(getTask('nope')).toBeNull();
    });

    it('returns the task for a valid id', () => {
      const t = createTask({ name: 'My Task', dueDate: '2026-09-01' });
      const found = getTask(t.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('My Task');
    });
  });

  // ── createTask ──────────────────────────────────────────────────────────────

  describe('createTask', () => {
    it('creates with default status of not_started', () => {
      const t = createTask({ name: 'New', dueDate: '2026-09-01' });
      expect(t.status).toBe('not_started');
    });

    it('creates with an explicit status', () => {
      const t = createTask({ name: 'Done', dueDate: '2026-09-01', status: 'completed' });
      expect(t.status).toBe('completed');
    });

    it('creates with in_progress status', () => {
      const t = createTask({ name: 'WIP', dueDate: '2026-09-01', status: 'in_progress' });
      expect(t.status).toBe('in_progress');
    });

    it('assigns a unique UUID id', () => {
      const t1 = createTask({ name: 'T1', dueDate: '2026-09-01' });
      const t2 = createTask({ name: 'T2', dueDate: '2026-09-01' });
      expect(t1.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(t1.id).not.toBe(t2.id);
    });

    it('stores due_date correctly', () => {
      const t = createTask({ name: 'T', dueDate: '2026-12-25' });
      expect(t.due_date).toBe('2026-12-25');
    });
  });

  // ── createTasks (batch) ───────────────────────────────────────────────────────

  describe('createTasks', () => {
    it('inserts every row in one batch', () => {
      const created = createTasks([
        { name: 'Reading 1', dueDate: '2026-09-01' },
        { name: 'Reading 2', dueDate: '2026-09-08' },
        { name: 'Reading 3', dueDate: '2026-09-15' },
      ]);
      expect(created).toHaveLength(3);
      expect(listTasks()).toHaveLength(3);
    });

    it('is atomic — a failing row rolls back the whole batch', () => {
      expect(() =>
        createTasks([
          { name: 'Good row', dueDate: '2026-09-01' },
          // NOT NULL violation on name — the insert of this row must fail
          { name: null as unknown as string, dueDate: '2026-09-02' },
        ])
      ).toThrow();
      expect(listTasks()).toHaveLength(0);
    });
  });

  // ── updateTask ──────────────────────────────────────────────────────────────

  describe('updateTask', () => {
    it('updates name', () => {
      const t = createTask({ name: 'Old', dueDate: '2026-09-01' });
      expect(updateTask(t.id, { name: 'New' }).name).toBe('New');
    });

    it('updates status', () => {
      const t = createTask({ name: 'T', dueDate: '2026-09-01' });
      expect(updateTask(t.id, { status: 'in_progress' }).status).toBe('in_progress');
    });

    it('updates dueDate', () => {
      const t = createTask({ name: 'T', dueDate: '2026-09-01' });
      expect(updateTask(t.id, { dueDate: '2026-12-31' }).due_date).toBe('2026-12-31');
    });

    it('returns the unchanged row when input is empty', () => {
      const t = createTask({ name: 'Same', dueDate: '2026-09-01' });
      expect(updateTask(t.id, {}).name).toBe('Same');
    });

    it('can update all fields at once', () => {
      const t = createTask({ name: 'Old', dueDate: '2026-09-01' });
      const u = updateTask(t.id, { name: 'New', status: 'completed', dueDate: '2026-12-31' });
      expect(u.name).toBe('New');
      expect(u.status).toBe('completed');
      expect(u.due_date).toBe('2026-12-31');
    });
  });

  // ── completed_at (Weekly Review) ────────────────────────────────────────────

  describe('completed_at', () => {
    it('is null on a fresh non-completed task', () => {
      expect(createTask({ name: 'T', dueDate: '2026-09-01' }).completed_at).toBeNull();
    });

    it('is stamped on the transition into completed and cleared on the way out', () => {
      const t = createTask({ name: 'T', dueDate: '2026-09-01' });
      expect(updateTask(t.id, { status: 'completed' }).completed_at).not.toBeNull();
      expect(updateTask(t.id, { status: 'not_started' }).completed_at).toBeNull();
    });

    it('does not move when a completed task is re-saved', () => {
      const t = createTask({ name: 'T', dueDate: '2026-09-01', status: 'completed' });
      const stamp = t.completed_at;
      expect(updateTask(t.id, { name: 'Renamed' }).completed_at).toBe(stamp);
    });
  });

  // ── deleteTask ──────────────────────────────────────────────────────────────

  describe('deleteTask', () => {
    it('removes the task', () => {
      const t = createTask({ name: 'Del', dueDate: '2026-09-01' });
      deleteTask(t.id);
      expect(getTask(t.id)).toBeNull();
    });

    it('does not affect other tasks', () => {
      const t1 = createTask({ name: 'Keep', dueDate: '2026-09-01' });
      const t2 = createTask({ name: 'Del',  dueDate: '2026-09-01' });
      deleteTask(t2.id);
      expect(getTask(t1.id)).not.toBeNull();
      expect(listTasks()).toHaveLength(1);
    });

    it('is a no-op for a nonexistent id', () => {
      expect(() => deleteTask('nope')).not.toThrow();
    });
  });
});
