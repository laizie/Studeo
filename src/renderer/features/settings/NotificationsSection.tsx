import { useState } from 'react';
import { Bell, Hourglass, CalendarCheck, Clock } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { SectionHeading, SettingsCard, SettingsRow, PillGroup, Toggle, CardButton, SETTINGS_INPUT } from './components';

const REMINDER_LEAD_OPTIONS = [5, 10, 15, 30] as const;

export default function NotificationsSection() {
  const {
    classRemindersEnabled, setClassRemindersEnabled,
    reminderLeadMinutes, setReminderLeadMinutes,
    dueDigestEnabled, setDueDigestEnabled,
    dueDigestTime, setDueDigestTime,
  } = useSettingsStore();

  const [testState, setTestState] = useState<'idle' | 'sent' | 'unsupported'>('idle');

  async function handleTest() {
    try {
      const { supported } = await window.api.reminders.test();
      setTestState(supported ? 'sent' : 'unsupported');
    } catch {
      setTestState('unsupported');
    }
  }

  return (
    <div className="mb-8">
      <SectionHeading>Notifications</SectionHeading>
      <SettingsCard>
        <SettingsRow
          icon={<Bell size={17} />}
          label="Remind me before class"
          description="Desktop notification before each scheduled class time"
        >
          <Toggle checked={classRemindersEnabled} onChange={setClassRemindersEnabled} />
        </SettingsRow>
        {classRemindersEnabled && (
          <SettingsRow
            icon={<Hourglass size={17} />}
            label="Lead time"
            description="How early the reminder fires"
          >
            <PillGroup
              options={REMINDER_LEAD_OPTIONS}
              value={reminderLeadMinutes}
              onChange={setReminderLeadMinutes}
              suffix=" min"
            />
          </SettingsRow>
        )}
        <SettingsRow
          icon={<CalendarCheck size={17} />}
          label="Daily due-date digest"
          description="One notification listing what's due today and tomorrow"
        >
          <Toggle checked={dueDigestEnabled} onChange={setDueDigestEnabled} />
        </SettingsRow>
        {dueDigestEnabled && (
          <SettingsRow
            icon={<Clock size={17} />}
            label="Digest time"
            description="When the daily digest arrives"
          >
            <input
              type="time"
              value={dueDigestTime}
              onChange={e => setDueDigestTime(e.target.value)}
              aria-label="Daily digest time"
              className={SETTINGS_INPUT}
            />
          </SettingsRow>
        )}
        {/* Test row — reminders are silent failures by nature; let the user
            prove notifications actually reach their screen before relying on them. */}
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          <p className="text-xs text-muted" aria-live="polite">
            {testState === 'sent'
              // In dev the app runs under the stock Electron binary, so macOS
              // lists it as "Electron" in notification settings, not "Studeo".
              ? `Sent! Nothing appeared? Check System Settings → Notifications → ${import.meta.env.DEV ? 'Electron' : 'Studeo'}, and that Focus is off.`
              : testState === 'unsupported'
                ? "Desktop notifications aren't available on this system."
                : 'Not sure notifications will show up?'}
          </p>
          <CardButton onClick={handleTest}>Send a test</CardButton>
        </div>
      </SettingsCard>
    </div>
  );
}
