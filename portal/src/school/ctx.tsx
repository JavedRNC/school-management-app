// The signed-in principal's school: name, plan, switched-on modules. Loaded once and shared by every school screen.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';

export interface SchoolMe {
  id: number; code: string; name: string; address: string; phone: string; board: string; working_days: number[];
  today_is_school_day: boolean; closed_reason: string; share_contact_with_admin: boolean; support_access_until: string | null;
  modules: string[]; status: string; can_write: boolean; module_names: Record<string, string>;
  subscription: {
    status: string; plan: string | null; is_free: boolean; free_until: string | null; trial_until: string | null; valid_until: string | null;
    grace_days: number; max_students: number | null; billing_cycle: string; modules: string[];
    estimate: { students: number; price_per_student: number; min_monthly: number; discount_pct: number; gross: number; amount: number; free: boolean };
  };
}
export interface Person {
  id: number; login_id: string; name: string; role: string; phone: string; email: string; address: string; dob: string | null; blood_group: string;
  class_id: number | null; roll_no: number | null; permissions: Record<string, string> | null; scope_class_ids: number[] | null;
  must_change_password: boolean; active: boolean; children_ids: number[]; parent_ids: number[];
}
export interface Klass { id: number; name: string; class_teacher_id: number | null; student_count: number }
export interface Subject { id: number; name: string }

type Ctx = { school: SchoolMe | null; error: string | null; reload: () => void; setSchool: (s: SchoolMe) => void; has: (module: string) => boolean };
const SchoolCtx = createContext<Ctx>({ school: null, error: null, reload: () => {}, setSchool: () => {}, has: () => false });
export const useSchool = () => useContext(SchoolCtx);

export function SchoolProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [school, setSchool] = useState<SchoolMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wanted = user?.role === 'principal' && !user.must_change_password ? user.id : null;
  const reload = useCallback(() => {
    if (wanted === null) { setSchool(null); return; }
    setError(null);
    api<SchoolMe>('/school/me').then(setSchool).catch((e: Error) => setError(e.message));
  }, [wanted]);
  useEffect(reload, [reload]);
  const value = useMemo(() => ({ school, error, reload, setSchool, has: (m: string) => !!school?.modules.includes(m) }), [school, error, reload]);
  return <SchoolCtx.Provider value={value}>{children}</SchoolCtx.Provider>;
}

export const ROLE_LABEL: Record<string, string> = {
  student: 'Student', teacher: 'Teacher', parent: 'Parent', vice_principal: 'Vice Principal', coordinator: 'Coordinator', principal: 'Principal', admin: 'Admin',
};
/** Shown above a screen when the subscription has lapsed and the server will refuse changes. */
export function ReadOnlyNote() {
  const { school } = useSchool();
  if (!school || school.can_write) return null;
  return <div className="alert warn readonly-note" role="note">Your school's subscription is {school.status}. You can view everything, but changes are switched off until it is renewed.</div>;
}
