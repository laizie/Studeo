import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './Layout';
import DashboardPage from '../features/dashboard/DashboardPage';
import CoursesPage from '../features/courses/CoursesPage';
import ThisWeekPage from '../features/thisweek/ThisWeekPage';
import TasksPage from '../features/tasks/TasksPage';
import CalendarPage from '../features/calendar/CalendarPage';
import StudyPage from '../features/study/StudyPage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="courses" element={<CoursesPage />} />
          <Route path="this-week" element={<ThisWeekPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="study" element={<StudyPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
