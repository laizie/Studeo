import { ipcMain } from 'electron';
import { IPC } from '../../shared/types';
import type { CreateTermInput, UpdateTermInput } from '../../shared/types';
import { listTerms, createTerm, updateTerm, deleteTerm } from '../db/repositories/termRepo';

export function registerTermHandlers(): void {
  ipcMain.handle(IPC.TERMS.LIST, () => listTerms());

  ipcMain.handle(IPC.TERMS.CREATE, (_event, input: CreateTermInput) => {
    if (!input.name?.trim()) throw new Error('Semester name is required');
    return createTerm(input);
  });

  ipcMain.handle(IPC.TERMS.UPDATE, (_event, id: string, input: UpdateTermInput) => {
    if (!id) throw new Error('Term id is required');
    return updateTerm(id, input);
  });

  ipcMain.handle(IPC.TERMS.DELETE, (_event, id: string) => {
    if (!id) throw new Error('Term id is required');
    deleteTerm(id);
  });
}
