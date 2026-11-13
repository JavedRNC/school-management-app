import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { api, type OnboardingSummary } from './api';
import { useAuth } from './auth';
import { useSchool } from './school/ctx';
import { Icon } from './ui';

type Item = { to: string; label: string; icon: string; end?: boolean; count?: number; group: string; module?: string; words?: string };

const ADMIN: Item[] = [
  { to: '/admin', label: 'Dashboard', icon: 'home', end: true, group: '' },
  { to: '/admin/schools', label: 'Schools', icon: 'school', group: 'Schools', words: 'subscription plan payments users' },
  { to: '/admin/requests', label: 'Requests', icon: 'inbox', group: 'Schools', words: 'onboarding registration' },
  { to: '/admin/plans', label: 'Plans & pricing', icon: 'tag', group: 'Platform', words: 'modules price' },
  { to: '/admin/banners', label: 'Announcements', icon: 'megaphone', group: 'Platform', words: 'banners popup' },
  { to: '/admin/updates', label: 'App updates', icon: 'phone', group: 'Platform', words: 'version build' },
  { to: '/admin/audit', label: 'Activity', icon: 'list', group: 'Platform', words: 'audit log' },
  { to: '/account', label: 'Account', icon: 'key', group: 'Platform', words: 'password' },
];
const SCHOOL: Item[] = [
  { to: '/school', label: 'Dashboard', icon: 'home', end: true, group: '' },
  { to: '/school/people', label: 'People', icon: 'people', group: 'School', words: 'students teachers parents staff add' },
  { to: '/school/classes', label: 'Classes & subjects', icon: 'layers', group: 'School', words: 'sections subject teachers' },
  { to: '/school/timetable', label: 'Timetable', icon: 'grid', group: 'School', words: 'periods bell timings' },
  { to: '/school/attendance', label: 'Attendance', icon: 'check', group: 'Every day', words: 'present absent register' },
  { to: '/school/exams', label: 'Exams & marks', icon: 'book', group: 'Every day', words: 'tests results scores' },
  { to: '/school/notices', label: 'Notices & homework', icon: 'megaphone', group: 'Every day', words: 'announcement post' },
  { to: '/school/calendar', label: 'Calendar', icon: 'calendar', group: 'Every day', words: 'holidays events vacation' },
  { to: '/school/leaves', label: 'Leaves', icon: 'leaf', group: 'Every day', module: 'leaves', words: 'approve leave quota' },
  { to: '/school/staff', label: 'Staff attendance', icon: 'clock', group: 'Every day', module: 'staff_attendance', words: 'check in gps' },
  { to: '/school/fees', label: 'Fees', icon: 'rupee', group: 'Money & transport', module: 'fees', words: 'collect receipts payments dues' },
  { to: '/school/transport', label: 'Transport', icon: 'bus', group: 'Money & transport', module: 'transport', words: 'routes vehicles bus stops' },
  { to: '/school/polls', label: 'Polls & consent forms', icon: 'vote', group: 'Parents', module: 'communication', words: 'survey permission' },
  { to: '/school/banners', label: 'Banners', icon: 'image', group: 'Parents', words: 'announcement popup' },
  { to: '/school/data', label: 'Import & export', icon: 'data', group: 'Setup', words: 'excel backup template' },
  { to: '/school/settings', label: 'Settings', icon: 'settings', group: 'Setup', words: 'profile working days privacy support archive plan' },
  { to: '/school/activity', label: 'Activity', icon: 'list', group: 'Setup', words: 'audit log' },
  { to: '/account', label: 'Account', icon: 'key', group: 'Setup', words: 'password' },
];
const PHONE_MAIN: Record<string, string[]> = { admin: ['/admin', '/admin/schools', '/admin/requests'], principal: ['/school', '/school/people', '/school/attendance', '/school/fees'] };

export function Shell({ children, bare }: { children: ReactNode; bare?: boolean }) {
  const { user, logout } = useAuth();
  const { school } = useSchool();
  const nav = useNavigate();
  const loc = useLocation();
  const [pending, setPending] = useState(0);
  const [more, setMore] = useState(false);
  const [palette, setPalette] = useState(false);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isAdmin || bare) return;
    let alive = true;
    api<OnboardingSummary>('/admin/onboarding/summary').then((s) => { if (alive) setPending(s.pending); }).catch(() => {});
    return () => { alive = false; };
  }, [isAdmin, bare, loc.pathname]);
  useEffect(() => { setMore(false); setPalette(false); }, [loc.pathname]);
  useEffect(() => {
    if (bare) return;
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((v) => !v); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [bare]);

  const items = useMemo<Item[]>(() => {
    if (bare || !user) return [];
    if (isAdmin) return ADMIN.map((i) => (i.to === '/admin/requests' ? { ...i, count: pending } : i));
    return SCHOOL.filter((i) => !i.module || !school || school.modules.includes(i.module));
  }, [bare, user, isAdmin, pending, school]);

  if (!user) return null;
  const out = () => { nav('/login', { replace: true }); logout(); };   // leave the guarded page first, then end the session
  const link = (i: Item) => (
    <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => (isActive ? 'active' : '')}>
      <Icon name={i.icon} /><span>{i.label}</span>
      {i.count ? <span className="count" aria-label={`${i.count} pending`}>{i.count}</span> : null}
    </NavLink>
  );
  const grouped = (list: Item[]) => {
    const out: ReactNode[] = [];
    let g = '';
    for (const i of list) {
      if (i.group !== g) { g = i.group; if (g) out.push(<div key={`g-${g}`} className="navgroup">{g}</div>); }
      out.push(link(i));
    }
    return out;
  };
  const main = PHONE_MAIN[isAdmin ? 'admin' : 'principal'];
  const phoneItems = items.filter((i) => main.includes(i.to));
  return (
    <div className="shell">
      <aside className="side">
        <a className="brand" href="#/"><img src="./logo.svg" alt="" /><div><b>Prangan</b><span>{isAdmin ? 'Admin portal' : school?.name ?? 'School portal'}</span></div></a>
        {items.length ? (
          <>
            <button type="button" className="palette-hint" onClick={() => setPalette(true)}><Icon name="search" />Go to…<kbd>Ctrl K</kbd></button>
            <nav className="nav" aria-label="Main">{grouped(items)}</nav>
          </>
        ) : null}
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
      {items.length ? (
        <nav className="bottomnav" aria-label="Main">
          {phoneItems.map(link)}
          <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} aria-label="More pages"><Icon name="more" /><span>More</span></button>
        </nav>
      ) : null}
      {more ? (
        <div className="sheet-back" onClick={(e) => { if (e.target === e.currentTarget) setMore(false); }}>
          <div className="sheet" role="dialog" aria-label="All pages"><nav className="nav" aria-label="All pages">{grouped(items)}</nav></div>
        </div>
      ) : null}
      {palette ? <Palette items={items} onClose={() => setPalette(false)} /> : null}
    </div>
  );
}

/** Ctrl+K: type a few letters to jump to any page. */
function Palette({ items, onClose }: { items: Item[]; onClose: () => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((i) => !s || `${i.label} ${i.group} ${i.words ?? ''}`.toLowerCase().includes(s));
  }, [items, q]);
  const go = (i?: Item) => { if (i) { onClose(); nav(i.to); } };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setAt((a) => Math.min(found.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(found[at]); }
  };
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal palette" role="dialog" aria-modal="true" aria-label="Go to a page" onKeyDown={onKey}>
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setAt(0); }} placeholder="Where do you want to go?" aria-label="Search pages"
          role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={found[at] ? `pal-${at}` : undefined} />
        <ul id="palette-list" role="listbox">
          {found.map((i, n) => (
            <li key={i.to} id={`pal-${n}`} role="option" aria-selected={n === at} onMouseEnter={() => setAt(n)} onClick={() => go(i)}>
              <Icon name={i.icon} /><span>{i.label}</span>{i.group ? <small>{i.group}</small> : null}
            </li>
          ))}
          {!found.length ? <li role="option" aria-selected="false" className="muted">No page matches "{q}"</li> : null}
        </ul>
      </div>
    </div>
  );
}
