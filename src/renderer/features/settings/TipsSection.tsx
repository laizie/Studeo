import { Keyboard, Layers, GraduationCap, ListTodo } from 'lucide-react';
import { SectionHeading, SettingsCard, TipCard } from './components';

// Four tips, deliberately: the features the UI can't teach by itself.
// Anything self-evident on screen (status toggles, timer buttons) stays out.
export default function TipsSection() {
  return (
    <div className="mb-8">
      <SectionHeading>How to use Studeo efficiently</SectionHeading>
      <SettingsCard>
        <TipCard icon={<Keyboard size={16} />} title="Quick Add — ⌘N (or Ctrl+N on Windows)">
          Press this shortcut from any screen to instantly add an assignment or task without
          leaving what you're doing. The dialog remembers which tab (Assignment vs Task) you
          last used.
        </TipCard>
        <TipCard icon={<Layers size={16} />} title="Enter a whole semester in minutes">
          On any course's detail page, click <strong>Batch add</strong>. Paste your syllabus
          text to extract names, types, and due dates automatically — or type one row like
          "Homework 1" and use the <strong>repeat</strong> button to generate the weekly
          series through the end of the term.
        </TipCard>
        <TipCard icon={<GraduationCap size={16} />} title="Track your grade as scores come back">
          Edit an assignment to record what you earned ("18 out of 20"), and set per-type
          weights in the <strong>Grade weights</strong> card on the course page. Your current
          standing shows on the course card and header. Big assignment? Use the checklist
          icon on its row to break it into steps.
        </TipCard>
        <TipCard icon={<ListTodo size={16} />} title="Build a Focus List for your session">
          On the Study page, click <strong>Add</strong> next to "Today's Focus List" to pick
          assignments and tasks you want to tackle that session. Check them off as you go —
          checking an item marks it complete across the whole app, so your progress stays
          in sync everywhere.
        </TipCard>
      </SettingsCard>
    </div>
  );
}
