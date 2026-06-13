import { useState } from 'react';
import { Info, FolderOpen, HardDriveDownload } from 'lucide-react';
import { version as appVersion } from '../../../../package.json';
import { SectionHeading, SettingsCard, SettingsRow, CardButton } from './components';

export default function AboutSection() {
  const [backupState, setBackupState] = useState<'idle' | 'saving' | 'done' | 'failed'>('idle');
  const [backupDetail, setBackupDetail] = useState('');

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

  const backupDescription =
    backupState === 'done'   ? `Saved to ${backupDetail}`
    : backupState === 'failed' ? `Backup failed${backupDetail ? ` — ${backupDetail}` : ''}. Please try again.`
    : 'Save a snapshot of your database (note images are copied alongside it) — a safe copy before big changes';

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
      </SettingsCard>
    </div>
  );
}
