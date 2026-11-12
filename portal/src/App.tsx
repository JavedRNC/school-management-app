import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { APP_ENV } from './api';
import { AuthProvider, homeOf, useAuth } from './auth';
import { Shell } from './layout';
import { Account } from './pages/Account';
import { AdminDashboard } from './pages/AdminDashboard';
import { Audit } from './pages/Audit';
import { Login } from './pages/Login';
import { Register, RegisterStatus } from './pages/Register';
import { RequestDetailPage, Requests } from './pages/Requests';
import { SchoolDashboard } from './pages/SchoolDashboard';
import { SchoolData } from './pages/SchoolData';
import { SchoolDetail, Schools } from './pages/Schools';
import { SchoolPeople } from './pages/SchoolPeople';
import { ToastProvider } from './ui';
import type { Role } from './api';

/** Shows a page only to the given roles. This is navigation convenience — the API enforces every permission itself. */
function Guard({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/account" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeOf(user)} replace />;
  return <Shell>{children}</Shell>;
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
        {APP_ENV !== 'prod' ? <div className={`envbar ${APP_ENV}`} role="note">{APP_ENV.toUpperCase()} environment · demo data only · not the live portal</div> : null}
        <HashRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/register/status" element={<RegisterStatus />} />
            <Route path="/account" element={<AccountRoute />} />
            <Route path="/admin" element={<Guard roles={['admin']}><AdminDashboard /></Guard>} />
            <Route path="/admin/schools" element={<Guard roles={['admin']}><Schools /></Guard>} />
            <Route path="/admin/schools/:id" element={<Guard roles={['admin']}><SchoolDetail /></Guard>} />
            <Route path="/admin/requests" element={<Guard roles={['admin']}><Requests /></Guard>} />
            <Route path="/admin/requests/:id" element={<Guard roles={['admin']}><RequestDetailPage /></Guard>} />
            <Route path="/admin/audit" element={<Guard roles={['admin']}><Audit /></Guard>} />
            <Route path="/school" element={<Guard roles={['principal']}><SchoolDashboard /></Guard>} />
            <Route path="/school/people" element={<Guard roles={['principal']}><SchoolPeople /></Guard>} />
            <Route path="/school/data" element={<Guard roles={['principal']}><SchoolData /></Guard>} />
            <Route path="*" element={<Home />} />
          </Routes>
        </HashRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
