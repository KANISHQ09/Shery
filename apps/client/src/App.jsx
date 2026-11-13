import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// ── Landing page (public, no auth) ────────────────────────
const LandingPage = lazy(() => import('./pages/LandingPage'));

// ── Lazy loaded pages ─────────────────────────────────────
const LoginPage         = lazy(() => import('./pages/LoginPage'));
const HomePage          = lazy(() => import('./pages/HomePage'));
const DashboardPage     = lazy(() => import('./pages/DashboardPage'));
const CoursePage        = lazy(() => import('./pages/CoursePage'));
const LessonPage        = lazy(() => import('./pages/LessonPage'));
const QuizPage          = lazy(() => import('./pages/QuizPage'));
const InstructorPage    = lazy(() => import('./pages/InstructorPage'));
const CreateCoursePage  = lazy(() => import('./pages/CreateCoursePage'));
const CourseManagerPage = lazy(() => import('./pages/CourseManagerPage'));
const NotFoundPage      = lazy(() => import('./pages/NotFoundPage'));

// ── Loading spinner ───────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] px-6 text-white">
      <div className="w-full max-w-[360px] text-center">
        <div className="mb-6 text-xl font-black tracking-tight">
          SHERY <span className="text-accent">AI</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
          <div className="h-full w-2/3 animate-[landingLoad_1.15s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-accent via-orange-400 to-amber-300" />
        </div>
        <p className="mt-4 text-[13px] font-medium text-muted-text">Preparing your learning space...</p>
      </div>
    </div>
  );
}

// Redirect to /login if no role is set
function RoleGuard({ children }) {
  const location = useLocation();
  const role = localStorage.getItem('demo_role');
  if (!role) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#1a1a1a',
            color: '#ffffff',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px',
            fontSize: '13px',
            fontFamily: 'Inter, sans-serif',
          },
          success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
          error:   { iconTheme: { primary: '#e8572a', secondary: '#fff' } },
        }}
      />

      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public */}
          <Route path="/login"  element={<LoginPage />} />
          <Route path="/"       element={<LandingPage />} />
          <Route path="/home"   element={<HomePage />} />

          {/* Role-guarded (just needs any demo role set) */}
          <Route path="/dashboard"                   element={<RoleGuard><DashboardPage /></RoleGuard>} />
          <Route path="/course/:courseId"            element={<RoleGuard><CoursePage /></RoleGuard>} />
          <Route path="/lesson/:lessonId"            element={<RoleGuard><LessonPage /></RoleGuard>} />
          <Route path="/lesson/:lessonId/quiz"       element={<RoleGuard><QuizPage /></RoleGuard>} />
          <Route path="/instructor"                  element={<RoleGuard><InstructorPage /></RoleGuard>} />
          <Route path="/instructor/create-course"    element={<RoleGuard><CreateCoursePage /></RoleGuard>} />
          <Route path="/instructor/course/:courseId" element={<RoleGuard><CourseManagerPage /></RoleGuard>} />
          

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
