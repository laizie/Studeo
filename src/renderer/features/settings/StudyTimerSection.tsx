import { Timer, Coffee, Moon, Volume2 } from 'lucide-react';
import { useTimerStore, FOCUS_OPTIONS, BREAK_OPTIONS, LONG_BREAK_OPTIONS } from '../../store/useTimerStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { SectionHeading, SettingsCard, SettingsRow, PillGroup, Toggle } from './components';

export default function StudyTimerSection() {
  const { focusSecs, breakSecs, longBreakSecs, setFocusMins, setBreakMins, setLongBreakMins } = useTimerStore();
  const { timerSoundEnabled, setTimerSoundEnabled } = useSettingsStore();

  return (
    <div className="mb-8">
      <SectionHeading>Study timer</SectionHeading>
      <SettingsCard>
        <SettingsRow
          icon={<Timer size={17} />}
          label="Focus duration"
          description="Default length of a focus session"
        >
          <PillGroup
            options={FOCUS_OPTIONS}
            value={focusSecs / 60}
            onChange={setFocusMins}
            suffix=" min"
          />
        </SettingsRow>
        <SettingsRow
          icon={<Coffee size={17} />}
          label="Break duration"
          description="Default length of a break"
        >
          <PillGroup
            options={BREAK_OPTIONS}
            value={breakSecs / 60}
            onChange={setBreakMins}
            suffix=" min"
          />
        </SettingsRow>
        <SettingsRow
          icon={<Moon size={17} />}
          label="Long break duration"
          description="Every 4th focus session earns a long break"
        >
          <PillGroup
            options={LONG_BREAK_OPTIONS}
            value={longBreakSecs / 60}
            onChange={setLongBreakMins}
            suffix=" min"
          />
        </SettingsRow>
        <SettingsRow
          icon={<Volume2 size={17} />}
          label="Sound when a phase ends"
          description="A soft chime when focus or break time is up"
        >
          <Toggle checked={timerSoundEnabled} onChange={setTimerSoundEnabled} />
        </SettingsRow>
      </SettingsCard>
      <p className="text-xs text-muted mt-2 px-1">
        Auto-advance between phases lives on the Study page, next to the timer it controls.
      </p>
    </div>
  );
}
