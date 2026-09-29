import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ProjectsPage } from './ProjectsPage.js';
import { EditorPage } from './EditorPage.js';
import { ToastHost } from '../ui/Toast.js';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/p/:projectId" element={<EditorPage />} />
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
      <ToastHost />
    </BrowserRouter>
  );
}
