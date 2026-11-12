import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type User } from '../api';
import { homeOf, useAuth } from '../auth';
import { Button, PageHead, Text, useToast } from '../ui';

export function Account() {
  const { user, login, logout } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [oldPw, setOld] = useState('');
  const [newPw, setNew] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  const forced = user.must_change_password;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (newPw.length < 8) return setError('Use at least 8 characters for the new password.');
    if (newPw !== again) return setError('The two new passwords do not match.');
    setBusy(true);
    setError(null);
    try {
      // Changing the password ends every portal session, including this one, so note the school code first
      // and sign in again with the new password straight after.
      const code = user!.role === 'admin' ? 'ADMIN' : (await api<{ code: string }>('/school/me').catch(() => null))?.code;
      await api<User>('/auth/password', { body: { old_password: oldPw, new_password: newPw } });
      if (code) {
        const u = await login(code, user!.login_id, newPw);
        toast('Password changed');
        nav(homeOf(u), { replace: true });
      } else {
        logout();
        nav('/login', { replace: true });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title={forced ? 'Set a new password' : 'Account'} sub={forced ? 'You signed in with a temporary password. Choose your own to continue.' : `${user.name} · login ID ${user.login_id}`} />
      <form className="card stack" onSubmit={submit} style={{ maxWidth: 460 }} noValidate>
        <h2>Change password</h2>
        {error ? <div className="alert bad" role="alert">{error}</div> : null}
        <Text label={forced ? 'Temporary password' : 'Current password'} value={oldPw} onChange={setOld} type="password" autoComplete="current-password" />
        <Text label="New password" value={newPw} onChange={setNew} type="password" autoComplete="new-password" hint="At least 8 characters. Not the same as your login ID." />
        <Text label="New password again" value={again} onChange={setAgain} type="password" autoComplete="new-password" />
        <div className="row"><Button kind="primary" type="submit" busy={busy}>Save new password</Button>
          {forced ? <Button onClick={() => { logout(); nav('/login', { replace: true }); }}>Log out</Button> : null}</div>
      </form>
    </>
  );
}
