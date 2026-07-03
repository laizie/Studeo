import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './Layout';
import DashboardPage from '../features/dashboard/DashboardPage';
import CoursesPage from '../features/courses/CoursesPage';
import CourseDetailPage from '../features/courses/CourseDetailPage';
import ThisWeekPage from '../features/thisweek/ThisWeekPage';
import TasksPage from '../features/tasks/TasksPage';
import CalendarPage from '../features/calendar/CalendarPage';
import StudyPage from '../features/study/StudyPage';
import SettingsPage from '../features/settings/SettingsPage';
import BatchAddPage from '../features/courses/BatchAddPage';
import ImportFeedPage from '../features/import/ImportFeedPage';
import SetupWizardPage from '../features/setup/SetupWizardPage';
import NotebooksLandingPage from '../features/notes/NotebooksLandingPage';
import LooseNotesPage from '../features/notes/LooseNotesPage';
import ClassNotebookPage from '../features/notes/ClassNotebookPage';

// The note editor pulls in BlockNote (heavy). Lazy-load it so that bundle splits into its
// own chunk and only downloads when a note is actually opened (M0 finding / plan §6.3).
const NoteEditorPage = lazy(() => import('../features/notes/NoteEditorPage'));

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="courses" element={<CoursesPage />} />
          <Route path="courses/:id" element={<CourseDetailPage />} />
          <Route path="courses/:id/batch" element={<BatchAddPage />} />
          <Route path="setup" element={<SetupWizardPage />} />
          <Route path="import" element={<ImportFeedPage />} />
          <Route path="this-week" element={<ThisWeekPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="study" element={<StudyPage />} />
          <Route path="notes" element={<NotebooksLandingPage />} />
          <Route path="notes/loose" element={<LooseNotesPage />} />
          <Route path="notes/class/:courseId" element={<ClassNotebookPage />} />
          <Route
            path="notes/:id"
            element={
              <Suspense fallback={<div className="p-10 text-muted">Loading editor…</div>}>
                <NoteEditorPage />
              </Suspense>
            }
          />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
