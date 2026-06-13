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

// THROWAWAY M0 SPIKE — lazy so the heavy BlockNote bundle splits into its own chunk.
// Delete this import, the route below, and src/renderer/features/_spike/ before M1.
const NotesSpike = lazy(() => import('../features/_spike/NotesSpike'));

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="courses" element={<CoursesPage />} />
          <Route path="courses/:id" element={<CourseDetailPage />} />
          <Route path="courses/:id/batch" element={<BatchAddPage />} />
          <Route path="this-week" element={<ThisWeekPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="study" element={<StudyPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route
            path="notes-spike"
            element={
              <Suspense fallback={<div className="p-8 text-muted">Loading editor…</div>}>
                <NotesSpike />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </HashRouter>
  );
}
