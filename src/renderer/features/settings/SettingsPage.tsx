import { Sun } from 'lucide-react';
import { SectionHeading, SettingsCard, SettingsRow } from './components';
import ThemePicker from './ThemePicker';
import NotificationsSection from './NotificationsSection';
import StudyTimerSection from './StudyTimerSection';
import MusicSection from './MusicSection';
import SemestersSection from './SemestersSection';
import TipsSection from './TipsSection';
import AboutSection from './AboutSection';

// Pure assembly — each section owns its own state and data fetching.
// Order is intentional: things you set once and feel everywhere (Appearance,
// Notifications) first, daily-use preferences next (timer, music), data
// management after that, and reference material (tips, About) at the end.

export default function SettingsPage() {
  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-ink mb-1">Settings</h1>
      <p className="text-sm text-muted mb-8">Preferences for Studeo</p>

      <div className="mb-8">
        <SectionHeading>Appearance</SectionHeading>
        <SettingsCard>
          <SettingsRow icon={<Sun size={17} />} label="Theme" description="Choose your preferred color theme" />
          <div className="px-5 pb-4">
            <ThemePicker />
          </div>
        </SettingsCard>
      </div>

      <NotificationsSection />
      <StudyTimerSection />
      <MusicSection />
      <SemestersSection />
      <TipsSection />
      <AboutSection />
    </div>
  );
}
