import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { homeOf, useAuth } from '../auth';
import { Button, Text } from '../ui';

export function Login() {
  const { user, login, expired } = useAuth();
  const [code, setCode] = useState('');
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (user) return <Navigate to={user.must_change_password ? '/account' : homeOf(user)} replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !id.trim() || !pw) return setError('Enter the school code, login ID and password.');
    setBusy(true);
    setError(null);
    try {
      await login(code, id, pw);        // the redirect happens on the next render, from the signed-in state above
    } catch (err) {
      setError((err as Error).message);
      setPw('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="public">
      <section className="panel">
        <a className="brand" href="#/login"><img src="./logo.svg" alt="" /><div><b>Prangan</b><span lang="hi">प्रांगण</span></div></a>
        <h1>The school courtyard, on one screen.</h1>
        <p>Sign in to manage schools on Prangan or to see your own school's day at a glance.</p>
        <ul className="points">
          <li>Admin: schools, onboarding requests, activity</li>
          <li>Principal: attendance, results, fees, people, import and export</li>
          <li>Teachers, parents and students use the Prangan app</li>
        </ul>
        <p className="foot">New to Prangan? <Link to="/register">Register your school</Link></p>
      </section>
      <section className="body">
        <form className="form narrow" onSubmit={submit} noValidate>
          <div><h1>Sign in</h1><p className="muted">Use the same details as in the Prangan app.</p></div>
          {expired ? <div className="alert warn" role="status">Your session ended. Please sign in again.</div> : null}
          {error ? <div className="alert bad" role="alert">{error}</div> : null}
          <Text label="School code" value={code} onChange={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" autoComplete="organization" spellCheck={false}
            hint="Platform admins use the code ADMIN." required />
          <Text label="Login ID" value={id} onChange={setId} autoCapitalize="none" autoComplete="username" spellCheck={false} required />
          <Text label="Password" value={pw} onChange={setPw} type="password" autoComplete="current-password" required />
          <Button kind="primary" type="submit" busy={busy}>Sign in</Button>
          <p className="small muted">Want Prangan for your school? <Link to="/register">Register your school</Link> · <Link to="/register/status">Check a request</Link></p>
        </form>
      </section>
    </div>
  );
}
