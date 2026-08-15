import { useEffect, useState } from 'react';
import { Bell, Hourglass, CalendarCheck, Clock, Power } from 'lucide-react';
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

  const [testState, setTestState] = useState<'idle' | 'sent' | 'suppressed' | 'unsupported'>('idle');

  // Start-at-login lives in the OS, not in our settings — read it from there on mount
  // and after every change, so this switch shows what's actually true even if it was
  // turned off in System Settings.
  const [loginItem, setLoginItem] = useState<{ supported: boolean; openAtLogin: boolean }>({
    supported: false, openAtLogin: false,
  });

  useEffect(() => {
    let active = true;
    window.api.app.getLoginItem()
      .then(state => { if (active) setLoginItem(state); })
      .catch(() => { /* leave it off and disabled rather than guess */ });
    return () => { active = false; };
  }, []);

  async function handleLoginItemChange(enabled: boolean) {
    try {
      setLoginItem(await window.api.app.setLoginItem(enabled));
    } catch {
      setLoginItem(await window.api.app.getLoginItem().catch(() => loginItem));
    }
  }

  async function handleTest() {
    try {
      const { supported, shown } = await window.api.reminders.test();
      setTestState(!supported ? 'unsupported' : shown ? 'sent' : 'suppressed');
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
        {/* Reminders and the menu-bar "Up next" item only run while Studeo is open,
            so this is the switch that decides whether they survive a restart. */}
        <SettingsRow
          icon={<Power size={17} />}
          label="Start Studeo when I log in"
          description={
            loginItem.supported
              ? 'Reminders only run while Studeo is open — this keeps them working after a restart'
              : import.meta.env.DEV
                ? 'Unavailable while running in development — works in the installed app'
                : 'Not available on this system'
          }
        >
          <Toggle
            checked={loginItem.openAtLogin}
            onChange={handleLoginItemChange}
            disabled={!loginItem.supported}
          />
        </SettingsRow>
        {/* Test row — reminders are silent failures by nature; let the user
            prove notifications actually reach their screen before relying on them. */}
        <div className="flex items-center justify-between gap-4 px-5 py-3">
          <p className="text-xs text-muted" aria-live="polite">
            {testState === 'sent'
              // In dev the app runs under the stock Electron binary, so macOS
              // lists it as "Electron" in notification settings, not "Studeo".
              ? 'Sent — you should have seen it just now.'
              : testState === 'suppressed'
                // The OS took it and never displayed it, which is a different problem
                // from "this platform can't do notifications" and has a different fix.
                ? `Sent, but your system didn't display it. Check System Settings → Notifications → ${import.meta.env.DEV ? 'Electron' : 'Studeo'}, and that Focus is off.`
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
