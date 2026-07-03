import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { useTerms, useCreateTerm, useUpdateTerm } from '../../lib/queries/useTerms';
import { suggestTermName } from '../../../shared/semesterSetup';
import StepIndicator from './StepIndicator';
import TermStep from './TermStep';
import CoursesStep from './CoursesStep';
import MeetingsStep from './MeetingsStep';
import DoneStep from './DoneStep';

/**
 * "New semester" wizard. Chains the term → courses → class-times → import flows
 * that otherwise live on separate screens. Each step commits immediately via the
 * existing mutations (so step 3 can read back the courses step 2 created); the
 * term id is the thread tying the steps together.
 */
export default function SetupWizardPage() {
  const [step, setStep] = useState(1);
  const [termId, setTermId] = useState<string | null>(null);

  const { data: terms = [] } = useTerms();
  const createTerm = useCreateTerm();
  const updateTerm = useUpdateTerm();

  const suggestedName = useMemo(() => suggestTermName(), []);
  const term = terms.find(t => t.id === termId);

  async function handleTermContinue(v: { name: string; startDate: string; endDate: string }) {
    try {
      if (termId) {
        await updateTerm.mutateAsync({
          id: termId,
          input: { name: v.name, startDate: v.startDate || null, endDate: v.endDate || null },
        });
      } else {
        const created = await createTerm.mutateAsync({
          name: v.name,
          startDate: v.startDate || undefined,
          endDate: v.endDate || undefined,
        });
        setTermId(created.id);
      }
      setStep(2);
    } catch {
      return; // TermStep renders the error from the mutation flags
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      {/* Exit affordance — nothing is lost; a created term persists in Settings */}
      <div className="mb-6 flex justify-end">
        <Link
          to="/courses"
          className="flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink-soft"
        >
          <X size={15} />
          Exit setup
        </Link>
      </div>

      <StepIndicator current={step} />

      <div className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-sm">
        {step === 1 && (
          <TermStep
            initialName={term?.name ?? suggestedName}
            initialStart={term?.start_date ?? ''}
            initialEnd={term?.end_date ?? ''}
            saving={createTerm.isPending || updateTerm.isPending}
            error={createTerm.isError || updateTerm.isError}
            onContinue={handleTermContinue}
          />
        )}

        {step === 2 && termId && (
          <CoursesStep termId={termId} onBack={() => setStep(1)} onNext={() => setStep(3)} />
        )}

        {step === 3 && termId && (
          <MeetingsStep termId={termId} onBack={() => setStep(2)} onNext={() => setStep(4)} />
        )}

        {step === 4 && termId && (
          <DoneStep termId={termId} onBack={() => setStep(3)} />
        )}
      </div>
    </div>
  );
}
