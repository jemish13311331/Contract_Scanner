// Standalone auth landing pages reached from email links (or a "forgot password"
// link): email verification, forgot-password request, and password reset. They
// share one card layout (AuthShell) and stylesheet.
import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
//  Shared shell + styles
// ---------------------------------------------------------------------------
function AuthShell({ children }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <img src="/logo-mark.svg" width="46" height="46" alt="" />
        {children}
      </div>
      <style>{`
        .auth-page {
          min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 24px;
          background:
            radial-gradient(1100px 600px at 12% -10%, rgba(245,158,11,0.12), transparent 60%),
            radial-gradient(900px 520px at 100% 0%, rgba(225,29,72,0.08), transparent 55%),
            #fdf6ee;
          font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #1f1512;
        }
        .auth-card {
          width: 100%; max-width: 420px; text-align: center;
          background: #fff; border: 1px solid rgba(60,30,20,0.10); border-radius: 18px;
          padding: 34px 30px; box-shadow: 0 24px 60px rgba(60,30,20,0.10);
        }
        .auth-card img { display: block; margin: 0 auto 14px; }
        .auth-card h1 { font-size: 1.4rem; letter-spacing: -0.02em; margin: 0 0 6px; }
        .ap-sub { color: #574640; font-size: 0.95rem; line-height: 1.55; margin: 0 0 18px; }
        .ap-badge {
          width: 46px; height: 46px; border-radius: 50%; margin: 0 auto 12px;
          display: flex; align-items: center; justify-content: center; font-size: 1.4rem; font-weight: 800;
        }
        .ap-badge.ok { background: rgba(5,150,105,0.12); color: #059669; }
        .ap-badge.err { background: rgba(220,38,38,0.12); color: #dc2626; }
        .ap-btn {
          display: inline-block; width: 100%; padding: 12px 18px; border: none; border-radius: 12px;
          background: #e11d48; color: #fff; font-weight: 700; font-size: 0.95rem; cursor: pointer;
          font-family: inherit; transition: background 0.15s ease;
        }
        .ap-btn:hover:not(:disabled) { background: #be123c; }
        .ap-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .ap-form { display: grid; gap: 10px; margin-top: 4px; text-align: left; }
        .ap-form label { font-size: 0.82rem; font-weight: 600; color: #574640; display: grid; gap: 6px; }
        .ap-form input {
          padding: 11px 13px; border-radius: 10px; border: 1px solid rgba(60,30,20,0.14);
          font-family: inherit; font-size: 0.92rem; color: #1f1512; background: #fdf6ee;
        }
        .ap-form input:focus { outline: none; border-color: rgba(225,29,72,0.5); box-shadow: 0 0 0 3px rgba(225,29,72,0.25); }
        .ap-form .ap-btn { margin-top: 6px; }
        .ap-err { color: #dc2626; font-size: 0.85rem; margin: 10px 0 0; text-align: left; }
        .ap-note { color: #be123c; font-size: 0.85rem; margin: 12px 0 0; line-height: 1.5; }
        .ap-link { background: none; border: none; color: #877069; font-weight: 600; cursor: pointer; margin-top: 16px; font-size: 0.85rem; font-family: inherit; }
        .ap-link:hover { color: #be123c; }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  /verify-email — confirms the email using the token from the link, then
//  (per product decision) sends the user to login. Does not auto-login.
// ---------------------------------------------------------------------------
export default function VerifyEmailPage({ onLoginRedirect, onNavigate }) {
  const [status, setStatus] = useState('verifying'); // verifying | success | error
  const [resendEmail, setResendEmail] = useState('');
  const [resendMsg, setResendMsg] = useState('');
  const [resendBusy, setResendBusy] = useState(false);
  // The verify token is single-use. React 18 StrictMode runs effects twice in
  // dev, which would fire a second request and consume the (already-used) token,
  // flipping a just-verified page to "invalid or expired". Guard so we call once.
  const verifiedOnce = useRef(false);

  useEffect(() => {
    if (verifiedOnce.current) return;
    verifiedOnce.current = true;
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) { setStatus('error'); return; }
    (async () => {
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        setStatus(res.ok ? 'success' : 'error');
      } catch {
        setStatus('error');
      }
    })();
  }, []);

  const resend = async (e) => {
    e.preventDefault();
    if (!resendEmail.trim()) return;
    setResendBusy(true);
    setResendMsg('');
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail.trim() }),
      });
      setResendMsg('If that account exists and isn’t verified yet, a new link is on its way. It expires in 30 minutes.');
    } catch {
      setResendMsg('Something went wrong. Please try again.');
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <AuthShell>
      {status === 'verifying' && (
        <>
          <h1>Verifying your email…</h1>
          <p className="ap-sub">One moment while we confirm your link.</p>
        </>
      )}

      {status === 'success' && (
        <>
          <div className="ap-badge ok">✓</div>
          <h1>Email verified</h1>
          <p className="ap-sub">Your account is now active. Please log in to continue.</p>
          <button type="button" className="ap-btn" onClick={onLoginRedirect}>Go to login</button>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="ap-badge err">!</div>
          <h1>Link invalid or expired</h1>
          <p className="ap-sub">Verification links expire after 30 minutes. Enter your email and we’ll send a new one.</p>
          <form className="ap-form" onSubmit={resend}>
            <input
              type="email"
              required
              placeholder="you@email.com"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
            />
            <button type="submit" className="ap-btn" disabled={resendBusy}>
              {resendBusy ? 'Sending…' : 'Resend verification email'}
            </button>
          </form>
          {resendMsg && <p className="ap-note">{resendMsg}</p>}
          <button type="button" className="ap-link" onClick={() => onNavigate('/')}>← Back to home</button>
        </>
      )}
    </AuthShell>
  );
}

// ---------------------------------------------------------------------------
//  /forgot-password — collects an email and requests a reset link. Always
//  confirms "check your inbox" so it never reveals whether an account exists.
// ---------------------------------------------------------------------------
export function ForgotPasswordPage({ onNavigate }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError('');
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      {sent ? (
        <>
          <div className="ap-badge ok">✓</div>
          <h1>Check your inbox</h1>
          <p className="ap-sub">
            If an account exists for <strong>{email.trim()}</strong>, we’ve sent a link to reset your password.
            It expires in 30 minutes.
          </p>
          <button type="button" className="ap-btn" onClick={() => onNavigate('/')}>Back to home</button>
        </>
      ) : (
        <>
          <h1>Forgot your password?</h1>
          <p className="ap-sub">Enter your account email and we’ll send you a link to set a new password.</p>
          <form className="ap-form" onSubmit={submit}>
            <label>
              Email
              <input
                type="email"
                required
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button type="submit" className="ap-btn" disabled={busy}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
          {error && <p className="ap-err">{error}</p>}
          <button type="button" className="ap-link" onClick={() => onNavigate('/')}>← Back to home</button>
        </>
      )}
    </AuthShell>
  );
}

// ---------------------------------------------------------------------------
//  /reset-password — reads the token from the link, collects a new password +
//  confirmation, submits, then sends the user to login. Does not auto-login.
// ---------------------------------------------------------------------------
export function ResetPasswordPage({ onLoginRedirect, onNavigate }) {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token'));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState('form'); // form | success | error
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords don’t match.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus('success');
      } else if (data.expired) {
        setStatus('error');
      } else {
        setError(data.error || 'Could not reset your password. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // No token in the URL → nothing to reset.
  if (!token) {
    return (
      <AuthShell>
        <div className="ap-badge err">!</div>
        <h1>Invalid reset link</h1>
        <p className="ap-sub">This link is missing its reset token. Request a new one to continue.</p>
        <button type="button" className="ap-btn" onClick={() => onNavigate('/forgot-password')}>Request a new link</button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      {status === 'success' && (
        <>
          <div className="ap-badge ok">✓</div>
          <h1>Password updated</h1>
          <p className="ap-sub">Your password has been changed. Please log in with your new password.</p>
          <button type="button" className="ap-btn" onClick={onLoginRedirect}>Go to login</button>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="ap-badge err">!</div>
          <h1>Link invalid or expired</h1>
          <p className="ap-sub">Password reset links expire after 30 minutes. Request a fresh one to try again.</p>
          <button type="button" className="ap-btn" onClick={() => onNavigate('/forgot-password')}>Request a new link</button>
          <button type="button" className="ap-link" onClick={() => onNavigate('/')}>← Back to home</button>
        </>
      )}

      {status === 'form' && (
        <>
          <h1>Set a new password</h1>
          <p className="ap-sub">Choose a new password for your account.</p>
          <form className="ap-form" onSubmit={submit}>
            <label>
              New password
              <input
                type="password"
                required
                minLength={8}
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                required
                minLength={8}
                placeholder="Re-enter your new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <button type="submit" className="ap-btn" disabled={busy}>
              {busy ? 'Updating…' : 'Submit new password'}
            </button>
          </form>
          {error && <p className="ap-err">{error}</p>}
          <button type="button" className="ap-link" onClick={() => onNavigate('/')}>← Back to home</button>
        </>
      )}
    </AuthShell>
  );
}
