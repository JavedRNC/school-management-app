import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { api, type OnboardingSummary } from './api';
import { useAuth } from './auth';
import { Icon } from './ui';

type Item = { to: string; label: string; icon: string; end?: boolean; count?: number };

export function Shell({ children, bare }: { children: ReactNode; bare?: boolean }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [pending, setPending] = useState(0);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isAdmin || bare) return;
    let alive = true;
    api<OnboardingSummary>('/admin/onboarding/summary').then((s) => { if (alive) setPending(s.pending); }).catch(() => {});
    return () => { alive = false; };
  }, [isAdmin, bare, loc.pathname]);

  if (!user) return null;
  const items: Item[] = bare ? [] : isAdmin
    ? [{ to: '/admin', label: 'Dashboard', icon: 'home', end: true }, { to: '/admin/schools', label: 'Schools', icon: 'school' },
      { to: '/admin/requests', label: 'Requests', icon: 'inbox', count: pending }, { to: '/admin/audit', label: 'Activity', icon: 'list' },
      { to: '/account', label: 'Account', icon: 'key' }]
    : [{ to: '/school', label: 'Dashboard', icon: 'home', end: true }, { to: '/school/people', label: 'People', icon: 'people' },
      { to: '/school/data', label: 'Import & export', icon: 'data' }, { to: '/account', label: 'Account', icon: 'key' }];
  const out = () => { nav('/login', { replace: true }); logout(); };   // leave the guarded page first, then end the session
  const link = (i: Item) => (
    <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => (isActive ? 'active' : '')}>
      <Icon name={i.icon} /><span>{i.label}</span>
      {i.count ? <span className="count" aria-label={`${i.count} pending`}>{i.count}</span> : null}
    </NavLink>
  );
  return (
    <div className="shell">
      <aside className="side">
        <a className="brand" href="#/"><img src="./logo.svg" alt="" /><div><b>Prangan</b><span>{isAdmin ? 'Admin portal' : 'School portal'}</span></div></a>
        {items.length ? <nav className="nav" aria-label="Main">{items.map(link)}</nav> : null}
        <div className="side-foot">
          <b>{user.name}</b><span className="who">{isAdmin ? 'Platform admin' : 'Principal'}</span>
          <div><button type="button" className="linkbtn" onClick={out}>Log out</button></div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <img src="./logo.svg" alt="" /><b>Prangan</b>
          <button type="button" className="linkbtn" onClick={out}>Log out</button>
        </header>
        <main className="page" id="main">{children}</main>
      </div>
      {items.length ? <nav className="bottomnav" aria-label="Main">{items.map(link)}</nav> : null}
    </div>
  );
}
