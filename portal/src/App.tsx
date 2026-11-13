import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { APP_ENV } from './api';
import { AuthProvider, homeOf, useAuth } from './auth';
import { ConfirmProvider } from './kit';
import { Shell } from './layout';
import { Account } from './pages/Account';
import { AdminDashboard } from './pages/AdminDashboard';
import { Login } from './pages/Login';
import { SchoolDashboard } from './pages/SchoolDashboard';
import { SchoolProvider, useSchool } from './school/ctx';
import { Empty, Loading, PageHead, ToastProvider } from './ui';
import type { Role } from './api';

// every screen behind sign-in is loaded only when it is first opened
const AppUpdates = lazy(() => import('./admin/AppUpdates').then((m) => ({ default: m.AppUpdates })));
const Plans = lazy(() => import('./admin/Plans').then((m) => ({ default: m.Plans })));
const SchoolDetail = lazy(() => import('./admin/SchoolDetail').then((m) => ({ default: m.SchoolDetail })));
const Banners = lazy(() => import('./Banners').then((m) => ({ default: m.Banners })));
const Audit = lazy(() => import('./pages/Audit').then((m) => ({ default: m.Audit })));
const Register = lazy(() => import('./pages/Register').then((m) => ({ default: m.Register })));
const RegisterStatus = lazy(() => import('./pages/Register').then((m) => ({ default: m.RegisterStatus })));
const RequestDetailPage = lazy(() => import('./pages/Requests').then((m) => ({ default: m.RequestDetailPage })));
const Requests = lazy(() => import('./pages/Requests').then((m) => ({ default: m.Requests })));
const SchoolData = lazy(() => import('./pages/SchoolData').then((m) => ({ default: m.SchoolData })));
const Schools = lazy(() => import('./pages/Schools').then((m) => ({ default: m.Schools })));
const Attendance = lazy(() => import('./school/Attendance').then((m) => ({ default: m.Attendance })));
const Calendar = lazy(() => import('./school/Calendar').then((m) => ({ default: m.Calendar })));
const Classes = lazy(() => import('./school/Classes').then((m) => ({ default: m.Classes })));
const Exams = lazy(() => import('./school/Exams').then((m) => ({ default: m.Exams })));
const Fees = lazy(() => import('./school/Fees').then((m) => ({ default: m.Fees })));
const Leaves = lazy(() => import('./school/Leaves').then((m) => ({ default: m.Leaves })));
const Notices = lazy(() => import('./school/Notices').then((m) => ({ default: m.Notices })));
const People = lazy(() => import('./school/People').then((m) => ({ default: m.People })));
const Polls = lazy(() => import('./school/Polls').then((m) => ({ default: m.Polls })));
const Activity = lazy(() => import('./school/Settings').then((m) => ({ default: m.Activity })));
const SchoolBanners = lazy(() => import('./school/Settings').then((m) => ({ default: m.SchoolBanners })));
const Settings = lazy(() => import('./school/Settings').then((m) => ({ default: m.Settings })));
const Staff = lazy(() => import('./school/Staff').then((m) => ({ default: m.Staff })));
const Timetable = lazy(() => import('./school/Timetable').then((m) => ({ default: m.Timetable })));
const Transport = lazy(() => import('./school/Transport').then((m) => ({ default: m.Transport })));

/** Shows a group of pages only to the given roles. This is navigation convenience — the API enforces every permission itself. */
function Guard({ roles }: { roles: Role[] }) {
  const { user } = useAuth();
  const loc = useLocation();
  // keyed by the visit, so a redirect always fires again when the same guarded address is opened a second time
  const go = (to: string) => <Navigate key={`${loc.key}:${to}`} to={to} replace />;
  if (!user) return go('/login');
  if (user.must_change_password) return go('/account');
  if (!roles.includes(user.role)) return go(homeOf(user));
  return <Shell><div key={loc.pathname} className="pagein"><Suspense fallback={<Loading rows={5} />}><Outlet /></Suspense></div></Shell>;
}

/** A page that belongs to a paid feature: shown only when the school's plan has it. */
function Feature({ module, title, children }: { module: string; title: string; children: React.ReactNode }) {
  const { school, error, reload, has } = useSchool();
  if (error) return <><PageHead title={title} /><div className="alert bad" role="alert"><span className="grow">{error}</span><button type="button" className="btn small" onClick={reload}>Try again</button></div></>;
  if (!school) return <><PageHead title={title} /><Loading rows={5} /></>;
  if (!has(module)) return <><PageHead title={title} /><div className="card"><Empty title={`${title} is not part of your plan`}>Contact Prangan support to add it to your school.</Empty></div></>;
  return <>{children}</>;
}

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? homeOf(user) : '/login'} replace />;
}

function AccountRoute() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Shell bare={user.must_change_password}><Account /></Shell>;
}

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <SchoolProvider>
            {APP_ENV !== 'prod' ? <div className={`envbar ${APP_ENV}`} role="note">{APP_ENV.toUpperCase()} environment · demo data only · not the live portal</div> : null}
            <HashRouter>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Suspense fallback={null}><Register /></Suspense>} />
                <Route path="/register/status" element={<Suspense fallback={null}><RegisterStatus /></Suspense>} />
                <Route path="/account" element={<AccountRoute />} />
                <Route element={<Guard roles={['admin']} />}>
                  <Route path="/admin" element={<AdminDashboard />} />
                  <Route path="/admin/schools" element={<Schools />} />
                  <Route path="/admin/schools/:id" element={<SchoolDetail />} />
                  <Route path="/admin/requests" element={<Requests />} />
                  <Route path="/admin/requests/:id" element={<RequestDetailPage />} />
                  <Route path="/admin/plans" element={<Plans />} />
                  <Route path="/admin/banners" element={<Banners base="/admin/banners" admin />} />
                  <Route path="/admin/updates" element={<AppUpdates />} />
                  <Route path="/admin/audit" element={<Audit />} />
                </Route>
                <Route element={<Guard roles={['principal']} />}>
                  <Route path="/school" element={<SchoolDashboard />} />
                  <Route path="/school/people" element={<People />} />
                  <Route path="/school/classes" element={<Classes />} />
                  <Route path="/school/timetable" element={<Timetable />} />
                  <Route path="/school/attendance" element={<Attendance />} />
                  <Route path="/school/exams" element={<Exams />} />
                  <Route path="/school/notices" element={<Notices />} />
                  <Route path="/school/calendar" element={<Calendar />} />
                  <Route path="/school/leaves" element={<Feature module="leaves" title="Leaves"><Leaves /></Feature>} />
                  <Route path="/school/staff" element={<Feature module="staff_attendance" title="Staff attendance"><Staff /></Feature>} />
                  <Route path="/school/fees" element={<Feature module="fees" title="Fees"><Fees /></Feature>} />
                  <Route path="/school/transport" element={<Feature module="transport" title="Transport"><Transport /></Feature>} />
                  <Route path="/school/polls" element={<Feature module="communication" title="Polls & consent forms"><Polls /></Feature>} />
                  <Route path="/school/banners" element={<SchoolBanners />} />
                  <Route path="/school/data" element={<SchoolData />} />
                  <Route path="/school/settings" element={<Settings />} />
                  <Route path="/school/activity" element={<Activity />} />
                </Route>
                <Route path="*" element={<Home />} />
              </Routes>
            </HashRouter>
          </SchoolProvider>
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
