import { useState } from 'react';
import { Info, FolderOpen, HardDriveDownload, HardDriveUpload } from 'lucide-react';
import { version as appVersion } from '../../../../package.json';
import { SectionHeading, SettingsCard, SettingsRow, CardButton } from './components';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function AboutSection() {
  const [backupState, setBackupState] = useState<'idle' | 'saving' | 'done' | 'failed'>('idle');
  const [backupDetail, setBackupDetail] = useState('');

  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoreState, setRestoreState] = useState<'idle' | 'restoring' | 'done' | 'failed'>('idle');
  const [restoreDetail, setRestoreDetail] = useState('');

  async function handleBackup() {
    setBackupState('saving');
    try {
      const result = await window.api.app.backupData();
      if (result.saved) {
        setBackupState('done');
        setBackupDetail(result.path ?? '');
      } else if (result.error) {
        setBackupState('failed');
        setBackupDetail(result.error);
      } else {
        setBackupState('idle'); // user canceled the save dialog — not an error
      }
    } catch {
      setBackupState('failed');
      setBackupDetail('');
    }
  }

  async function handleRestore() {
    setRestoreConfirmOpen(false);
    setRestoreState('restoring');
    try {
      const result = await window.api.app.restoreData();
      // On success the app relaunches, so we usually never reach the "done" UI —
      // but set it anyway in case the relaunch is delayed.
      if (result.restored) {
        setRestoreState('done');
      } else if (result.error) {
        setRestoreState('failed');
        setRestoreDetail(result.error);
      } else {
        setRestoreState('idle'); // user canceled the file picker — not an error
      }
    } catch {
      setRestoreState('failed');
      setRestoreDetail('');
    }
  }

  const backupDescription =
    backupState === 'done'   ? `Saved to ${backupDetail}`
    : backupState === 'failed' ? `Backup failed${backupDetail ? ` — ${backupDetail}` : ''}. Please try again.`
    : 'Save a snapshot of your database (note images are copied alongside it) — a safe copy before big changes';

  const restoreDescription =
    restoreState === 'restoring' ? 'Restoring… the app will restart in a moment.'
    : restoreState === 'done'     ? 'Restored — restarting…'
    : restoreState === 'failed'   ? `Restore failed${restoreDetail ? ` — ${restoreDetail}` : ''}. Your data was not changed.`
    : 'Replace your current data with a backup file. A safety copy of your current data is saved first.';

  return (
    <div>
      <SectionHeading>About</SectionHeading>
      <SettingsCard>
        <SettingsRow
          icon={<Info size={17} />}
          label={`Studeo ${appVersion}`}
          description="Local-first — everything you enter stays in a database on this device."
        />
        <SettingsRow
          icon={<FolderOpen size={17} />}
          label="Your data"
          description="One SQLite file in your app data folder"
        >
          <CardButton onClick={() => window.api.app.revealData()}>
            Show file
          </CardButton>
        </SettingsRow>
        <SettingsRow
          icon={<HardDriveDownload size={17} />}
          label="Back up"
          description={backupDescription}
        >
          <CardButton onClick={handleBackup} disabled={backupState === 'saving'}>
            {backupState === 'saving' ? 'Saving…' : 'Back up now…'}
          </CardButton>
        </SettingsRow>
        <SettingsRow
          icon={<HardDriveUpload size={17} />}
          label="Restore from backup"
          description={restoreDescription}
        >
          <CardButton
            onClick={() => setRestoreConfirmOpen(true)}
            disabled={restoreState === 'restoring' || restoreState === 'done'}
          >
            {restoreState === 'restoring' ? 'Restoring…' : 'Restore…'}
          </CardButton>
        </SettingsRow>
      </SettingsCard>

      <ConfirmDialog
        isOpen={restoreConfirmOpen}
        title="Restore from a backup?"
        message="This replaces all of your current courses, assignments, notes, and settings with the backup you choose. A safety copy of your current data is saved first, and the app will restart."
        confirmLabel="Restore"
        onConfirm={handleRestore}
        onClose={() => setRestoreConfirmOpen(false)}
      />
    </div>
  );
}
