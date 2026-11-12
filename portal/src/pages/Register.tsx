import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Badge, Button, fmtDate, Select, STATUS_LABEL, Text } from '../ui';

const STATES = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry'];
const BLANK = { school_name: '', reg_no: '', category: '', board: '', address: '', state: '', district: '', city: '', pin: '', principal_name: '', contact_name: '', designation: '',
  mobile: '', alt_phone: '', email: '', contact_method: '', students: '', teachers: '', current_software: '', message: '', website: '' };
type Form = typeof BLANK;

function validate(f: Form, privacy: boolean, contact: boolean) {
  const e: Partial<Record<keyof Form | 'consent', string>> = {};
  if (f.school_name.trim().length < 3) e.school_name = 'Enter the school name.';
  if (f.address.trim().length < 5) e.address = 'Enter the school address.';
  if (!f.state) e.state = 'Choose the state.';
  if (f.district.trim().length < 2) e.district = 'Enter the district.';
  if (f.city.trim().length < 2) e.city = 'Enter the city or town.';
  if (!/^[1-9]\d{5}$/.test(f.pin)) e.pin = 'Enter the 6-digit PIN code.';
  if (f.contact_name.trim().length < 2) e.contact_name = 'Enter the name of the person we should contact.';
  if (!/^[6-9]\d{9}$/.test(f.mobile.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, ''))) e.mobile = 'Enter a 10-digit mobile number.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = 'Enter a valid email address.';
  if (!privacy || !contact) e.consent = 'Please tick both boxes to send the request.';
  return e;
}

function Panel() {
  return (
    <section className="panel">
      <a className="brand" href="#/login"><img src="./logo.svg" alt="" /><div><b>Prangan</b><span lang="hi">प्रांगण</span></div></a>
      <h1>Register your school with Prangan</h1>
      <p>Tell us about your school. Our team reviews every request and calls you back to set things up.</p>
      <ul className="points">
        <li>Takes about three minutes</li>
        <li>You get a reference number to track the request</li>
        <li>No payment is asked for on this form</li>
      </ul>
      <p className="foot">Already on Prangan? <Link to="/login">Sign in</Link> · <Link to="/register/status">Check a request</Link></p>
    </section>
  );
}

export function Register() {
  const [f, setF] = useState<Form>(BLANK);
  const [privacy, setPrivacy] = useState(false);
  const [contact, setContact] = useState(false);
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  useEffect(() => { document.title = 'Register your school · Prangan'; }, []);
  const up = (k: keyof Form) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(f, privacy, contact);
    setErrors(errs);
    setFailed(null);
    if (Object.keys(errs).length) {
      setFailed('Some details are missing or need correcting. They are marked below.');
      return window.scrollTo({ top: 0 });
    }
    setBusy(true);
    try {
      const res = await api<{ reference: string }>('/public/onboarding', {
        auth: false,
        body: { ...f, students: f.students ? Number(f.students) : null, teachers: f.teachers ? Number(f.teachers) : null, consent_privacy: privacy, consent_contact: contact, source: 'web' },
      });
      setRef(res.reference);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setFailed((err as Error).message);
      window.scrollTo({ top: 0 });
    } finally {
      setBusy(false);
    }
  }

  if (ref) {
    return (
      <div className="public"><Panel />
        <section className="body"><div className="form narrow" role="status" aria-live="polite">
          <h1>Request received</h1>
          <p>Thank you. The Prangan team will review it and contact {f.contact_name || 'you'} on {f.mobile}.</p>
          <div className="refbox" data-testid="reference">{ref}</div>
          <p className="muted">Keep this reference number. With it and your mobile number you can <Link to="/register/status">check the request</Link> at any time.</p>
          <div className="row"><Button onClick={() => navigator.clipboard?.writeText(ref)}>Copy reference</Button><Link className="btn" to="/register/status">Check status</Link></div>
        </div></section>
      </div>
    );
  }
  return (
    <div className="public"><Panel />
      <section className="body">
        <form className="form" onSubmit={submit} noValidate>
          {failed ? <div className="alert bad" role="alert">{failed}</div> : null}
          <fieldset>
            <legend>School</legend>
            <div className="cols">
              <div className="wide"><Text label="School name" value={f.school_name} onChange={up('school_name')} error={errors.school_name} maxLength={160} autoComplete="organization" required /></div>
              <Text label="Registration / affiliation / UDISE number" value={f.reg_no} onChange={up('reg_no')} maxLength={60} hint="If your school has one." />
              <Select label="School type" value={f.category} onChange={up('category')} options={[['', 'Choose (optional)'], 'Pre-primary', 'Primary', 'Middle', 'Secondary', 'Senior secondary', 'Other']} />
              <Text label="Board" value={f.board} onChange={up('board')} maxLength={40} hint="CBSE, ICSE, state board… (optional)" />
              <div className="wide"><Text label="Address" value={f.address} onChange={up('address')} error={errors.address} maxLength={500} autoComplete="street-address" required /></div>
              <Text label="City / town" value={f.city} onChange={up('city')} error={errors.city} maxLength={80} required />
              <Text label="District" value={f.district} onChange={up('district')} error={errors.district} maxLength={60} required />
              <div className="field"><label htmlFor="state"><span>State</span></label>
                <select id="state" className="input" value={f.state} onChange={(e) => up('state')(e.target.value)} aria-invalid={errors.state ? true : undefined} required>
                  <option value="">Choose</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select>
                {errors.state ? <span className="err" role="alert">{errors.state}</span> : null}</div>
              <Text label="PIN code" value={f.pin} onChange={(v) => up('pin')(v.replace(/\D/g, '').slice(0, 6))} error={errors.pin} inputMode="numeric" autoComplete="postal-code" required />
            </div>
          </fieldset>
          <fieldset>
            <legend>Contact</legend>
            <div className="cols">
              <Text label="Your name" value={f.contact_name} onChange={up('contact_name')} error={errors.contact_name} maxLength={120} autoComplete="name" required />
              <Text label="Your role at the school" value={f.designation} onChange={up('designation')} maxLength={60} hint="Optional" />
              <Text label="Mobile number" value={f.mobile} onChange={up('mobile')} error={errors.mobile} type="tel" inputMode="tel" autoComplete="tel" maxLength={16} required />
              <Text label="Email" value={f.email} onChange={up('email')} error={errors.email} type="email" autoComplete="email" maxLength={160} required />
              <Text label="Principal's name" value={f.principal_name} onChange={up('principal_name')} maxLength={120} hint="Optional" />
              <Text label="Alternate number" value={f.alt_phone} onChange={up('alt_phone')} type="tel" inputMode="tel" maxLength={16} hint="Optional" />
              <Select label="Best way to reach you" value={f.contact_method} onChange={up('contact_method')} options={[['', 'No preference'], 'Phone', 'WhatsApp', 'Email']} />
            </div>
          </fieldset>
          <fieldset>
            <legend>A little more (optional)</legend>
            <div className="cols">
              <Text label="About how many students" value={f.students} onChange={(v) => up('students')(v.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" />
              <Text label="About how many teachers" value={f.teachers} onChange={(v) => up('teachers')(v.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" />
              <div className="wide"><Text label="School software you use now" value={f.current_software} onChange={up('current_software')} maxLength={120} /></div>
              <div className="wide field"><label htmlFor="msg"><span>Anything we should know</span></label>
                <textarea id="msg" className="input" value={f.message} onChange={(e) => up('message')(e.target.value)} maxLength={1000} /></div>
            </div>
          </fieldset>
          {/* Trap for bots: real people never see or fill this. */}
          <div className="trap" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => up('website')(e.target.value)} /></label></div>
          <fieldset>
            <legend>Consent</legend>
            <label className="check"><input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
              <span>I agree that Prangan may store these details to process this request, as described in its privacy policy.</span></label>
            <label className="check"><input type="checkbox" checked={contact} onChange={(e) => setContact(e.target.checked)} />
              <span>The Prangan team may contact me by phone, WhatsApp or email about this request.</span></label>
            {errors.consent ? <span className="err" role="alert">{errors.consent}</span> : null}
          </fieldset>
          <div className="row"><Button kind="gold" type="submit" busy={busy}>Send request</Button><Link to="/register/status" className="small">Already sent one? Check its status</Link></div>
        </form>
      </section>
    </div>
  );
}

type Status = { reference: string; school_name: string; status: string; submitted_on: string; updated_on: string; message: string };
const MEANING: Record<string, string> = {
  PENDING: 'We have your request and will review it soon.', UNDER_REVIEW: 'Our team is reviewing your request.',
  ADDITIONAL_INFORMATION_REQUIRED: 'We need a little more information from you.', APPROVED: 'Approved. We are setting up your school and will share sign-in details.',
  REJECTED: 'We could not take this request forward.', ONBOARDED: 'Your school is on Prangan. The principal has the sign-in details.',
};

export function RegisterStatus() {
  const [ref, setRef] = useState('');
  const [mobile, setMobile] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Status | null>(null);
  useEffect(() => { document.title = 'Check a request · Prangan'; }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setRes(null);
    try { setRes(await api<Status>('/public/onboarding/status', { auth: false, query: { reference: ref.trim(), mobile: mobile.trim() } })); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <div className="public"><Panel />
      <section className="body">
        <form className="form narrow" onSubmit={submit} noValidate>
          <div><h1>Check a request</h1><p className="muted">Enter the reference number you received and the mobile number you used.</p></div>
          {error ? <div className="alert bad" role="alert">{error}</div> : null}
          <Text label="Reference number" value={ref} onChange={(v) => setRef(v.toUpperCase())} placeholder="PRN-2026-000123" spellCheck={false} autoCapitalize="characters" required />
          <Text label="Mobile number" value={mobile} onChange={setMobile} type="tel" inputMode="tel" autoComplete="tel" required />
          <Button kind="primary" type="submit" busy={busy} disabled={!ref.trim() || !mobile.trim()}>Check status</Button>
          {res ? (
            <div className="card stack" role="status" aria-live="polite">
              <div className="spread"><h2>{res.school_name}</h2><Badge status={res.status} /></div>
              <p>{MEANING[res.status] ?? STATUS_LABEL[res.status]}</p>
              {res.message ? <div className="alert warn"><span style={{ whiteSpace: 'pre-wrap' }}>{res.message}</span></div> : null}
              <p className="muted small">{res.reference} · sent {fmtDate(res.submitted_on)} · last updated {fmtDate(res.updated_on)}</p>
            </div>
          ) : null}
          <p className="small"><Link to="/register">Register a school</Link> · <Link to="/login">Sign in</Link></p>
        </form>
      </section>
    </div>
  );
}
