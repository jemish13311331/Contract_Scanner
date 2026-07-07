import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import HomeWorkOutlinedIcon from '@mui/icons-material/HomeWorkOutlined';
import WorkOutlineIcon from '@mui/icons-material/WorkOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DoneOutlinedIcon from '@mui/icons-material/DoneOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import RestartAltOutlinedIcon from '@mui/icons-material/RestartAltOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import LoginOutlinedIcon from '@mui/icons-material/LoginOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import StarOutlineRoundedIcon from '@mui/icons-material/StarOutlineRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LegalPage from './LegalPages.jsx';
import VerifyEmailPage, { ForgotPasswordPage, ResetPasswordPage } from './AuthPages.jsx';

const featurePills = ['AI-powered review', 'Any contract type', 'Plain-English insights', 'Negotiation prompts'];

// Subscription tiers. credits = number of analyses; unlimitedDays grants time-boxed unlimited use.
const PLANS = [
  { id: 'starter', name: 'Starter', price: '$9.99', credits: 5, tagline: 'For a one-off review', Icon: BoltOutlinedIcon },
  { id: 'pro', name: 'Pro', price: '$49.99', credits: 50, tagline: 'For an active search', popular: true, Icon: WorkspacePremiumOutlinedIcon },
  { id: 'unlimited', name: 'Unlimited', price: '$99.99', period: '/month', unlimitedDays: 30, tagline: 'For power users', Icon: StarOutlineRoundedIcon },
];
const FREE_TRIAL_LIMIT = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

// Resolve a contract-type id (e.g. from persisted history) to its icon component.
const iconForType = (id) => CONTRACT_TYPES.find((t) => t.id === id)?.Icon || DescriptionOutlinedIcon;

const DRAFT_KEY = 'contract-scanner:draft';
const TYPE_KEY = 'contract-scanner:type';
const HISTORY_KEY = 'contract-scanner:history';
const ACCOUNT_KEY = 'contract-scanner:account';

// How many saved-report cards to show per page in the home-page history grid.
const HISTORY_PAGE_SIZE = 10;
const ENTITLEMENT_KEY = 'contract-scanner:entitlement';
const FREE_KEY = 'contract-scanner:freeUsed';
const TOKEN_KEY = 'contract-scanner:token';

const DEFAULT_ENTITLEMENT = { credits: 0, unlimitedUntil: null };

// Renders Google's official "Sign in with Google" button via Google Identity
// Services (GIS). Loads the GIS script once, then renders the button once both
// the script and the client id are ready. `onCredential(idToken)` fires when the
// user completes the Google flow; we keep it in a ref so re-renders don't
// re-initialize GIS. Renders nothing until a client id is configured.
function GoogleSignInButton({ clientId, onCredential }) {
  const holder = useRef(null);
  const cbRef = useRef(onCredential);
  cbRef.current = onCredential;
  const [ready, setReady] = useState(() => !!window.google?.accounts?.id);

  // Load the GIS client script exactly once for the whole app.
  useEffect(() => {
    if (window.google?.accounts?.id) { setReady(true); return; }
    const existing = document.getElementById('gsi-client');
    if (existing) {
      existing.addEventListener('load', () => setReady(true));
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.id = 'gsi-client';
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);

  // Initialize + render the button once the script and client id are available.
  // GIS needs an explicit pixel width (it can't do %), and its max is 400px — so
  // we measure the container and clamp, then re-render on resize. This keeps the
  // button flush with the full-width form fields without overflowing narrow
  // phone modals (a fixed width would spill past the modal edge < ~360px).
  useEffect(() => {
    if (!ready || !clientId || !holder.current || !window.google?.accounts?.id) return;
    const el = holder.current;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (resp) => resp?.credential && cbRef.current(resp.credential),
    });
    const render = () => {
      const avail = el.offsetWidth || el.parentElement?.offsetWidth || 300;
      const width = Math.max(200, Math.min(400, Math.floor(avail)));
      el.innerHTML = '';
      window.google.accounts.id.renderButton(el, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'center',
        width,
      });
    };
    render();
    // Re-render if the container resizes (orientation change, viewport resize).
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(render) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [ready, clientId]);

  if (!clientId) return null;
  return <div ref={holder} className="gsi-holder" />;
}

// Map the server's user payload onto local entitlement shape.
const entitlementFromServer = (u) => ({
  credits: u.creditsRemaining ?? 0,
  unlimitedUntil: u.unlimitedUntil ? Date.parse(u.unlimitedUntil) : null,
});
const MAX_FILE_BYTES = 15 * 1024 * 1024; // mirrors the server's multer limit
const ACCEPTED_FILE = /(pdf|text\/plain|wordprocessingml|^image\/)/i;

const safeLoad = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const sampleLeaseText = `Landlord agrees to lease the dwelling to Tenant for a term of twelve months beginning July 1, 2026, through June 30, 2027. Tenant will pay monthly rent of $2,200 due on the first day of each month. Tenant is responsible for electricity, gas, water, and trash removal. Security deposit shall be one month's rent and may not be commingled with landlord funds. Landlord must provide at least 30 days written notice prior to non-renewal or rent increase. Tenant may terminate with 60 days written notice if the property becomes uninhabitable through no fault of the tenant. Landlord may not enter the property without 24 hours prior notice except in emergencies. All repairs requested in writing must be completed within 14 days or a reasonable time for emergency conditions. Subletting is permitted with prior written consent, which may not be unreasonably withheld.`;

const sampleEmploymentText = `Employee is hired as a Senior Engineer at an annual salary of $145,000, paid semi-monthly. Employment is at-will and may be terminated by either party at any time, with or without cause or notice. Employee agrees not to engage in any competing business for a period of two years following termination, within any state in which the Company operates. All inventions, ideas, and works created during employment, whether or not during work hours, are the sole property of the Company. Employee shall not disclose confidential information indefinitely. Any dispute shall be resolved through binding arbitration, and Employee waives the right to a jury trial and to participate in any class action. Bonuses are discretionary and forfeited if Employee is not employed on the payout date. Unused paid time off is not paid out upon termination.`;

const samplePropertyText = `Buyer agrees to purchase the property at 14 Maple Court for $640,000. Buyer shall deposit earnest money of $25,000, which becomes non-refundable 5 days after the effective date. The sale is contingent on Buyer obtaining financing within 21 days and a satisfactory inspection within 7 days. Seller makes no warranties as to the condition of the property, which is sold strictly "as-is." Buyer shall pay all closing costs, including those customarily paid by the Seller. If Buyer defaults, Seller may retain the earnest money and pursue additional damages. Possession shall be delivered 30 days after closing. Seller is not obligated to make repairs identified during inspection. Title shall be conveyed by quitclaim deed.`;

const sampleGeneralText = `Client engages Provider to deliver marketing services for a fee of $4,000 per month. This Agreement automatically renews for successive 12-month terms unless either party gives 90 days written notice. Client shall pay all invoices within 7 days; late payments accrue interest at 5% per month. Provider's total liability shall not exceed one month of fees, and Provider is not liable for any indirect or consequential damages. Client agrees to indemnify Provider against all claims arising from the engagement. Either party may terminate for material breach, but Client remains liable for the full remaining contract value. This Agreement is governed by the laws of Delaware, and all disputes shall be resolved exclusively in Delaware courts.`;

// Single source of truth for per-type copy + sample text (mirrors server CONTRACT_TYPES).
const CONTRACT_TYPES = [
  {
    id: 'lease',
    label: 'Lease / Rental',
    Icon: HomeWorkOutlinedIcon,
    audienceShort: 'renter',
    eyebrow: 'Lease & Rental Review',
    title: 'Turn a dense lease into a crystal-clear renter defense report.',
    subtitle: 'Paste your lease or upload a PDF, and get a sharp, plain-English breakdown of risk, missing protections, and the best points to negotiate.',
    placeholder: 'Paste your residential lease agreement text…',
    tips: ['Clause-by-clause risk scoring', 'Missing renter protections', 'Plain-English negotiation language'],
    sample: sampleLeaseText,
  },
  {
    id: 'employment',
    label: 'Employment',
    Icon: WorkOutlineIcon,
    audienceShort: 'employee',
    eyebrow: 'Employment & Offer Review',
    title: 'Know exactly what you’re signing before you accept the offer.',
    subtitle: 'Paste your offer or employment agreement and see the catches — non-competes, IP assignment, arbitration, vesting, and severance — in plain English.',
    placeholder: 'Paste your employment contract or offer letter text…',
    tips: ['Non-compete & IP red flags', 'Severance & vesting gaps', 'What to push back on'],
    sample: sampleEmploymentText,
  },
  {
    id: 'property',
    label: 'Property Sale',
    Icon: VpnKeyOutlinedIcon,
    audienceShort: 'buyer',
    eyebrow: 'Real-Estate Purchase Review',
    title: 'Spot the risky terms before you sign the purchase agreement.',
    subtitle: 'Paste your purchase or sale agreement and review contingencies, earnest money, “as-is” clauses, closing costs, and default remedies — protecting the buyer.',
    placeholder: 'Paste your property purchase / sale agreement text…',
    tips: ['Contingency & earnest-money risk', '“As-is” and disclosure gaps', 'Closing-cost surprises'],
    sample: samplePropertyText,
  },
  {
    id: 'general',
    label: 'Other / General',
    Icon: DescriptionOutlinedIcon,
    audienceShort: 'signer',
    eyebrow: 'General Contract Review',
    title: 'Read any contract like a lawyer would — in plain English.',
    subtitle: 'Paste any agreement and get the one-sided clauses surfaced: auto-renewal, liability caps, indemnification, termination traps, and payment terms.',
    placeholder: 'Paste any contract or agreement text…',
    tips: ['Auto-renewal & lock-in traps', 'Liability & indemnity risk', 'Unusual or one-sided clauses'],
    sample: sampleGeneralText,
  },
];

// Inline card form rendered inside <Elements>. Confirms the PaymentIntent on
// the page (no redirect for cards); fulfillment happens server-side via
// /api/billing/confirm once the card succeeds.
function PaymentForm({ plan, priceLabel, onPaid, onCancel }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setErr('');
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required', // cards complete inline; only redirect if a method demands it
      confirmParams: { return_url: `${window.location.origin}/?checkout=success` },
    });
    if (error) {
      setErr(error.message || 'Payment failed. Please try again.');
      setBusy(false);
      return;
    }
    if (paymentIntent && paymentIntent.status === 'succeeded') {
      onPaid(paymentIntent);
    } else {
      setErr('Payment is processing. Your balance will update shortly.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="pay-form">
      <PaymentElement options={{ layout: 'tabs', wallets: { applePay: 'never', googlePay: 'never' } }} />
      {err ? <div className="feedback error"><span>{err}</span></div> : null}
      <div className="pay-actions">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>
          Back
        </button>
        <button type="submit" className="analyze-button" disabled={!stripe || busy}>
          {busy ? 'Processing…' : `Pay ${priceLabel}`}
        </button>
      </div>
      <p className="modal-foot">Test card 4242 4242 4242 4242 · any future date · any CVC</p>
    </form>
  );
}

// Common app loader — a spinning magnifier outline (matches the brand mark).
// size: 'small' | 'medium' | 'large'. Use onAccent for teal/colored backgrounds.
const LOADER_PX = { small: 18, medium: 28, large: 46 };
function Loader({ size = 'medium', onAccent = false, label = 'Loading' }) {
  const px = LOADER_PX[size] || LOADER_PX.medium;
  const track = onAccent ? 'rgba(255,255,255,0.35)' : 'rgba(13,148,136,0.16)';
  const handle = onAccent ? '#ffffff' : '#0d9488';
  const gid = onAccent ? null : `ldr-${size}`;
  return (
    <span className="app-loader" role="status" aria-label={label}>
      <svg viewBox="0 0 48 48" width={px} height={px} aria-hidden="true">
        {gid && (
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#2dd4bf" />
              <stop offset="100%" stopColor="#0d9488" />
            </linearGradient>
          </defs>
        )}
        <g fill="none" strokeLinecap="round">
          <circle cx="19" cy="19" r="13" stroke={track} strokeWidth="4" />
          <line x1="28.5" y1="28.5" x2="41" y2="41" stroke={track} strokeWidth="4.5" />
          <circle className="app-loader-arc" cx="19" cy="19" r="13" stroke={onAccent ? '#ffffff' : `url(#${gid})`} strokeWidth="4" strokeDasharray="26 56" />
          <line x1="28.5" y1="28.5" x2="41" y2="41" stroke={handle} strokeWidth="4.5" />
        </g>
      </svg>
    </span>
  );
}

export default function App() {
  const [contractType, setContractType] = useState(() => safeLoad(TYPE_KEY, 'lease'));
  const [leaseText, setLeaseText] = useState(() => safeLoad(DRAFT_KEY, ''));
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [history, setHistory] = useState(() => safeLoad(HISTORY_KEY, []));
  const [historyPage, setHistoryPage] = useState(1);
  const [expandedHistory, setExpandedHistory] = useState({}); // card id → verdict expanded?
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  // --- Accounts & entitlements (server-enforced via JWT + Postgres) ---
  const [user, setUser] = useState(() => safeLoad(ACCOUNT_KEY, null));
  const [token, setToken] = useState(() => safeLoad(TOKEN_KEY, null));
  const [entitlement, setEntitlement] = useState(() => safeLoad(ENTITLEMENT_KEY, DEFAULT_ENTITLEMENT));
  const [freeUsed, setFreeUsed] = useState(() => safeLoad(FREE_KEY, 0));
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('signup');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [googleClientId, setGoogleClientId] = useState(null);
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState(null); // email awaiting verification (shows "check your email")
  const [resendMsg, setResendMsg] = useState('');
  const [plansOpen, setPlansOpen] = useState(false);
  const [pendingPlan, setPendingPlan] = useState(null); // plan to grant after a forced login

  // Current path — drives the standalone legal routes (/privacy, /terms).
  const [path, setPath] = useState(() => window.location.pathname);
  // Account page — backed by the /account URL so it's bookmarkable.
  const [accountOpen, setAccountOpen] = useState(() => window.location.pathname === '/account');
  const [account, setAccount] = useState(null);
  const [records, setRecords] = useState([]);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsTotalPages, setRecordsTotalPages] = useState(1);
  const [recordsBusy, setRecordsBusy] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', phoneNumber: '' });
  const [profileMsg, setProfileMsg] = useState('');
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Embedded Stripe payment (Payment Element)
  const [publishableKey, setPublishableKey] = useState(null);
  const [payClientSecret, setPayClientSecret] = useState(null);
  const [payPlan, setPayPlan] = useState(null);
  const [paySuccess, setPaySuccess] = useState(null); // the plan just purchased
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  const resultsRef = useRef(null);

  // Load Stripe.js once we know the publishable key.
  const stripePromise = useMemo(() => (publishableKey ? loadStripe(publishableKey) : null), [publishableKey]);

  // Apply an authoritative user object from the server to local state.
  const applyServerUser = (serverUser) => {
    setUser({ name: serverUser.firstName, email: serverUser.email });
    setEntitlement(entitlementFromServer(serverUser));
    setFreeUsed(serverUser.freeTrialsUsed ?? 0);
  };

  const activeType = useMemo(
    () => CONTRACT_TYPES.find((t) => t.id === contractType) || CONTRACT_TYPES[0],
    [contractType]
  );

  // Persist the selected contract type.
  useEffect(() => {
    try {
      localStorage.setItem(TYPE_KEY, JSON.stringify(contractType));
    } catch {
      /* non-fatal */
    }
  }, [contractType]);

  // Persist the in-progress draft so a refresh never loses the user's work.
  useEffect(() => {
    try {
      if (leaseText) localStorage.setItem(DRAFT_KEY, JSON.stringify(leaseText));
      else localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* storage unavailable (private mode) — non-fatal */
    }
  }, [leaseText]);

  // Persist report history across sessions — but ONLY for anonymous users, who
  // have no server-side store. Signed-in users' reports live in /api/records, so
  // we never write that API-sourced analysis data to localStorage; we also purge
  // anything left there from before they signed in.
  useEffect(() => {
    try {
      if (token) {
        localStorage.removeItem(HISTORY_KEY);
      } else {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      }
    } catch {
      /* non-fatal */
    }
  }, [history, token]);

  // Keep the history page in range as the list grows/shrinks (new analysis,
  // clear history, etc.). Clamps to the last valid page, minimum 1.
  const historyTotalPages = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE));
  useEffect(() => {
    if (historyPage > historyTotalPages) setHistoryPage(historyTotalPages);
  }, [historyPage, historyTotalPages]);

  // Briefly flash a "Copied" confirmation.
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(''), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  // Persist account, entitlement, and free-trial usage.
  useEffect(() => {
    try {
      if (user) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(user));
      else localStorage.removeItem(ACCOUNT_KEY);
    } catch {
      /* non-fatal */
    }
  }, [user]);

  // Persist the auth token.
  useEffect(() => {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* non-fatal */
    }
  }, [token]);

  // Fetch the Stripe publishable key so we can mount Elements.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api('/api/billing/config', { auth: false });
        if (!cancelled && data.publishableKey) setPublishableKey(data.publishableKey);
      } catch {
        /* payments simply unavailable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch the Google client id so we can render the "Continue with Google" button.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api('/api/auth/config', { auth: false });
        if (!cancelled && data.googleClientId) setGoogleClientId(data.googleClientId);
      } catch {
        /* Google sign-in simply unavailable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // On load (or token change), refresh entitlement from the server — the
  // authoritative source. A stale/invalid token logs the user out.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api('/api/me');
        if (!cancelled) applyServerUser(data.user);
      } catch {
        if (!cancelled) {
          setToken(null);
          setUser(null);
          setEntitlement(DEFAULT_ENTITLEMENT);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Handle the redirect back from Stripe Checkout.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (!checkout) return;
    window.history.replaceState({}, '', window.location.pathname); // clean the URL

    if (checkout === 'success') {
      setPaySuccess(true); // generic success (we don't know the plan after a redirect)
      const t = safeLoad(TOKEN_KEY, null);
      if (!t) return;
      // The webhook may land a beat after redirect — poll /api/me a few times.
      let tries = 0;
      const poll = async () => {
        tries += 1;
        try {
          applyServerUser((await api('/api/me', { token: t })).user);
        } catch {
          /* ignore; will retry */
        }
        if (tries < 4) setTimeout(poll, 1500);
      };
      poll();
    } else if (checkout === 'cancel') {
      setPlansOpen(true); // they backed out — show plans again
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ENTITLEMENT_KEY, JSON.stringify(entitlement));
    } catch {
      /* non-fatal */
    }
  }, [entitlement]);

  useEffect(() => {
    try {
      localStorage.setItem(FREE_KEY, JSON.stringify(freeUsed));
    } catch {
      /* non-fatal */
    }
  }, [freeUsed]);

  // --- Entitlement helpers ---------------------------------------------------
  const unlimitedActive = !!entitlement.unlimitedUntil && entitlement.unlimitedUntil > Date.now();
  const unlimitedDaysLeft = unlimitedActive
    ? Math.max(1, Math.ceil((entitlement.unlimitedUntil - Date.now()) / DAY_MS))
    : 0;
  const freeLeft = Math.max(0, FREE_TRIAL_LIMIT - freeUsed);

  // What will the next analysis draw from? unlimited → free trial → paid credits.
  const nextDraw = useMemo(() => {
    if (unlimitedActive) return 'unlimited';
    if (freeLeft > 0) return 'free';
    if (entitlement.credits > 0) return 'credit';
    return 'none';
  }, [unlimitedActive, freeLeft, entitlement.credits]);

  const usageLabel = unlimitedActive
    ? `Unlimited · ${unlimitedDaysLeft}d left`
    : entitlement.credits > 0
    ? `${entitlement.credits} ${entitlement.credits === 1 ? 'analysis' : 'analyses'} left`
    : freeLeft > 0
    ? '1 free analysis'
    : 'No analyses left';

  const summaryStats = useMemo(() => {
    if (!analysis?.clauses?.length) return null;
    const counts = analysis.clauses.reduce(
      (acc, clause) => {
        acc[clause.riskLevel || 'green'] += 1;
        return acc;
      },
      { green: 0, yellow: 0, red: 0 }
    );
    return counts;
  }, [analysis]);

  // Overall risk tone drives the verdict banner color.
  const riskTone = useMemo(() => {
    if (!summaryStats) return 'green';
    if (summaryStats.red > 0) return 'red';
    if (summaryStats.yellow > 0) return 'yellow';
    return 'green';
  }, [summaryStats]);

  const loadSampleLease = () => {
    setSelectedFile(null);
    setLeaseText(activeType.sample);
    setError('');
    setAnalysis(null);
  };

  // Switching contract type: keep typed text, but clear file/stale results.
  const changeType = (id) => {
    if (id === contractType) return;
    setContractType(id);
    setSelectedFile(null);
    setError('');
    setAnalysis(null);
  };

  const resetWorkspace = () => {
    setLeaseText('');
    setSelectedFile(null);
    setError('');
    setAnalysis(null);
  };

  const clearHistory = () => setHistory([]);

  // --- Auth & billing (real API: JWT + Postgres) -----------------------------
  const openAuth = (mode) => {
    setAuthMode(mode);
    setAuthForm({ name: '', email: '', password: '' });
    setAuthError('');
    setAuthOpen(true);
  };

  const submitAuth = async (event) => {
    event.preventDefault();
    setAuthError('');
    const email = authForm.email.trim();
    const password = authForm.password;
    if (!email || !password) return;

    setAuthBusy(true);
    try {
      const path = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const body =
        authMode === 'signup'
          ? { firstName: authForm.name.trim() || email.split('@')[0], email, password }
          : { email, password };
      const res = await api(path, { method: 'POST', body, auth: false, raw: true });
      const data = await res.json().catch(() => ({}));

      // Signup no longer logs in — it triggers email verification.
      if (authMode === 'signup' && data.pendingVerification) {
        setPendingEmail(data.email || email);
        setResendMsg('');
        return;
      }
      // Login attempt on an unverified account → send them to "check your email".
      if (res.status === 403 && data.needsVerification) {
        setAuthMode('login');
        setPendingEmail(data.email || email);
        setResendMsg('');
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Authentication failed.');

      setToken(data.token);
      applyServerUser(data.user);
      setAuthOpen(false);

      // Resume a purchase the user started before signing in.
      if (pendingPlan) {
        const plan = pendingPlan;
        setPendingPlan(null);
        choosePlan(plan, data.token);
      }
    } catch (caught) {
      setAuthError(caught.message);
    } finally {
      setAuthBusy(false);
    }
  };

  // Complete a Google sign-in: exchange the GIS credential for our session JWT,
  // then mirror the success path of submitAuth (set token, apply user, resume a
  // pending purchase). Stable identity so GoogleSignInButton doesn't re-init GIS.
  const handleGoogleCredential = useCallback(async (credential) => {
    setAuthError('');
    setAuthBusy(true);
    try {
      const res = await api('/api/auth/google', { method: 'POST', body: { credential }, auth: false, raw: true });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Google sign-in failed.');

      setToken(data.token);
      applyServerUser(data.user);
      setAuthOpen(false);

      if (pendingPlan) {
        const plan = pendingPlan;
        setPendingPlan(null);
        choosePlan(plan, data.token);
      }
    } catch (caught) {
      setAuthError(caught.message);
    } finally {
      setAuthBusy(false);
    }
    // choosePlan/applyServerUser/api are stable enough for this flow; pendingPlan
    // is the only value we branch on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPlan]);

  // Resend the verification email from the "check your email" screen.
  const resendVerification = async () => {
    if (!pendingEmail) return;
    setResendMsg('Sending…');
    try {
      await api('/api/auth/resend-verification', { method: 'POST', body: { email: pendingEmail }, auth: false, raw: true });
      setResendMsg('Sent — check your inbox. The link expires in 30 minutes.');
    } catch {
      setResendMsg('Could not resend right now. Please try again.');
    }
  };

  // Reset the auth modal back to its form (from the "check your email" screen).
  const resetAuthView = () => {
    setPendingEmail(null);
    setResendMsg('');
    setAuthError('');
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setEntitlement(DEFAULT_ENTITLEMENT);
  };

  // Begin checkout. Signed-in users with Stripe configured get the embedded
  // Payment Element; otherwise we fall back to the server-side mock grant.
  const choosePlan = async (plan, overrideToken) => {
    const authToken = overrideToken || token;
    if (!authToken) {
      setPendingPlan(plan);
      setPlansOpen(false);
      openAuth('signup');
      return;
    }
    setCheckoutBusy(true);
    setError('');
    try {
      // Resolve the publishable key now in case the mount-time fetch ran before
      // the server had it (stale tab). This guarantees the card form can mount.
      let pk = publishableKey;
      if (!pk) {
        try {
          const cfg = await api('/api/billing/config', { auth: false });
          if (cfg.publishableKey) {
            pk = cfg.publishableKey;
            setPublishableKey(cfg.publishableKey);
          }
        } catch {
          /* fall through to mock */
        }
      }

      if (pk) {
        // Create a PaymentIntent and open the on-site card form.
        const data = await api('/api/billing/payment-intent', { method: 'POST', body: { plan: plan.id }, token: authToken });
        setPayPlan(plan);
        setPayClientSecret(data.clientSecret);
        setPlansOpen(false);
      } else {
        // No Stripe key configured → instant mock grant (local dev).
        const data = await api('/api/billing/checkout', { method: 'POST', body: { plan: plan.id }, token: authToken });
        if (data.user) applyServerUser(data.user);
        setPlansOpen(false);
      }
    } catch (caught) {
      setError(caught.message);
      setPlansOpen(false);
    } finally {
      setCheckoutBusy(false);
    }
  };

  const closePayment = () => {
    setPayClientSecret(null);
    setPayPlan(null);
  };

  // Called after the card is confirmed: show success, close the form, and grant
  // the plan. Primary path verifies + fulfills server-side via /api/billing/confirm;
  // the /api/me poll is a backstop in case the webhook fulfilled first.
  const handlePaid = async (paymentIntent) => {
    const purchased = payPlan;
    closePayment();
    setPaySuccess(purchased || true);
    const t = token;
    if (!t) return;

    // Primary: confirm + fulfill on the server (re-checked against Stripe).
    if (paymentIntent?.id) {
      try {
        const res = await api('/api/billing/confirm', { method: 'POST', body: { paymentIntentId: paymentIntent.id }, token: t, raw: true });
        if (res.ok) {
          const data = await res.json();
          if (data.user) applyServerUser(data.user);
        }
      } catch {
        /* fall through to polling */
      }
    }

    // Backstop: poll /api/me a few times (covers webhook-first or a failed confirm).
    let tries = 0;
    const poll = async () => {
      tries += 1;
      try {
        applyServerUser((await api('/api/me', { token: t })).user);
      } catch {
        /* retry */
      }
      if (tries < 5) setTimeout(poll, 1500);
    };
    poll();
  };

  // --- Account page ----------------------------------------------------------
  // Shared API client: one place for auth headers, JSON encode/decode, and error
  // handling. Returns parsed JSON and throws Error(data.error) on a non-2xx.
  // Pass { auth: false } for public endpoints, { token } to use a specific token,
  // and { raw: true } when the caller needs the Response to branch on status
  // codes itself (e.g. the 402/403 flows in auth, analyze, and billing).
  const api = async (path, { method = 'GET', body, auth = true, token: tokenOverride, raw = false } = {}) => {
    const headers = {};
    const isJson = body !== undefined && !(body instanceof FormData);
    if (isJson) headers['Content-Type'] = 'application/json';
    const bearer = tokenOverride ?? (auth ? token : null);
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const res = await fetch(path, {
      method,
      headers: Object.keys(headers).length ? headers : undefined,
      body: body === undefined ? undefined : isJson ? JSON.stringify(body) : body,
    });
    if (raw) return res;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed.');
    return data;
  };

  // Fetch one page of saved reports. Kept separate from loadAccount so the pager
  // can reload just the list without re-fetching account stats/billing.
  const RECORDS_PAGE_SIZE = 10;
  const loadRecords = async (page = 1) => {
    if (!token) return;
    setRecordsBusy(true);
    try {
      const data = await api(`/api/records?page=${page}&pageSize=${RECORDS_PAGE_SIZE}`);
      setRecords(data.records || []);
      setRecordsPage(data.pagination?.page || page);
      setRecordsTotalPages(data.pagination?.totalPages || 1);
    } catch {
      /* keep whatever we have */
    } finally {
      setRecordsBusy(false);
    }
  };

  const loadAccount = async () => {
    if (!token) return;
    setAccountBusy(true);
    try {
      // Run the account fetch and the first records page concurrently.
      const accP = api('/api/account');
      const recP = loadRecords(1);
      const data = await accP;
      setAccount(data);
      setProfileForm({
        firstName: data.user.firstName || '',
        lastName: data.user.lastName || '',
        phoneNumber: data.user.phoneNumber || '',
      });
      await recP;
    } catch {
      /* leave whatever we have */
    } finally {
      setAccountBusy(false);
    }
  };

  const openAccount = () => {
    setAccountOpen(true);
    setProfileMsg('');
    setPwMsg('');
    setConfirmDelete(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Keep the URL in sync with the account view: pushing /account makes it
  // bookmarkable; returning to / lets the browser back button close the page.
  useEffect(() => {
    const onAccountPath = window.location.pathname === '/account';
    if (accountOpen && !onAccountPath) {
      window.history.pushState({ account: true }, '', '/account');
    } else if (!accountOpen && onAccountPath) {
      window.history.pushState({}, '', '/');
    }
  }, [accountOpen]);

  // Browser back/forward → reflect the path back into view state.
  useEffect(() => {
    const sync = () => {
      setAccountOpen(window.location.pathname === '/account');
      setPath(window.location.pathname);
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  // Per-route document head — keeps title / description / canonical accurate for
  // the standalone routes so /privacy and /terms index as their own pages, and
  // the private routes (account, auth) stay out of search results. Complements the
  // static tags in index.html for crawlers that execute JS.
  useEffect(() => {
    const SITE = 'https://contractscanner.express';
    const view = accountOpen ? '/account' : path;
    const meta = {
      '/privacy': {
        title: 'Privacy Policy — Contract Red-Flag Scanner',
        description: 'How Contract Red-Flag Scanner collects, uses, and protects your data when you analyze a contract.',
        canonical: `${SITE}/privacy`,
        index: true,
      },
      '/terms': {
        title: 'Terms of Service — Contract Red-Flag Scanner',
        description: 'The terms that govern your use of Contract Red-Flag Scanner, including the informational-only disclaimer.',
        canonical: `${SITE}/terms`,
        index: true,
      },
    }[view] || (view === '/'
      ? {
          title: 'Contract Red-Flag Scanner — Leases, Employment, Property & More',
          description: 'AI contract red-flag scanner for leases, employment offers, property purchase agreements, and any contract — plain-English risk analysis and negotiation prompts.',
          canonical: `${SITE}/`,
          index: true,
        }
      : {
          // /account, /verify-email, /forgot-password, /reset-password — private; keep out of the index.
          title: 'Contract Red-Flag Scanner',
          description: 'AI contract red-flag scanner — plain-English risk analysis and negotiation prompts.',
          canonical: null,
          index: false,
        });

    document.title = meta.title;

    const desc = document.head.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', meta.description);

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (meta.canonical) {
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.appendChild(canonical);
      }
      canonical.href = meta.canonical;
    } else if (canonical) {
      canonical.remove();
    }

    let robots = document.head.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.appendChild(robots);
    }
    robots.content = meta.index
      ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
      : 'noindex, nofollow';
  }, [path, accountOpen]);

  // Client-side navigation for the standalone routes (legal pages, home).
  const navigate = (to) => {
    window.history.pushState({}, '', to);
    setPath(to);
    setAccountOpen(to === '/account');
    window.scrollTo({ top: 0 });
  };

  // Load account data whenever the view opens — also covers a deep-link/reload on /account.
  useEffect(() => {
    if (accountOpen && token) loadAccount();
    else if (accountOpen && !token) setAccountOpen(false); // no session → leave /account
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountOpen, token]);

  // The home "Saved reports" grid is server-backed for signed-in users, so load
  // the first page whenever a session appears (login, or reload with a token).
  useEffect(() => {
    if (token) loadRecords(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const saveProfile = async (event) => {
    event.preventDefault();
    setProfileMsg('');
    try {
      const data = await api('/api/account', { method: 'PATCH', body: profileForm });
      applyServerUser(data.user);
      setAccount((a) => (a ? { ...a, user: data.user } : a));
      setProfileMsg('Saved ✓');
    } catch (caught) {
      setProfileMsg(caught.message);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setPwMsg('');
    try {
      await api('/api/account/password', { method: 'POST', body: pwForm });
      setPwForm({ currentPassword: '', newPassword: '' });
      setPwMsg('Password updated ✓');
    } catch (caught) {
      setPwMsg(caught.message);
    }
  };

  const deleteAccount = async () => {
    try {
      await api('/api/account', { method: 'DELETE' });
      setAccountOpen(false);
      logout();
      setHistory([]);
    } catch (caught) {
      setProfileMsg(caught.message);
    }
  };

  // Reopen a saved (server-side) report.
  const reopenRecord = async (id) => {
    try {
      const data = await api(`/api/records/${id}`);
      setAnalysis(data.report);
      setAccountOpen(false);
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch {
      /* ignore */
    }
  };

  // Validate a file client-side before we ever hit the network.
  const acceptFile = (file) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setSelectedFile(null);
      setError(`That file is ${Math.round(file.size / 1024 / 1024)} MB — the limit is 15 MB. Try a smaller file or paste the text.`);
      return;
    }
    if (file.type && !ACCEPTED_FILE.test(file.type)) {
      setSelectedFile(null);
      setError('Unsupported file type. Upload a PDF, TXT, DOCX, or an image.');
      return;
    }
    setError('');
    setSelectedFile(file);
  };

  const analyzeLease = async () => {
    setError('');

    const text = leaseText.trim();
    if (!text && !selectedFile) {
      setError('Paste contract text or upload a file before analyzing.');
      return;
    }

    // Entitlement gate: 1 free trial, then login + a subscription is required.
    const draw = nextDraw;
    if (draw === 'none') {
      setPlansOpen(true);
      return;
    }

    setAnalysis(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('contractType', contractType);
      if (selectedFile) {
        formData.append('leaseFile', selectedFile);
      }
      if (text) {
        formData.append('leaseText', text);
      }

      const response = await api('/api/analyze', { method: 'POST', body: formData, raw: true });

      // Server says the account is out of analyses → open the paywall.
      if (response.status === 402) {
        const body = await response.json().catch(() => null);
        if (body?.user) applyServerUser(body.user);
        setPlansOpen(true);
        return;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = body?.error || `API error ${response.status}`;
        throw new Error(message);
      }

      const data = await response.json();
      setAnalysis(data);
      // Sync entitlement: server is authoritative for signed-in users; the
      // anonymous free trial is tracked locally.
      if (data.meta?.user) applyServerUser(data.meta.user);
      else if (!token) setFreeUsed((n) => n + 1);
      if (token) {
        // Signed-in users' reports live server-side — pull the fresh first page
        // so the just-saved report shows up. Nothing is written to localStorage.
        loadRecords(1);
      } else {
        // Anonymous users have no server store, so keep a local-only history as
        // their only way to reopen past reports.
        setHistory((current) => [
          {
            id: `${Date.now()}`,
            when: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
            typeId: contractType,
            typeLabel: data.meta?.contractTypeLabel || activeType.label,
            verdict: data.overallSummary?.verdict || 'Unknown',
            clauseCount: data.clauses?.length || 0,
            redCount: data.clauses?.filter((clause) => clause.riskLevel === 'red').length || 0,
            snapshot: data, // full result so the report can be reopened later
          },
          ...current,
        ].slice(0, 30));
        setHistoryPage(1); // show the newest report (it lands on the first page)
      }

      // Bring the user straight to their results.
      requestAnimationFrame(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (caught) {
      setError(caught.message || 'Unable to parse the contract analysis.');
    } finally {
      setLoading(false);
    }
  };

  // Reopen a stored report.
  const restoreReport = (item) => {
    if (!item?.snapshot) return;
    setAnalysis(item.snapshot);
    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const copyToClipboard = async (value, tag) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(tag);
    } catch {
      setError('Could not access the clipboard.');
    }
  };

  // Build a plain-text version of the whole report for copy/export.
  const buildReportText = () => {
    if (!analysis) return '';
    const typeLabel = analysis.meta?.contractTypeLabel || activeType.label;
    const lines = [];
    lines.push(`${typeLabel.toUpperCase()} — RED-FLAG REPORT`);
    lines.push('='.repeat(40));
    lines.push(`Verdict: ${analysis.overallSummary?.verdict || 'N/A'}`);
    if (analysis.overallSummary?.topFixes?.length) {
      lines.push('\nTop fixes before signing:');
      analysis.overallSummary.topFixes.forEach((fix, i) => lines.push(`  ${i + 1}. ${fix}`));
    }
    lines.push('\nCLAUSE-BY-CLAUSE');
    lines.push('-'.repeat(40));
    analysis.clauses?.forEach((c, i) => {
      lines.push(`\nClause ${i + 1} [${(c.riskLevel || 'green').toUpperCase()}]`);
      lines.push(c.text || '');
      if (c.summary) lines.push(`Why it matters: ${c.summary}`);
      if (c.negotiationScript) lines.push(`Negotiate: "${c.negotiationScript}"`);
    });
    if (analysis.missingProtections?.length) {
      lines.push('\nMISSING PROTECTIONS');
      lines.push('-'.repeat(40));
      analysis.missingProtections.forEach((m) => lines.push(`• ${m}`));
    }
    lines.push('\n— Informational only, not legal advice.');
    return lines.join('\n');
  };

  const downloadReport = () => {
    const blob = new Blob([buildReportText()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(analysis.meta?.contractType || activeType.id)}-red-flag-report.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const win = window.open('', '_blank', 'width=720,height=900');
    if (!win) return;
    const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const clauseHtml = (analysis.clauses || [])
      .map(
        (c, i) => `<div class="c ${c.riskLevel || 'green'}"><h3>Clause ${i + 1} · ${(c.riskLevel || 'green').toUpperCase()}</h3>
        <p class="t">${esc(c.text)}</p>${c.summary ? `<p class="s">${esc(c.summary)}</p>` : ''}
        ${c.negotiationScript ? `<p class="n"><b>Negotiate:</b> ${esc(c.negotiationScript)}</p>` : ''}</div>`
      )
      .join('');
    const typeLabel = analysis.meta?.contractTypeLabel || activeType.label;
    win.document.write(`<!doctype html><html><head><title>${esc(typeLabel)} Red-Flag Report</title>
      <style>body{font:14px/1.6 -apple-system,system-ui,sans-serif;color:#111;max-width:680px;margin:32px auto;padding:0 20px}
      h1{font-size:22px;margin:0 0 4px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#666;margin:24px 0 8px}
      .c{border-left:4px solid #ccc;padding:8px 0 8px 14px;margin:12px 0}.c.red{border-color:#dc2626}.c.yellow{border-color:#d97706}.c.green{border-color:#16a34a}
      .c h3{font-size:13px;margin:0 0 6px}.t{color:#333}.s{font-weight:600}.n{background:#f4f4f5;padding:8px 10px;border-radius:8px}
      ol,ul{padding-left:20px}small{color:#888}</style></head><body>
      <h1>${esc(typeLabel)} — Red-Flag Report</h1><small>${esc(analysis.overallSummary?.verdict || '')}</small>
      ${analysis.overallSummary?.topFixes?.length ? `<h2>Top fixes before signing</h2><ol>${analysis.overallSummary.topFixes.map((f) => `<li>${esc(f)}</li>`).join('')}</ol>` : ''}
      <h2>Clause-by-clause</h2>${clauseHtml}
      ${analysis.missingProtections?.length ? `<h2>Missing protections</h2><ul>${analysis.missingProtections.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
      <p><small>Informational only, not legal advice.</small></p>
      <script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
  };

  const onTextareaKeyDown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      if (!loading) analyzeLease();
    }
  };

  const renderRiskLabel = (riskLevel) => {
    const labelMap = {
      green: { text: 'Standard', className: 'pill green' },
      yellow: { text: 'Caution', className: 'pill yellow' },
      red: { text: 'High Risk', className: 'pill red' },
    };
    return <span className={labelMap[riskLevel]?.className || 'pill'}>{labelMap[riskLevel]?.text || riskLevel}</span>;
  };

  // --- Home "Saved reports" grid data source -------------------------------
  // Signed-in users see their full server history (paginated via /api/records);
  // signed-out users fall back to the local browser history.
  const usingServerReports = !!token;
  const savedReports = usingServerReports
    ? records.map((r) => ({
        id: r.id,
        when: new Date(r.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        typeId: r.recordType,
        typeLabel: CONTRACT_TYPES.find((c) => c.id === r.recordType)?.label || r.recordType,
        verdict: r.verdict || 'Unknown',
        clauseCount: r.clauseCount,
        redCount: r.redCount,
        server: true, // reopen by id from the server
      }))
    : history.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE);
  const savedPage = usingServerReports ? recordsPage : historyPage;
  const savedTotalPages = usingServerReports ? recordsTotalPages : historyTotalPages;
  const savedPagerBusy = usingServerReports ? recordsBusy : false;
  const gotoSavedPage = (next) => {
    const target = Math.max(1, Math.min(savedTotalPages, next));
    if (usingServerReports) loadRecords(target);
    else setHistoryPage(target);
  };
  const openSavedReport = (item) => (item.server ? reopenRecord(item.id) : restoreReport(item));
  const hasSavedReports = usingServerReports ? records.length > 0 : history.length > 0;

  // Standalone legal routes render as their own full-page views.
  if (path === '/privacy' || path === '/terms') {
    return <LegalPage doc={path === '/privacy' ? 'privacy' : 'terms'} onNavigate={navigate} />;
  }

  // Email-verification landing page (from the link in the verification email).
  if (path === '/verify-email') {
    return (
      <VerifyEmailPage
        onNavigate={navigate}
        onLoginRedirect={() => { setAuthMode('login'); resetAuthView(); setAuthOpen(true); navigate('/'); }}
      />
    );
  }

  // Forgot-password: collect an email and request a reset link.
  if (path === '/forgot-password') {
    return <ForgotPasswordPage onNavigate={navigate} />;
  }

  // Reset-password landing page (from the link in the reset email).
  if (path === '/reset-password') {
    return (
      <ResetPasswordPage
        onNavigate={navigate}
        onLoginRedirect={() => { setAuthMode('login'); resetAuthView(); setAuthOpen(true); navigate('/'); }}
      />
    );
  }

  return (
    <div className="app-shell">
      {loading ? (
        <div className="loading-overlay">
          <div className="loading-frame">
            <Loader size="large" label="Analyzing contract" />
            <div>
              <p className="loading-title">Scanning your {activeType.label.toLowerCase()} contract</p>
              <p className="loading-subtitle">AI is reviewing clauses, risks, and negotiation opportunities.</p>
            </div>
          </div>
        </div>
      ) : null}
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <div className="topbar">
        <div className="brand">
          <img src="/logo-mark.svg" className="brand-logo" alt="Contract Scanner logo" width="36" height="36" />
          <span>Contract Scanner</span>
        </div>
        <div className="account">
          <span className={`usage-pill ${nextDraw === 'none' ? 'empty' : ''}`}>
            {unlimitedActive ? <WorkspacePremiumOutlinedIcon style={{ fontSize: 16 }} /> : <BoltOutlinedIcon style={{ fontSize: 16 }} />}
            <span>{usageLabel}</span>
          </span>
          {user ? (
            <>
              <button type="button" className="upgrade-button" onClick={() => setPlansOpen(true)}>
                {unlimitedActive ? 'Manage plan' : 'Upgrade'}
              </button>
              <button type="button" className="user-chip" title="My account" onClick={openAccount}>
                <AccountCircleOutlinedIcon fontSize="small" />
                <span>{user.name}</span>
              </button>
              <button type="button" className="icon-button" onClick={logout} title="Sign out">
                <LogoutOutlinedIcon fontSize="small" />
              </button>
            </>
          ) : (
            <>
              <button type="button" className="secondary-button compact" onClick={() => openAuth('login')}>
                <LoginOutlinedIcon fontSize="small" />
                <span>Sign in</span>
              </button>
              <button type="button" className="upgrade-button" onClick={() => setPlansOpen(true)}>
                View plans
              </button>
            </>
          )}
        </div>
      </div>

      {accountOpen ? (
        <section className="panel account-panel">
          <button type="button" className="ghost-button acct-back" onClick={() => setAccountOpen(false)}>
            <ArrowBackRoundedIcon fontSize="small" /><span>Back to scanner</span>
          </button>

          <div className="acct-hero">
            <div className="acct-avatar">{(account?.user?.firstName || user?.name || '?').slice(0, 1).toUpperCase()}</div>
            <div className="acct-id">
              <h2>{account?.user?.firstName} {account?.user?.lastName}</h2>
              <p>{account?.user?.email}</p>
              <p className="acct-since">
                <CalendarMonthOutlinedIcon style={{ fontSize: 14, verticalAlign: '-2px' }} />{' '}
                Member since {account?.user?.createdAt ? new Date(account.user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '—'}
              </p>
            </div>
            <span className={`risk-badge ${unlimitedActive ? 'green' : 'yellow'}`} style={{ textTransform: 'capitalize' }}>
              {account?.user?.subscriptionType || 'free'} plan
            </span>
          </div>

          <div className="acct-grid">
            <div className="acct-card">
              <h3><BoltOutlinedIcon fontSize="small" /> Plan & credits</h3>
              <p className="acct-big">{usageLabel}</p>
              <p className="acct-sub">
                {unlimitedActive
                  ? 'Unlimited access active'
                  : `${entitlement.credits} paid ${entitlement.credits === 1 ? 'credit' : 'credits'} · ${Math.max(0, 1 - freeUsed)} free trial left`}
              </p>
              <button type="button" className="plan-cta" onClick={() => { setAccountOpen(false); setPlansOpen(true); }}>
                {unlimitedActive ? 'Manage plan' : 'Upgrade / buy more'}
              </button>
            </div>

            <div className="acct-card">
              <h3><InsightsOutlinedIcon fontSize="small" /> Your activity</h3>
              <div className="acct-stats">
                <div><strong>{account?.stats?.totalAnalyses ?? 0}</strong><span>Analyses</span></div>
                <div><strong>{account?.stats?.redFlags ?? 0}</strong><span>Red flags</span></div>
                <div><strong>{records.length}</strong><span>Saved</span></div>
              </div>
              {account?.stats?.byType?.length ? (
                <div className="acct-bytype">
                  {account.stats.byType.map((t) => {
                    const Glyph = iconForType(t.record_type);
                    const label = CONTRACT_TYPES.find((c) => c.id === t.record_type)?.label || t.record_type;
                    return (
                      <span key={t.record_type} className="bytype-chip">
                        <Glyph style={{ fontSize: 14, verticalAlign: '-2px' }} /> {label} · {t.count}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="acct-sub">No analyses yet.</p>
              )}
            </div>
          </div>

          <div className="acct-card">
            <h3><DescriptionOutlinedIcon fontSize="small" /> Saved reports</h3>
            {accountBusy && !records.length ? (
              <p className="acct-sub acct-loading"><Loader size="small" /> Loading…</p>
            ) : records.length ? (
              <div className="acct-list">
                {records.map((r) => {
                  const Glyph = iconForType(r.recordType);
                  const label = CONTRACT_TYPES.find((c) => c.id === r.recordType)?.label || r.recordType;
                  return (
                    <button key={r.id} type="button" className="acct-row" onClick={() => reopenRecord(r.id)}>
                      <span className="acct-row-main"><Glyph style={{ fontSize: 16, verticalAlign: '-3px' }} /> {label}</span>
                      <span className="acct-row-mid">{r.verdict || '—'}</span>
                      <span className="acct-row-meta">{r.clauseCount} clauses · <span className={r.redCount ? 'redflag' : ''}>{r.redCount} red</span></span>
                      <span className="acct-row-date">{new Date(r.createdAt).toLocaleDateString()}</span>
                      <ArrowForwardRoundedIcon style={{ fontSize: 16 }} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="acct-sub">Your analyzed contracts will appear here.</p>
            )}
            {records.length > 0 && (
              <div className="acct-pager">
                <button
                  type="button"
                  className="pager-btn"
                  disabled={recordsBusy || recordsPage <= 1}
                  onClick={() => loadRecords(recordsPage - 1)}
                >
                  ← Prev
                </button>
                <span className="pager-info">Page {recordsPage} of {recordsTotalPages}</span>
                <button
                  type="button"
                  className="pager-btn"
                  disabled={recordsBusy || recordsPage >= recordsTotalPages}
                  onClick={() => loadRecords(recordsPage + 1)}
                >
                  Next →
                </button>
              </div>
            )}
          </div>

          <div className="acct-card">
            <h3><ReceiptLongOutlinedIcon fontSize="small" /> Billing history</h3>
            {account?.payments?.length ? (
              <div className="acct-list">
                {account.payments.map((p) => (
                  <div key={p.id} className="acct-row static">
                    <span className="acct-row-main" style={{ textTransform: 'capitalize' }}>{p.category}</span>
                    <span className="acct-row-mid">${(p.amountCents / 100).toFixed(2)} {p.currency}</span>
                    <span className={`pay-status ${p.status}`}>{p.status}</span>
                    <span className="acct-row-date">{new Date(p.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="acct-sub">No payments yet.</p>
            )}
          </div>

          <div className="acct-grid">
            <form className="acct-card" onSubmit={saveProfile}>
              <h3><BadgeOutlinedIcon fontSize="small" /> Profile</h3>
              <label className="field"><span>First name</span>
                <input value={profileForm.firstName} onChange={(e) => setProfileForm((f) => ({ ...f, firstName: e.target.value }))} />
              </label>
              <label className="field"><span>Last name</span>
                <input value={profileForm.lastName} onChange={(e) => setProfileForm((f) => ({ ...f, lastName: e.target.value }))} />
              </label>
              <label className="field"><span>Phone</span>
                <input value={profileForm.phoneNumber} onChange={(e) => setProfileForm((f) => ({ ...f, phoneNumber: e.target.value }))} placeholder="+1 555 123 4567" />
              </label>
              <div className="acct-form-foot">
                <button type="submit" className="secondary-button"><EditOutlinedIcon fontSize="small" /><span>Save changes</span></button>
                {profileMsg ? <span className="acct-msg">{profileMsg}</span> : null}
              </div>
            </form>

            <form className="acct-card" onSubmit={changePassword}>
              <h3><LockOutlinedIcon fontSize="small" /> Password</h3>
              <label className="field"><span>Current password</span>
                <input type="password" value={pwForm.currentPassword} onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))} />
              </label>
              <label className="field"><span>New password</span>
                <input type="password" minLength={8} value={pwForm.newPassword} onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))} placeholder="At least 8 characters" />
              </label>
              <div className="acct-form-foot">
                <button type="submit" className="secondary-button">Update password</button>
                {pwMsg ? <span className="acct-msg">{pwMsg}</span> : null}
              </div>
            </form>
          </div>

          <div className="acct-card danger">
            <h3>Danger zone</h3>
            <div className="acct-danger-row">
              <div><strong>Sign out</strong><p className="acct-sub">End your session on this device.</p></div>
              <button type="button" className="secondary-button" onClick={() => { setAccountOpen(false); logout(); }}>
                <LogoutOutlinedIcon fontSize="small" /><span>Sign out</span>
              </button>
            </div>
            <div className="acct-danger-row">
              <div><strong>Delete account</strong><p className="acct-sub">Permanently remove your account, reports, and billing history.</p></div>
              {confirmDelete ? (
                <span className="acct-confirm">
                  <button type="button" className="retry-button" onClick={deleteAccount}>Confirm delete</button>
                  <button type="button" className="secondary-button" onClick={() => setConfirmDelete(false)}>Cancel</button>
                </span>
              ) : (
                <button type="button" className="danger-button" onClick={() => setConfirmDelete(true)}>
                  <DeleteOutlineOutlinedIcon fontSize="small" /><span>Delete</span>
                </button>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {!accountOpen ? (
      <>
      <header className="hero">
        <div className="hero-copy">
          <div className="eyebrow">Contract Red-Flag Scanner · {activeType.eyebrow}</div>
          <h1>{activeType.title}</h1>
          <p className="subtitle">{activeType.subtitle}</p>

          <div className="type-selector" role="tablist" aria-label="Contract type">
            {CONTRACT_TYPES.map((type) => (
              <button
                key={type.id}
                type="button"
                role="tab"
                aria-selected={type.id === contractType}
                className={`type-option ${type.id === contractType ? 'active' : ''}`}
                onClick={() => changeType(type.id)}
                disabled={loading}
              >
                <type.Icon className="type-icon" fontSize="small" />
                <span className="type-label">{type.label}</span>
              </button>
            ))}
          </div>

          <div className="pill-row">
            {featurePills.map((pill) => (
              <span className="feature-pill" key={pill}>{pill}</span>
            ))}
          </div>
        </div>

        <div className="hero-card">
          <div className="hero-card-header">
            <span className="dot dot-blue" />
            <span className="dot dot-purple" />
            <span className="dot dot-cyan" />
          </div>
          <div className="hero-card-body">
            <div>
              <p className="metric-label">Instant signal</p>
              <p className="metric-value">Red-flag clauses, surfaced fast.</p>
            </div>
            <div className="hero-card-grid">
              <div className="mini-stat">
                <strong>PDF</strong>
                <span>Upload-ready</span>
              </div>
              <div className="mini-stat">
                <strong>AI</strong>
                <span>Clause review</span>
              </div>
              <div className="mini-stat">
                <strong>Talk</strong>
                <span>Negotiation lines</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="panel input-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Inspection Studio</p>
            <h2>Drop in the contract and let the analysis unfold.</h2>
          </div>
          <div className="disclaimer">
            <strong>Disclaimer:</strong> Informational only, not legal advice. Confirm important terms with a licensed attorney. See our{' '}
            <a href="/terms" onClick={(e) => { e.preventDefault(); navigate('/terms'); }}>Terms</a> and{' '}
            <a href="/privacy" onClick={(e) => { e.preventDefault(); navigate('/privacy'); }}>Privacy Policy</a>.
          </div>
        </div>

        <div className="input-grid">
          <div className="textarea-shell">
            <label className="label" htmlFor="leaseText">Paste {activeType.label.toLowerCase()} text here</label>
            <textarea
              id="leaseText"
              value={leaseText}
              onChange={(event) => setLeaseText(event.target.value)}
              onKeyDown={onTextareaKeyDown}
              placeholder={activeType.placeholder}
              rows={15}
            />
            <div className="textarea-foot">
              <span className={leaseText.length > 18000 ? 'count over' : 'count'}>
                {leaseText.length.toLocaleString()} chars
                {leaseText.length > 18000 ? ' · only the first 18,000 are analyzed' : ''}
              </span>
              <span className="kbd-hint"><kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Enter</kbd> to analyze</span>
            </div>
          </div>

          <div className="side-stack">
            <div
              className={`upload-block ${selectedFile ? 'upload-block-ready' : ''} ${dragActive ? 'drag-active' : ''}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                acceptFile(event.dataTransfer.files?.[0]);
              }}
            >
              <div className="upload-header">
                <div>
                  <p className="upload-label">Upload your contract file</p>
                  <p className="upload-hint">
                    Drag & drop a .pdf, .txt, .docx, or a photo/scan of the contract here, or pick one from your device.
                  </p>
                </div>
                <label className="upload-button" htmlFor="leaseFile">
                  <UploadFileOutlinedIcon fontSize="small" />
                  <span>{selectedFile ? 'Change file' : 'Choose file'}</span>
                </label>
              </div>
              <input
                id="leaseFile"
                type="file"
                accept="application/pdf,.txt,.docx,image/*"
                onChange={(event) => acceptFile(event.target.files?.[0] || null)}
                hidden
              />
              <div className="file-details">
                {selectedFile ? (
                  <>
                    <div className="file-line">
                      <p className="file-name">Selected</p>
                      <div className="file-badges">
                        <span className="file-badge">{selectedFile.type || 'file'}</span>
                        <span className="file-badge">{Math.round(selectedFile.size / 1024)} KB</span>
                      </div>
                    </div>
                    <p className="file-meta">{selectedFile.name}</p>
                  </>
                ) : (
                  <>
                    <div className="file-line">
                      <p className="file-placeholder">No file chosen</p>
                      <div className="file-badges">
                        <span className="file-badge">.pdf</span>
                        <span className="file-badge">.txt</span>
                        <span className="file-badge">.docx</span>
                        <span className="file-badge">image</span>
                      </div>
                    </div>
                    <p className="file-meta">Drop a supported file or choose one from your device.</p>
                  </>
                )}
              </div>
            </div>

            <div className="action-row">
              <button onClick={analyzeLease} disabled={loading} className="analyze-button">
                {loading ? (
                  <span className="button-content">
                    <Loader size="small" onAccent label="Analyzing" />
                    <span>Analyzing…</span>
                  </span>
                ) : nextDraw === 'none' ? (
                  <span className="button-content">
                    <LockOutlinedIcon fontSize="small" />
                    <span>Unlock more analyses</span>
                  </span>
                ) : (
                  <span className="button-content">
                    <AutoAwesomeOutlinedIcon fontSize="small" />
                    <span>Analyze contract</span>
                  </span>
                )}
              </button>
              <button type="button" className="secondary-button" onClick={loadSampleLease} disabled={loading}>
                Load sample
              </button>
            </div>
            <p className="access-note">
              {nextDraw === 'unlimited'
                ? `Unlimited plan active · ${unlimitedDaysLeft} days left`
                : nextDraw === 'credit'
                ? `${entitlement.credits} ${entitlement.credits === 1 ? 'analysis' : 'analyses'} remaining on your plan`
                : nextDraw === 'free'
                ? 'Your first analysis is free — no account needed'
                : 'Free trial used. Sign in and choose a plan to continue.'}
            </p>
            <button type="button" className="ghost-button" onClick={resetWorkspace} disabled={loading}>
              <RestartAltOutlinedIcon fontSize="small" />
              <span>Clear all</span>
            </button>

            {error ? (
              <div className="feedback error" role="alert">
                <span>{error}</span>
                <button type="button" className="retry-button" onClick={analyzeLease} disabled={loading}>
                  <ReplayOutlinedIcon fontSize="small" />
                  <span>Retry</span>
                </button>
              </div>
            ) : null}

            <div className="tips-card">
              <h3>What you’ll get</h3>
              <ul>
                {activeType.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {analysis ? (
        <section className="panel result-panel" ref={resultsRef}>
          {analysis.meta?.truncated ? (
            <div className="notice">
              <WarningAmberOutlinedIcon fontSize="small" />
              <span>This contract was long, so only the first ~18,000 characters were analyzed. For full coverage, split it and run the remainder separately.</span>
            </div>
          ) : null}

          <div className={`summary-card tone-${riskTone}`}>
            <div className="summary-top">
              <div>
                <p className="section-kicker">
                  Executive Snapshot · {analysis.meta?.contractTypeLabel || activeType.label}
                </p>
                <div className="verdict-row">
                  <span className={`risk-badge ${riskTone}`}>
                    {riskTone === 'red' ? 'High risk' : riskTone === 'yellow' ? 'Review needed' : 'Looks fair'}
                  </span>
                </div>
                <h2>{analysis.overallSummary?.verdict || 'Unable to compute verdict.'}</h2>
              </div>
              <div className="stats-row">
                <div className="stat-chip">
                  <strong>{analysis.clauses?.length || 0}</strong>
                  <span>Clauses</span>
                </div>
                <div className="stat-chip">
                  <strong>{summaryStats?.red || 0}</strong>
                  <span>High risk</span>
                </div>
                <div className="stat-chip">
                  <strong>{summaryStats?.yellow || 0}</strong>
                  <span>Watchlist</span>
                </div>
              </div>
            </div>

            <div className="report-actions">
              <button type="button" className="secondary-button" onClick={() => copyToClipboard(buildReportText(), 'report')}>
                {copied === 'report' ? <DoneOutlinedIcon fontSize="small" /> : <ContentCopyOutlinedIcon fontSize="small" />}
                <span>{copied === 'report' ? 'Copied' : 'Copy report'}</span>
              </button>
              <button type="button" className="secondary-button" onClick={downloadReport}>
                <FileDownloadOutlinedIcon fontSize="small" />
                <span>Download .txt</span>
              </button>
              <button type="button" className="secondary-button" onClick={printReport}>
                <PrintOutlinedIcon fontSize="small" />
                <span>Print / Save PDF</span>
              </button>
            </div>

            {analysis.overallSummary?.topFixes?.length ? (
              <div className="fix-list-box">
                <h3>Top 3 things to fix before signing</h3>
                <ol>
                  {analysis.overallSummary.topFixes.slice(0, 3).map((fix, index) => (
                    <li key={index}>{fix}</li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>

          <div className="dashboard-panel">
            <div className="section-title-row">
              <div>
                <p className="section-kicker">Risk Dashboard</p>
                <h2>Clause-level intelligence</h2>
              </div>
            </div>
            <div className="grid">
              {analysis.clauses?.map((clause, index) => (
                <article className={`clause-card ${clause.riskLevel || 'green'}`} key={index}>
                  <div className="card-header">
                    <h3>Clause {index + 1}</h3>
                    {renderRiskLabel(clause.riskLevel)}
                  </div>
                  <p className="clause-text">{clause.text}</p>
                  <p className="clause-summary">{clause.summary}</p>
                  {clause.negotiationScript ? (
                    <div className="negotiation-block">
                      <div className="negotiation-head">
                        <strong>Suggested negotiation line</strong>
                        <button
                          type="button"
                          className="copy-chip"
                          onClick={() => copyToClipboard(clause.negotiationScript, `clause-${index}`)}
                        >
                          {copied === `clause-${index}` ? <DoneOutlinedIcon style={{ fontSize: 14 }} /> : <ContentCopyOutlinedIcon style={{ fontSize: 14 }} />}
                          <span>{copied === `clause-${index}` ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <p>{clause.negotiationScript}</p>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </div>

          <div className="protections-panel">
            <div className="section-title-row">
              <div>
                <p className="section-kicker">Protection Gap Review</p>
                <h2>Missing protections</h2>
              </div>
            </div>
            {analysis.missingProtections?.length ? (
              <ul className="missing-list">
                {analysis.missingProtections.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="all-good">
                <ShieldOutlinedIcon fontSize="small" />
                <span>No major protection gaps detected in the contract text provided.</span>
              </p>
            )}
          </div>
        </section>
      ) : null}

      {hasSavedReports ? (
        <section className="panel history-panel">
          <div className="section-title-row">
            <div>
              <p className="section-kicker">Saved reports</p>
              <h2>Pick up where you left off</h2>
            </div>
            {!usingServerReports && (
              <button type="button" className="ghost-button" onClick={clearHistory}>
                <DeleteOutlineOutlinedIcon fontSize="small" />
                <span>Clear history</span>
              </button>
            )}
          </div>
          <div className={savedPagerBusy ? 'history-grid loading' : 'history-grid'}>
            {savedReports.map((item) => {
              const TypeGlyph = iconForType(item.typeId);
              const expanded = !!expandedHistory[item.id];
              // Only offer the expand toggle when the verdict is long enough to clamp.
              const isLongVerdict = (item.verdict || '').length > 110;
              return (
                <button
                  key={item.id}
                  type="button"
                  className="history-card"
                  onClick={() => openSavedReport(item)}
                  title="Reopen this report"
                >
                  <span className="history-time">
                    <TypeGlyph style={{ fontSize: 15, verticalAlign: '-3px' }} />
                    {' '}{item.typeLabel || 'Contract'} · {item.when}
                  </span>
                  <strong className={isLongVerdict && !expanded ? 'history-verdict clamped' : 'history-verdict'}>
                    {item.verdict}
                  </strong>
                  {isLongVerdict && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="history-toggle"
                      aria-expanded={expanded}
                      onClick={(e) => {
                        e.stopPropagation(); // don't trigger the card's reopen
                        setExpandedHistory((m) => ({ ...m, [item.id]: !m[item.id] }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          setExpandedHistory((m) => ({ ...m, [item.id]: !m[item.id] }));
                        }
                      }}
                    >
                      {expanded ? 'Show less' : 'Show more'}
                      <KeyboardArrowDownRoundedIcon
                        style={{ fontSize: 16, verticalAlign: '-4px', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}
                      />
                    </span>
                  )}
                  <span className="history-meta">
                    {item.clauseCount} clauses · <span className={item.redCount ? 'redflag' : ''}>{item.redCount} red flags</span>
                  </span>
                  <span className="history-open">Reopen <ArrowForwardRoundedIcon style={{ fontSize: 15, verticalAlign: '-3px' }} /></span>
                </button>
              );
            })}
          </div>
          {savedTotalPages > 1 && (
            <div className="acct-pager">
              <button
                type="button"
                className="pager-btn"
                disabled={savedPagerBusy || savedPage <= 1}
                onClick={() => gotoSavedPage(savedPage - 1)}
              >
                ← Prev
              </button>
              <span className="pager-info">
                {savedPagerBusy ? (
                  <><Loader size="small" label="Loading page" /> Loading…</>
                ) : (
                  `Page ${savedPage} of ${savedTotalPages}`
                )}
              </span>
              <button
                type="button"
                className="pager-btn"
                disabled={savedPagerBusy || savedPage >= savedTotalPages}
                onClick={() => gotoSavedPage(savedPage + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </section>
      ) : null}
      </>
      ) : null}

      {plansOpen ? (
        <div className="modal-overlay" onClick={() => setPlansOpen(false)}>
          <div className="modal plans-modal" role="dialog" aria-modal="true" aria-label="Choose a plan" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close icon-button" onClick={() => setPlansOpen(false)} aria-label="Close">
              <CloseRoundedIcon fontSize="small" />
            </button>
            <div className="modal-head">
              <span className="modal-kicker"><LockOutlinedIcon style={{ fontSize: 16 }} /> {freeLeft > 0 ? 'Plans & pricing' : 'You’ve used your free analysis'}</span>
              <h2>Pick a plan to keep analyzing</h2>
              <p>Your first analysis is free. After that, choose the plan that fits how many contracts you’re reviewing.</p>
            </div>
            <div className="plans-grid">
              {PLANS.map((plan) => (
                <div key={plan.id} className={`plan-card ${plan.popular ? 'popular' : ''}`}>
                  {plan.popular ? <span className="plan-flag">Most popular</span> : null}
                  <plan.Icon className="plan-icon" />
                  <h3>{plan.name}</h3>
                  <div className="plan-price">
                    <strong>{plan.price}</strong>
                    {plan.period ? <span>{plan.period}</span> : null}
                  </div>
                  <p className="plan-amount">
                    {plan.unlimitedDays ? `Unlimited analyses for ${plan.unlimitedDays} days` : `${plan.credits} contract analyses`}
                  </p>
                  <ul className="plan-features">
                    <li><CheckCircleRoundedIcon style={{ fontSize: 15 }} /> All contract types</li>
                    <li><CheckCircleRoundedIcon style={{ fontSize: 15 }} /> Export & print reports</li>
                    <li><CheckCircleRoundedIcon style={{ fontSize: 15 }} /> {plan.tagline}</li>
                  </ul>
                  <button type="button" className="plan-cta" onClick={() => choosePlan(plan)} disabled={checkoutBusy}>
                    {checkoutBusy ? 'Starting…' : `Choose ${plan.name}`}
                  </button>
                </div>
              ))}
            </div>
            <p className="modal-foot">
              <LockOutlinedIcon style={{ fontSize: 13, verticalAlign: '-2px' }} /> Card entered securely on this page, powered by Stripe. {user ? `Signed in as ${user.email}.` : 'You’ll be asked to sign in first.'}
            </p>
          </div>
        </div>
      ) : null}

      {authOpen ? (
        <div className="modal-overlay" onClick={() => { setAuthOpen(false); resetAuthView(); }}>
          <form className="modal auth-modal" role="dialog" aria-modal="true" aria-label="Account" onClick={(e) => e.stopPropagation()} onSubmit={submitAuth}>
            <button type="button" className="modal-close icon-button" onClick={() => { setAuthOpen(false); resetAuthView(); }} aria-label="Close">
              <CloseRoundedIcon fontSize="small" />
            </button>

            {pendingEmail ? (
              <>
                <div className="modal-head">
                  <span className="modal-kicker"><AccountCircleOutlinedIcon style={{ fontSize: 16 }} /> Check your email</span>
                  <h2>Verify your email to continue</h2>
                  <p>We sent a verification link to <strong>{pendingEmail}</strong>. Click it within 30 minutes to activate your account, then log in.</p>
                </div>
                <button type="button" className="analyze-button" onClick={resendVerification}>Resend verification email</button>
                {resendMsg ? <p className="auth-switch" style={{ marginTop: 10 }}>{resendMsg}</p> : null}
                <p className="auth-switch">
                  Entered the wrong email?{' '}
                  <button type="button" onClick={() => { resetAuthView(); setAuthMode('signup'); }}>Start over</button>
                </p>
                <p className="modal-foot"><LockOutlinedIcon style={{ fontSize: 13, verticalAlign: '-2px' }} /> Didn’t get it? Check spam, or resend. Links expire after 30 minutes.</p>
              </>
            ) : (
              <>
                <div className="modal-head">
                  <span className="modal-kicker"><AccountCircleOutlinedIcon style={{ fontSize: 16 }} /> {authMode === 'signup' ? 'Create your account' : 'Welcome back'}</span>
                  <h2>{authMode === 'signup' ? 'Sign up to continue' : 'Sign in'}</h2>
                  {pendingPlan ? <p>Sign in to complete your {pendingPlan.name} plan.</p> : <p>Save your reports and manage your subscription.</p>}
                </div>
                {googleClientId ? (
                  <>
                    <div className="gsi-wrap">
                      <GoogleSignInButton clientId={googleClientId} onCredential={handleGoogleCredential} />
                    </div>
                    <div className="auth-divider"><span>or</span></div>
                  </>
                ) : null}
                {authMode === 'signup' ? (
                  <label className="field">
                    <span>Name</span>
                    <input type="text" value={authForm.name} onChange={(e) => setAuthForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jane Doe" />
                  </label>
                ) : null}
                <label className="field">
                  <span>Email</span>
                  <input type="email" required value={authForm.email} onChange={(e) => setAuthForm((f) => ({ ...f, email: e.target.value }))} placeholder="you@email.com" />
                </label>
                <label className="field">
                  <span>Password</span>
                  <input type="password" required minLength={8} value={authForm.password} onChange={(e) => setAuthForm((f) => ({ ...f, password: e.target.value }))} placeholder="At least 8 characters" />
                </label>
                {authMode === 'login' ? (
                  <p className="auth-forgot">
                    <button type="button" onClick={() => { setAuthOpen(false); resetAuthView(); navigate('/forgot-password'); }}>
                      Forgot password?
                    </button>
                  </p>
                ) : null}
                {authError ? <div className="feedback error"><span>{authError}</span></div> : null}
                <button type="submit" className="analyze-button" disabled={authBusy}>
                  {authBusy ? 'Please wait…' : authMode === 'signup' ? 'Create account' : 'Sign in'}
                </button>
                <p className="auth-switch">
                  {authMode === 'signup' ? 'Already have an account?' : 'New here?'}{' '}
                  <button type="button" onClick={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setAuthError(''); }}>
                    {authMode === 'signup' ? 'Sign in' : 'Create one'}
                  </button>
                </p>
                <p className="modal-foot"><LockOutlinedIcon style={{ fontSize: 13, verticalAlign: '-2px' }} /> Passwords are hashed (bcrypt) and stored server-side. This is a demo — don’t reuse a real password.</p>
              </>
            )}
          </form>
        </div>
      ) : null}

      {payClientSecret && stripePromise ? (
        <div className="modal-overlay" onClick={closePayment}>
          <div className="modal pay-modal" role="dialog" aria-modal="true" aria-label="Payment" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close icon-button" onClick={closePayment} aria-label="Close">
              <CloseRoundedIcon fontSize="small" />
            </button>
            <div className="modal-head">
              <span className="modal-kicker"><LockOutlinedIcon style={{ fontSize: 16 }} /> Secure payment</span>
              <h2>{payPlan?.name} — {payPlan?.price}</h2>
              <p>
                {payPlan?.unlimitedDays
                  ? `Unlimited analyses for ${payPlan.unlimitedDays} days.`
                  : `${payPlan?.credits} contract analyses added to your account.`}
              </p>
            </div>
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: payClientSecret,
                appearance: {
                  theme: 'stripe',
                  variables: {
                    colorPrimary: '#0d9488',
                    colorBackground: '#ffffff',
                    colorText: '#0f1a18',
                    borderRadius: '10px',
                    fontFamily: 'Inter, system-ui, sans-serif',
                  },
                },
              }}
            >
              <PaymentForm plan={payPlan} priceLabel={payPlan?.price} onPaid={handlePaid} onCancel={closePayment} />
            </Elements>
          </div>
        </div>
      ) : null}

      {paySuccess ? (
        <div className="modal-overlay" onClick={() => setPaySuccess(null)}>
          <div className="modal success-modal" role="dialog" aria-modal="true" aria-label="Payment successful" onClick={(e) => e.stopPropagation()}>
            <div className="success-check">
              <CheckCircleRoundedIcon style={{ fontSize: 60 }} />
            </div>
            <h2>Payment successful</h2>
            <p className="success-line">
              {paySuccess?.unlimitedDays
                ? `Unlimited analyses unlocked for ${paySuccess.unlimitedDays} days.`
                : paySuccess?.credits
                ? `${paySuccess.credits} contract analyses added to your account.`
                : 'Your plan is now active.'}
            </p>
            <div className="success-balance">
              {unlimitedActive ? <WorkspacePremiumOutlinedIcon style={{ fontSize: 18 }} /> : <BoltOutlinedIcon style={{ fontSize: 18 }} />}
              <span>You now have {usageLabel}</span>
            </div>
            <button type="button" className="analyze-button" onClick={() => setPaySuccess(null)}>
              Start analyzing
            </button>
            <p className="modal-foot">A receipt has been sent to {user?.email}.</p>
          </div>
        </div>
      ) : null}

      <footer className="site-footer">
        <span>© {new Date().getFullYear()} Contract Scanner</span>
        <nav className="site-footer-links">
          <a href="/privacy" onClick={(e) => { e.preventDefault(); navigate('/privacy'); }}>Privacy Policy</a>
          <a href="/terms" onClick={(e) => { e.preventDefault(); navigate('/terms'); }}>Terms of Service</a>
        </nav>
      </footer>

      <style>{`
        /* ============================================================
           Design tokens
           ============================================================ */
        :root {
          /* Accent — a confident teal. Soft/strong are darkened for AA text on light. */
          --accent: #0d9488;
          --accent-strong: #0f766e;
          --accent-soft: #0f766e;   /* used as text on light surfaces — kept dark enough to read */
          --accent-tint: rgba(13, 148, 136, 0.10);
          --accent-line: rgba(13, 148, 136, 0.28);
          --grad-brand: linear-gradient(135deg, #14b8a6, #0d9488);

          /* Surfaces — off-white base, white cards, subtle cool-gray steps */
          --bg: #f6faf9;
          --surface-1: #ffffff;
          --surface-2: #f1f6f5;
          --surface-3: #e6efec;

          /* Hairlines & borders — dark ink at low alpha for light surfaces */
          --line: rgba(15, 26, 24, 0.10);
          --line-strong: rgba(15, 26, 24, 0.16);

          /* Text — 3-step ladder, each tuned for AA contrast on the light surfaces */
          --text: #0f1a18;    /* primary — near-black ink, crisp headings/body */
          --text-2: #425551;  /* secondary — comfortable for long copy */
          --text-3: #6b7d78;  /* muted — captions/meta, still legible on surfaces */

          /* Severity — darkened so text/icons read on light tint backgrounds */
          --red: #dc2626;
          --red-bg: rgba(220, 38, 38, 0.10);
          --red-line: rgba(220, 38, 38, 0.28);
          --amber: #d97706;
          --amber-bg: rgba(217, 119, 6, 0.12);
          --amber-line: rgba(217, 119, 6, 0.30);
          --green: #059669;
          --green-bg: rgba(5, 150, 105, 0.10);
          --green-line: rgba(5, 150, 105, 0.28);

          /* Radii */
          --r-sm: 10px;
          --r-md: 14px;
          --r-lg: 20px;
          --r-xl: 26px;

          /* Elevation — soft ink shadows for a light UI */
          --shadow-sm: 0 1px 2px rgba(15, 26, 24, 0.06);
          --shadow-md: 0 8px 24px rgba(15, 26, 24, 0.08);
          --shadow-lg: 0 24px 60px rgba(15, 26, 24, 0.12);

          --ring: 0 0 0 3px rgba(13, 148, 136, 0.30);

          /* Fluid spacing — scales smoothly with the viewport, no jumps */
          --space-shell-x: clamp(16px, 4vw, 48px);
          --space-shell-top: clamp(20px, 4vw, 44px);
          --space-panel: clamp(20px, 3.5vw, 32px);
          --gap-grid: clamp(12px, 1.6vw, 20px);
          --gap-section: clamp(16px, 2.4vw, 28px);

          /* Fluid type scale */
          --fs-h1: clamp(1.75rem, 1.1rem + 3.4vw, 3rem);
          --fs-h2: clamp(1.2rem, 1rem + 1vw, 1.4rem);
          --fs-body: clamp(0.95rem, 0.9rem + 0.25vw, 1.02rem);
        }

        * { box-sizing: border-box; }

        html { -webkit-text-size-adjust: 100%; }

        body {
          margin: 0;
          font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background:
            radial-gradient(1100px 600px at 12% -10%, rgba(13, 148, 136, 0.07), transparent 60%),
            var(--bg);
          color: var(--text);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
          font-optical-sizing: auto;
          font-feature-settings: 'cv02', 'cv03', 'cv04', 'ss01';
          line-height: 1.55;
          letter-spacing: -0.006em;   /* subtle tightening — Inter reads cleaner */
          font-size: var(--fs-body);
          overflow-x: hidden;
          min-height: 100dvh;
        }

        .app-shell {
          position: relative;
          width: 100%;
          max-width: clamp(320px, 96vw, 1240px);
          margin-inline: auto;
          /* Honor notches / rounded corners on mobile */
          padding:
            var(--space-shell-top)
            calc(var(--space-shell-x) + env(safe-area-inset-right, 0px))
            clamp(48px, 8vw, 88px)
            calc(var(--space-shell-x) + env(safe-area-inset-left, 0px));
          /* Component-level responsiveness: children can query THIS width */
          container: app-shell / inline-size;
        }

        /* Ambient — one quiet wash, no competing blobs */
        .ambient { display: none; }

        /* ============================================================
           Typography primitives
           ============================================================ */
        h1, h2, h3 { margin: 0; color: var(--text); }

        .eyebrow,
        .section-kicker {
          margin: 0 0 12px;
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--accent-soft);
        }

        /* ============================================================
           Cards / panels — flat, hairline-bordered, subtly elevated
           ============================================================ */
        .hero,
        .panel {
          position: relative;
          z-index: 1;
          background: var(--surface-1);
          border: 1px solid var(--line);
          box-shadow: var(--shadow-md);
        }

        .hero {
          display: grid;
          grid-template-columns: 1.25fr 0.75fr;
          gap: var(--gap-section);
          padding: var(--space-panel);
          border-radius: var(--r-xl);
          margin-bottom: var(--gap-grid);
        }

        .hero-copy h1 {
          margin: 0 0 16px;
          font-size: var(--fs-h1);
          line-height: 1.06;
          letter-spacing: -0.032em;   /* tighter tracking for large display type */
          font-weight: 800;
          text-wrap: balance;
        }

        .subtitle {
          margin: 0;
          font-size: clamp(1rem, 0.96rem + 0.2vw, 1.1rem);
          line-height: 1.6;
          color: var(--text-2);
          max-width: 560px;
        }

        .pill-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 24px;
        }

        .feature-pill {
          padding: 7px 13px;
          border-radius: 999px;
          background: var(--surface-2);
          border: 1px solid var(--line);
          color: var(--text-2);
          font-size: 0.82rem;
          font-weight: 500;
        }

        /* Hero side card */
        .hero-card {
          border-radius: var(--r-lg);
          background: var(--surface-2);
          border: 1px solid var(--line);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .hero-card-header {
          display: flex;
          gap: 7px;
          padding: 16px 18px;
          border-bottom: 1px solid var(--line);
        }

        .dot { width: 9px; height: 9px; border-radius: 999px; display: inline-block; }
        .dot-blue { background: #cbd5d1; }
        .dot-purple { background: #cbd5d1; }
        .dot-cyan { background: var(--accent); }

        .hero-card-body { padding: 22px; display: grid; gap: 18px; }

        .metric-label {
          margin: 0 0 6px;
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: var(--text-3);
        }

        .metric-value {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--text);
          line-height: 1.4;
        }

        .hero-card-grid { display: grid; gap: 8px; }

        .mini-stat {
          padding: 13px 15px;
          border-radius: var(--r-sm);
          background: var(--surface-3);
          border: 1px solid var(--line);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .mini-stat strong { font-weight: 600; font-size: 0.92rem; }
        .mini-stat span { color: var(--text-3); font-size: 0.85rem; }

        /* ============================================================
           Panels
           ============================================================ */
        .panel {
          margin-top: var(--gap-grid);
          padding: var(--space-panel);
          border-radius: var(--r-xl);
          /* Each panel becomes a query container for its inner grid */
          container-type: inline-size;
        }

        .panel-heading,
        .summary-top,
        .section-title-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          flex-wrap: wrap;
        }

        .panel-heading h2,
        .summary-card h2,
        .dashboard-panel h2,
        .protections-panel h2 {
          margin: 0;
          font-size: var(--fs-h2);
          letter-spacing: -0.02em;
          font-weight: 600;
          line-height: 1.25;
          max-width: 30ch;
          text-wrap: balance;
        }

        .disclaimer {
          max-width: 360px;
          padding: 14px 16px;
          border-radius: var(--r-md);
          background: var(--surface-2);
          border: 1px solid var(--line);
          color: var(--text-2);
          font-size: 0.86rem;
          line-height: 1.6;
        }
        .disclaimer strong { color: var(--text); font-weight: 600; }
        .disclaimer a { color: var(--accent-soft); font-weight: 600; text-decoration: none; }
        .disclaimer a:hover { text-decoration: underline; }

        .site-footer {
          display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
          margin-top: var(--gap-section); padding: 20px 0 8px;
          border-top: 1px solid var(--line);
          color: var(--text-3); font-size: 0.82rem;
        }
        .site-footer-links { display: inline-flex; gap: 18px; }
        .site-footer-links a { color: var(--text-3); text-decoration: none; font-weight: 600; }
        .site-footer-links a:hover { color: var(--accent-soft); }

        .input-grid {
          display: grid;
          grid-template-columns: 1.2fr 0.8fr;
          gap: var(--gap-section);
          margin-top: var(--gap-section);
        }

        .textarea-shell {
          padding: 18px;
          border-radius: var(--r-lg);
          background: var(--surface-2);
          border: 1px solid var(--line);
        }

        .label {
          display: block;
          margin-bottom: 12px;
          font-weight: 600;
          font-size: 0.9rem;
          color: var(--text);
        }

        .textarea-shell textarea {
          width: 100%;
          min-height: 320px;
          border-radius: var(--r-md);
          border: 1px solid var(--line);
          padding: 16px;
          font-family: inherit;
          font-size: 0.95rem;
          line-height: 1.7;
          resize: vertical;
          color: var(--text);
          background: var(--bg);
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .textarea-shell textarea::placeholder { color: var(--text-3); }
        .textarea-shell textarea:focus {
          outline: none;
          border-color: var(--accent-line);
          box-shadow: var(--ring);
        }

        .side-stack { display: grid; gap: 14px; align-content: start; }

        /* Upload */
        .upload-block {
          padding: 20px;
          display: grid;
          gap: 14px;
          border-radius: var(--r-lg);
          border: 1px dashed var(--line-strong);
          background: var(--surface-2);
          transition: border-color 0.18s ease, background 0.18s ease;
        }
        .upload-block-ready { border-style: solid; border-color: var(--accent-line); background: var(--accent-tint); }
        .drag-active { border-color: var(--accent); background: var(--accent-tint); }

        .upload-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }

        .upload-label { margin: 0; font-weight: 600; font-size: 0.92rem; color: var(--text); }
        .upload-hint { margin: 5px 0 0; color: var(--text-3); font-size: 0.84rem; line-height: 1.55; max-width: 34ch; }

        .upload-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 15px;
          border-radius: var(--r-sm);
          border: 1px solid var(--line-strong);
          background: var(--surface-3);
          color: var(--text);
          font-weight: 600;
          font-size: 0.86rem;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .upload-button:hover { background: var(--accent-tint); border-color: var(--accent-line); }
        .upload-button-icon { font-size: 0.92rem; opacity: 0.8; }

        .file-details {
          display: grid;
          gap: 6px;
          padding: 14px 16px;
          border-radius: var(--r-md);
          background: var(--bg);
          border: 1px solid var(--line);
        }

        .file-line { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
        .file-name, .file-placeholder { margin: 0; font-size: 0.9rem; font-weight: 600; }
        .file-name { color: var(--text); }
        .file-placeholder { color: var(--text-3); }
        .file-badges { display: flex; flex-wrap: wrap; gap: 6px; }

        .file-badge {
          padding: 3px 9px;
          border-radius: 999px;
          background: var(--surface-3);
          border: 1px solid var(--line);
          color: var(--text-2);
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.01em;
        }
        .file-meta { margin: 0; color: var(--text-3); font-size: 0.82rem; line-height: 1.55; }

        /* ============================================================
           Buttons
           ============================================================ */
        .action-row { display: flex; flex-wrap: wrap; gap: 10px; }

        button { font-family: inherit; }
        button:focus-visible,
        .upload-button:focus-visible,
        a:focus-visible { outline: none; box-shadow: var(--ring); }

        .analyze-button {
          flex: 1;
          min-width: 160px;
          padding: 13px 20px;
          border: none;
          border-radius: var(--r-md);
          background: var(--accent);
          color: #ffffff;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease, transform 0.12s ease;
        }
        .analyze-button:hover:not(:disabled) { background: var(--accent-strong); transform: translateY(-1px); }
        .analyze-button:active:not(:disabled) { transform: translateY(0); }
        .analyze-button:disabled { opacity: 0.6; cursor: not-allowed; }

        .secondary-button,
        .ghost-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 13px 18px;
          border-radius: var(--r-md);
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }
        .secondary-button { background: var(--surface-3); color: var(--text); border: 1px solid var(--line-strong); }
        .secondary-button:hover:not(:disabled) { background: var(--accent-tint); }
        .ghost-button { background: transparent; color: var(--text-3); border: 1px solid transparent; padding: 8px 0; text-align: left; }
        .ghost-button:hover:not(:disabled) { color: var(--text); }
        button:disabled { cursor: not-allowed; opacity: 0.55; }

        .button-content { display: inline-flex; align-items: center; justify-content: center; gap: 9px; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .feedback {
          padding: 12px 14px;
          border-radius: var(--r-md);
          font-size: 0.88rem;
          line-height: 1.5;
        }
        .feedback.error { background: var(--red-bg); border: 1px solid var(--red-line); color: #b91c1c; }

        /* Tips */
        .tips-card {
          padding: 18px;
          border-radius: var(--r-lg);
          background: var(--surface-2);
          border: 1px solid var(--line);
        }
        .tips-card h3 { margin: 0 0 12px; font-size: 0.92rem; font-weight: 600; }
        .tips-card ul { margin: 0; padding-left: 18px; color: var(--text-2); line-height: 1.85; font-size: 0.88rem; }

        /* ============================================================
           Loading overlay
           ============================================================ */
        .loading-overlay {
          position: fixed; inset: 0; z-index: 20;
          display: flex; align-items: center; justify-content: center;
          background: rgba(15, 26, 24, 0.55);
          backdrop-filter: blur(6px);
        }
        .loading-frame {
          display: flex; align-items: center; gap: 16px;
          padding: 22px 26px;
          border-radius: var(--r-lg);
          background: var(--surface-1);
          border: 1px solid var(--line-strong);
          box-shadow: var(--shadow-lg);
        }
        /* Common loader — spinning magnifier outline */
        .app-loader { display: inline-flex; flex-shrink: 0; line-height: 0; }
        .app-loader svg { display: block; }
        .app-loader-arc {
          transform-box: fill-box; transform-origin: center;
          animation: spin 1s linear infinite;
        }
        .acct-loading { display: inline-flex; align-items: center; gap: 8px; }
        .loading-title { margin: 0; font-size: 1rem; font-weight: 600; }
        .loading-subtitle { margin: 5px 0 0; color: var(--text-2); font-size: 0.88rem; line-height: 1.55; max-width: 34ch; }

        /* ============================================================
           Results
           ============================================================ */
        .result-panel { display: grid; gap: 20px; }

        .summary-card {
          padding: 28px;
          border-radius: var(--r-xl);
          background:
            linear-gradient(180deg, var(--accent-tint), transparent 70%),
            var(--surface-1);
          border: 1px solid var(--accent-line);
          box-shadow: var(--shadow-md);
        }

        .stats-row { display: flex; gap: 10px; flex-wrap: wrap; }
        .stat-chip {
          min-width: 92px;
          padding: 12px 14px;
          border-radius: var(--r-md);
          background: var(--surface-2);
          border: 1px solid var(--line);
          display: flex; flex-direction: column; gap: 3px;
        }
        .stat-chip strong { font-size: 1.4rem; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
        .stat-chip span { font-size: 0.76rem; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.06em; }

        .fix-list-box {
          margin-top: 22px;
          padding: 18px 20px;
          border-radius: var(--r-lg);
          background: var(--surface-2);
          border: 1px solid var(--line);
        }
        .fix-list-box h3 { margin: 0 0 12px; font-size: 0.92rem; font-weight: 600; }
        .fix-list-box ol { margin: 0; padding-left: 20px; color: var(--text-2); line-height: 1.8; font-size: 0.9rem; }
        .fix-list-box li { padding-left: 4px; }

        .dashboard-panel,
        .protections-panel {
          padding: 28px;
          border-radius: var(--r-xl);
          background: var(--surface-1);
          border: 1px solid var(--line);
          box-shadow: var(--shadow-md);
        }

        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; margin-top: 24px; }

        /* Clause cards — neutral surface, severity shown via a left rail */
        .clause-card {
          position: relative;
          padding: 20px;
          padding-left: 22px;
          border-radius: var(--r-lg);
          background: var(--surface-2);
          border: 1px solid var(--line);
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow: hidden;
        }
        .clause-card::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 4px;
        }
        .clause-card.green::before { background: var(--green); }
        .clause-card.yellow::before { background: var(--amber); }
        .clause-card.red::before { background: var(--red); }

        .card-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .clause-card h3 { margin: 0; font-size: 0.95rem; font-weight: 600; }

        .clause-text { margin: 0; color: var(--text-2); font-size: 0.9rem; line-height: 1.65; }
        .clause-summary { margin: 0; font-weight: 500; color: var(--text); font-size: 0.92rem; line-height: 1.55; }

        .negotiation-block {
          padding: 13px 15px;
          background: var(--bg);
          border-radius: var(--r-md);
          border: 1px solid var(--line);
        }
        .negotiation-block strong {
          display: block; margin-bottom: 6px;
          color: var(--accent-soft);
          font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600;
        }
        .negotiation-block p { margin: 0; color: var(--text-2); font-size: 0.9rem; line-height: 1.6; }

        /* Pills */
        .pill {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 11px;
          border-radius: 999px;
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.03em;
          border: 1px solid transparent;
        }
        .pill::before { content: ''; width: 6px; height: 6px; border-radius: 999px; background: currentColor; }
        .pill.green { background: var(--green-bg); border-color: var(--green-line); color: var(--green); }
        .pill.yellow { background: var(--amber-bg); border-color: var(--amber-line); color: var(--amber); }
        .pill.red { background: var(--red-bg); border-color: var(--red-line); color: var(--red); }

        .missing-list { margin: 16px 0 0; padding-left: 20px; color: var(--text-2); line-height: 1.9; font-size: 0.9rem; }
        .all-good { display: flex; align-items: center; gap: 8px; margin: 16px 0 0; color: var(--green); font-weight: 600; font-size: 0.9rem; }

        /* History */
        .history-panel {
          padding: 24px 28px;
          border-radius: var(--r-xl);
          background: var(--surface-1);
          border: 1px solid var(--line);
        }
        .history-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-top: 16px; }
        .history-card {
          display: grid; gap: 4px;
          padding: 14px 16px;
          border-radius: var(--r-md);
          background: var(--surface-2);
          border: 1px solid var(--line);
        }
        .history-card strong { font-size: 0.92rem; font-weight: 600; }
        .history-card span { font-size: 0.8rem; color: var(--text-3); }
        .history-time { color: var(--accent-soft) !important; font-size: 0.74rem !important; text-transform: uppercase; letter-spacing: 0.06em; }
        .history-verdict { color: var(--text); line-height: 1.5; }
        /* Clamp long verdict summaries to keep cards uniform; expand via the toggle. */
        .history-verdict.clamped {
          display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
        }
        .history-toggle {
          display: inline-flex; align-items: center; gap: 2px; width: fit-content;
          color: var(--accent-soft) !important; font-size: 0.76rem !important; font-weight: 600;
          cursor: pointer; margin-top: 2px;
        }
        .history-toggle:hover { text-decoration: underline; }

        /* ============================================================
           Product UX additions
           ============================================================ */
        /* Contract-type selector */
        .type-selector {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 22px;
          padding: 6px;
          border-radius: var(--r-lg);
          background: var(--surface-2);
          border: 1px solid var(--line);
          width: fit-content;
          max-width: 100%;
        }
        .type-option {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 15px;
          border-radius: var(--r-md);
          border: 1px solid transparent;
          background: transparent;
          color: var(--text-2);
          font-size: 0.88rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
        }
        .type-option:hover:not(:disabled):not(.active) { background: var(--surface-3); color: var(--text); }
        .type-option.active {
          background: var(--accent-tint);
          border-color: var(--accent-line);
          color: var(--accent-soft);
        }
        .type-option:disabled { cursor: not-allowed; opacity: 0.6; }
        .type-icon { font-size: 1.05rem; line-height: 1; }

        /* ---- Top account bar ---- */
        .topbar {
          position: relative; z-index: 2;
          display: flex; align-items: center; justify-content: space-between;
          gap: 14px; flex-wrap: wrap;
          margin-bottom: 18px;
        }
        .brand {
          display: inline-flex; align-items: center; gap: 8px;
          font-weight: 700; font-size: 0.96rem; letter-spacing: -0.01em;
          color: var(--text);
        }
        .brand svg { color: var(--accent); }
        .brand-logo {
          width: 36px; height: 36px; border-radius: 9px; display: block;
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.38);
        }
        .account { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .usage-pill {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 12px; border-radius: 999px;
          background: var(--accent-tint); border: 1px solid var(--accent-line);
          color: var(--accent-soft); font-size: 0.8rem; font-weight: 600;
        }
        .usage-pill.empty { background: var(--amber-bg); border-color: var(--amber-line); color: var(--amber); }
        .upgrade-button {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: var(--r-sm);
          border: none; cursor: pointer;
          background: var(--accent); color: #ffffff;
          font-weight: 600; font-size: 0.82rem;
          transition: background 0.15s ease, transform 0.12s ease;
        }
        .upgrade-button:hover { background: var(--accent-strong); transform: translateY(-1px); }
        .user-chip {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 12px; border-radius: 999px;
          background: var(--surface-2); border: 1px solid var(--line);
          color: var(--text); font-size: 0.82rem; font-weight: 600; max-width: 180px;
        }
        .user-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .icon-button {
          display: inline-flex; align-items: center; justify-content: center;
          width: 34px; height: 34px; border-radius: var(--r-sm);
          background: var(--surface-2); border: 1px solid var(--line);
          color: var(--text-2); cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
        }
        .icon-button:hover { background: var(--surface-3); color: var(--text); }
        .secondary-button.compact { padding: 7px 13px; font-size: 0.82rem; }

        .access-note { margin: 10px 0 0; font-size: 0.8rem; color: var(--text-3); }

        /* ---- Modals ---- */
        .modal-overlay {
          position: fixed; inset: 0; z-index: 40;
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
          background: rgba(4, 9, 7, 0.66);
          backdrop-filter: blur(6px);
          animation: fade-in 0.15s ease;
        }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .modal {
          position: relative;
          width: 100%;
          max-height: 92dvh; overflow-y: auto;
          background: var(--surface-1);
          border: 1px solid var(--line-strong);
          border-radius: var(--r-xl);
          box-shadow: var(--shadow-lg);
          padding: clamp(22px, 4vw, 34px);
        }
        .plans-modal { max-width: 880px; }
        .auth-modal { max-width: 420px; display: grid; gap: 14px; }
        .gsi-wrap { display: flex; justify-content: center; width: 100%; }
        .gsi-holder { color-scheme: light; width: 100%; display: flex; justify-content: center; min-height: 40px; }
        .auth-divider { display: flex; align-items: center; gap: 12px; color: var(--text-3); font-size: 0.8rem; }
        .auth-divider::before, .auth-divider::after { content: ''; flex: 1; height: 1px; background: var(--line); }
        .modal-close { position: absolute; top: 16px; right: 16px; }
        .modal-head { margin-bottom: 8px; }
        .modal-kicker {
          display: inline-flex; align-items: center; gap: 6px;
          color: var(--accent-soft); font-size: 0.76rem; font-weight: 700;
          letter-spacing: 0.08em; text-transform: uppercase;
        }
        .modal-head h2 { margin: 10px 0 6px; font-size: 1.5rem; letter-spacing: -0.02em; }
        .modal-head p { margin: 0; color: var(--text-2); font-size: 0.92rem; line-height: 1.55; max-width: 52ch; }

        .plans-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;
          margin-top: 24px;
        }
        .plan-card {
          position: relative;
          display: flex; flex-direction: column; align-items: flex-start;
          padding: 22px 20px;
          border-radius: var(--r-lg);
          background: var(--surface-2);
          border: 1px solid var(--line);
        }
        .plan-card.popular { border-color: var(--accent-line); background: linear-gradient(180deg, var(--accent-tint), transparent 60%), var(--surface-2); }
        .plan-flag {
          position: absolute; top: -10px; left: 20px;
          padding: 3px 10px; border-radius: 999px;
          background: var(--accent); color: #ffffff;
          font-size: 0.68rem; font-weight: 700; letter-spacing: 0.03em;
        }
        .plan-icon { color: var(--accent-soft); margin-bottom: 10px; }
        .plan-card h3 { font-size: 1.05rem; margin: 0 0 8px; }
        .plan-price { display: flex; align-items: baseline; gap: 4px; }
        .plan-price strong { font-size: 1.9rem; font-weight: 800; letter-spacing: -0.03em; }
        .plan-price span { color: var(--text-3); font-size: 0.85rem; }
        .plan-amount { margin: 12px 0 12px; font-weight: 600; font-size: 0.9rem; color: var(--text); }
        .plan-features { list-style: none; margin: 0 0 18px; padding: 0; display: grid; gap: 7px; }
        .plan-features li { display: flex; align-items: center; gap: 7px; font-size: 0.83rem; color: var(--text-2); }
        .plan-features svg { color: var(--accent); flex-shrink: 0; }
        .plan-cta {
          margin-top: auto; width: 100%;
          padding: 11px 16px; border-radius: var(--r-sm);
          border: 1px solid var(--accent-line); cursor: pointer;
          background: transparent; color: var(--accent-soft);
          font-weight: 600; font-size: 0.88rem;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .plan-card.popular .plan-cta { background: var(--accent); color: #ffffff; border-color: transparent; }
        .plan-cta:hover { background: var(--accent); color: #ffffff; border-color: transparent; }

        .field { display: grid; gap: 6px; }
        .field span { font-size: 0.82rem; font-weight: 600; color: var(--text-2); }
        .field input {
          padding: 11px 13px; border-radius: var(--r-sm);
          background: var(--bg); border: 1px solid var(--line);
          color: var(--text); font-family: inherit; font-size: 0.92rem;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .field input:focus { outline: none; border-color: var(--accent-line); box-shadow: var(--ring); }
        .auth-switch { margin: 2px 0 0; font-size: 0.85rem; color: var(--text-3); text-align: center; }
        .auth-switch button { background: none; border: none; color: var(--accent-soft); font-weight: 600; cursor: pointer; font-size: 0.85rem; }
        .auth-forgot { margin: -4px 0 0; text-align: right; }
        .auth-forgot button { background: none; border: none; color: var(--accent-soft); font-weight: 600; cursor: pointer; font-size: 0.82rem; padding: 0; }
        .modal-foot { margin: 18px 0 0; font-size: 0.76rem; color: var(--text-3); }

        /* Embedded Stripe payment */
        .pay-modal { max-width: 460px; }
        .pay-form { display: grid; gap: 16px; margin-top: 18px; }
        .pay-actions { display: flex; gap: 10px; }
        .pay-actions .secondary-button { flex: 0 0 auto; }
        .pay-actions .analyze-button { flex: 1; }
        .pay-form .modal-foot { margin: 0; text-align: center; }

        /* Payment success */
        .success-modal { max-width: 420px; text-align: center; }
        .success-check {
          display: flex; justify-content: center; color: var(--accent);
          margin-bottom: 6px;
          animation: pop 0.32s cubic-bezier(0.18, 1.25, 0.4, 1) both;
        }
        @keyframes pop { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .success-modal h2 { font-size: 1.5rem; letter-spacing: -0.02em; }
        .success-line { margin: 8px 0 0; color: var(--text-2); font-size: 0.95rem; line-height: 1.5; }
        .success-balance {
          display: inline-flex; align-items: center; gap: 7px;
          margin: 16px 0 18px; padding: 8px 14px;
          border-radius: 999px; background: var(--accent-tint); border: 1px solid var(--accent-line);
          color: var(--accent-soft); font-weight: 600; font-size: 0.86rem;
        }
        .success-modal .analyze-button { width: 100%; }
        .success-modal .modal-foot { text-align: center; margin-top: 14px; }

        /* ---- Account page ---- */
        .account-panel { display: grid; gap: var(--gap-grid); }
        .acct-back { width: fit-content; padding: 6px 0; }
        .acct-hero {
          display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
          padding-bottom: 20px; border-bottom: 1px solid var(--line);
        }
        .acct-avatar {
          width: 64px; height: 64px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 1.6rem; font-weight: 700; color: #ffffff;
          background: var(--grad-brand); flex-shrink: 0;
        }
        .acct-id { flex: 1; min-width: 200px; }
        .acct-id h2 { font-size: 1.4rem; letter-spacing: -0.02em; }
        .acct-id p { margin: 2px 0 0; color: var(--text-2); font-size: 0.92rem; }
        .acct-since { color: var(--text-3) !important; font-size: 0.84rem !important; }

        .acct-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--gap-grid); }
        .acct-card {
          padding: 22px; border-radius: var(--r-lg);
          background: var(--surface-2); border: 1px solid var(--line);
          display: grid; gap: 12px; align-content: start;
        }
        .acct-card h3 {
          display: flex; align-items: center; gap: 8px; margin: 0;
          font-size: 0.82rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-2);
        }
        .acct-card h3 svg { color: var(--accent-soft); }
        .acct-big { margin: 0; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; }
        .acct-sub { margin: 0; color: var(--text-3); font-size: 0.86rem; line-height: 1.5; }
        .acct-card .plan-cta { margin-top: 4px; }

        .acct-stats { display: flex; gap: 10px; flex-wrap: wrap; }
        .acct-stats > div {
          flex: 1; min-width: 80px; padding: 12px; border-radius: var(--r-md);
          background: var(--surface-3); border: 1px solid var(--line); text-align: center;
        }
        .acct-stats strong { display: block; font-size: 1.5rem; font-weight: 800; font-variant-numeric: tabular-nums; }
        .acct-stats span { font-size: 0.72rem; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; }
        .acct-bytype { display: flex; flex-wrap: wrap; gap: 7px; }
        .bytype-chip {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 5px 11px; border-radius: 999px; font-size: 0.78rem; font-weight: 600;
          background: var(--surface-3); border: 1px solid var(--line); color: var(--text-2);
        }

        .acct-list { display: grid; gap: 8px; }
        .acct-row {
          display: grid; grid-template-columns: 1.3fr 1.6fr auto auto auto; gap: 12px; align-items: center;
          padding: 12px 14px; border-radius: var(--r-md);
          background: var(--surface-3); border: 1px solid var(--line);
          color: var(--text); font-family: inherit; font-size: 0.86rem; text-align: left; cursor: pointer;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .acct-row:hover:not(.static) { border-color: var(--accent-line); }
        .acct-row.static { cursor: default; }
        .acct-row-main { font-weight: 600; display: flex; align-items: center; gap: 6px; }
        .acct-row-mid { color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .acct-row-meta { color: var(--text-3); font-size: 0.8rem; white-space: nowrap; }
        .acct-row-meta .redflag { color: var(--red); font-weight: 600; }
        .acct-row-date { color: var(--text-3); font-size: 0.8rem; white-space: nowrap; }
        .acct-row svg { color: var(--text-3); }

        .acct-pager {
          display: flex; align-items: center; justify-content: center; gap: 14px;
          margin-top: 12px;
        }
        .pager-btn {
          padding: 7px 14px; border-radius: var(--r-md);
          background: var(--surface-3); border: 1px solid var(--line);
          color: var(--text); font-family: inherit; font-size: 0.82rem; font-weight: 600;
          cursor: pointer; transition: border-color 0.15s ease, opacity 0.15s ease;
        }
        .pager-btn:hover:not(:disabled) { border-color: var(--accent-line); }
        .pager-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .pager-info {
          display: inline-flex; align-items: center; gap: 7px;
          color: var(--text-3); font-size: 0.82rem; min-width: 96px; justify-content: center;
        }
        /* Dim + freeze the grid while the next page is loading in. */
        .history-grid.loading { opacity: 0.45; pointer-events: none; transition: opacity 0.15s ease; }

        .pay-status {
          font-size: 0.72rem; font-weight: 700; text-transform: capitalize;
          padding: 3px 9px; border-radius: 999px; justify-self: start;
        }
        .pay-status.succeeded { background: var(--green-bg); color: var(--green); border: 1px solid var(--green-line); }
        .pay-status.pending { background: var(--amber-bg); color: var(--amber); border: 1px solid var(--amber-line); }
        .pay-status.failed, .pay-status.refunded { background: var(--red-bg); color: var(--red); border: 1px solid var(--red-line); }

        .acct-form-foot { display: flex; align-items: center; gap: 12px; margin-top: 4px; }
        .acct-msg { font-size: 0.82rem; color: var(--accent-soft); }

        .acct-card.danger { border-color: rgba(248, 113, 113, 0.28); }
        .acct-danger-row {
          display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
          padding: 12px 0; border-top: 1px solid var(--line);
        }
        .acct-danger-row:first-of-type { border-top: none; }
        .acct-danger-row strong { font-size: 0.92rem; }
        .acct-confirm { display: inline-flex; gap: 8px; }
        .danger-button {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 9px 15px; border-radius: var(--r-sm); cursor: pointer;
          background: var(--red-bg); border: 1px solid var(--red-line); color: var(--red); font-weight: 600; font-size: 0.86rem;
        }
        .danger-button:hover { background: rgba(248, 113, 113, 0.18); }

        @media (max-width: 680px) {
          .plans-grid { grid-template-columns: 1fr; }
          .acct-grid { grid-template-columns: 1fr; }
          .acct-row { grid-template-columns: 1fr auto; }
          .acct-row-mid, .acct-row-meta { display: none; }
        }

        .textarea-foot {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; flex-wrap: wrap;
          margin-top: 10px;
          font-size: 0.76rem; color: var(--text-3);
        }
        .count.over { color: var(--amber); }
        .kbd-hint { display: inline-flex; align-items: center; gap: 4px; }
        kbd {
          font-family: inherit; font-size: 0.72rem;
          padding: 2px 6px; border-radius: 6px;
          background: var(--surface-3); border: 1px solid var(--line);
          color: var(--text-2);
        }

        .feedback.error {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }
        .retry-button {
          flex-shrink: 0;
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 14px; border-radius: var(--r-sm);
          background: transparent; border: 1px solid var(--red-line);
          color: var(--red); font-weight: 600; font-size: 0.82rem; cursor: pointer;
        }
        .retry-button:hover:not(:disabled) { background: var(--red-bg); }

        .notice {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 13px 16px; border-radius: var(--r-md);
          background: var(--amber-bg); border: 1px solid var(--amber-line);
          color: #92400e; font-size: 0.88rem; line-height: 1.55;
        }
        .notice svg { color: var(--amber); flex-shrink: 0; margin-top: 1px; }

        .verdict-row { margin-bottom: 10px; }
        .risk-badge {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 5px 13px; border-radius: 999px;
          font-size: 0.78rem; font-weight: 600; letter-spacing: 0.02em;
          border: 1px solid transparent;
        }
        .risk-badge::before { content: ''; width: 7px; height: 7px; border-radius: 999px; background: currentColor; }
        .risk-badge.red { background: var(--red-bg); border-color: var(--red-line); color: var(--red); }
        .risk-badge.yellow { background: var(--amber-bg); border-color: var(--amber-line); color: var(--amber); }
        .risk-badge.green { background: var(--green-bg); border-color: var(--green-line); color: var(--green); }

        /* Verdict card tone — colored top accent matching overall risk */
        .summary-card.tone-red { border-color: var(--red-line); background: linear-gradient(180deg, var(--red-bg), transparent 70%), var(--surface-1); }
        .summary-card.tone-yellow { border-color: var(--amber-line); background: linear-gradient(180deg, var(--amber-bg), transparent 70%), var(--surface-1); }
        .summary-card.tone-green { border-color: var(--green-line); background: linear-gradient(180deg, var(--green-bg), transparent 70%), var(--surface-1); }

        .report-actions {
          display: flex; flex-wrap: wrap; gap: 8px;
          margin-top: 20px; padding-top: 18px;
          border-top: 1px solid var(--line);
        }
        .report-actions .secondary-button { padding: 9px 15px; font-size: 0.84rem; }

        .negotiation-head {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          margin-bottom: 6px;
        }
        .negotiation-head strong { margin-bottom: 0; }
        .copy-chip {
          flex-shrink: 0;
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 11px; border-radius: 999px;
          background: var(--surface-3); border: 1px solid var(--line);
          color: var(--text-2); font-size: 0.72rem; font-weight: 600; cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
        }
        .copy-chip:hover { color: var(--accent-soft); border-color: var(--accent-line); }

        /* History as clickable cards */
        .history-card {
          text-align: left; width: 100%; cursor: pointer;
          font-family: inherit; color: var(--text);
          transition: border-color 0.15s ease, transform 0.12s ease, background 0.15s ease;
        }
        .history-card:hover { border-color: var(--accent-line); transform: translateY(-2px); background: var(--surface-3); }
        .history-meta { font-size: 0.8rem; color: var(--text-3); }
        .history-meta .redflag { color: var(--red); font-weight: 600; }
        .history-open { font-size: 0.78rem; color: var(--accent-soft); font-weight: 600; margin-top: 2px; }

        /* ============================================================
           Responsive engine
           Components respond to THEIR OWN width via container queries,
           so the layout is correct whether it's a phone, a split-screen
           pane, a tablet, or a 6K display — not just at viewport widths.
           ============================================================ */

        /* --- Container queries: stack when the panel itself gets narrow --- */
        @container app-shell (max-width: 860px) {
          .hero { grid-template-columns: 1fr; }
          .hero-card { order: -1; }
        }
        @container (max-width: 640px) {
          .input-grid { grid-template-columns: 1fr; }
        }
        @container (max-width: 520px) {
          .panel-heading,
          .summary-top,
          .section-title-row { flex-direction: column; gap: 14px; }
          .disclaimer { max-width: none; }
          .stats-row { width: 100%; }
          .stat-chip { flex: 1; }
        }

        /* --- Fluid card grids already use auto-fit; tighten the floor on
               very small containers so cards never overflow --- */
        @container (max-width: 420px) {
          .grid { grid-template-columns: 1fr; }
          .history-grid { grid-template-columns: 1fr 1fr; }
        }

        /* --- Phone viewport: full-width actions, comfy tap targets --- */
        @media (max-width: 560px) {
          .action-row { flex-direction: column; align-items: stretch; }
          .action-row .analyze-button,
          .action-row .secondary-button { width: 100%; }
          .upload-header { flex-direction: column; align-items: stretch; }
          .upload-button { justify-content: center; }
          .feature-pill { font-size: 0.78rem; }
          .textarea-shell textarea { min-height: 220px; }
        }

        /* --- Small phones: give the header's account controls their own row so
               they don't crowd the brand, and keep the name from pushing wide. --- */
        @media (max-width: 480px) {
          .topbar { gap: 10px; }
          .account { width: 100%; justify-content: flex-start; }
          .usage-pill { flex: 0 0 auto; }
          .user-chip { max-width: 130px; }
        }

        /* --- Touch devices: enforce 44px minimum hit area (Apple HIG) --- */
        @media (hover: none) and (pointer: coarse) {
          .analyze-button,
          .secondary-button,
          .upload-button { min-height: 44px; }
          .ghost-button { min-height: 40px; }
        }

        /* --- Tiny phones (≤360px) / large accessibility zoom --- */
        @media (max-width: 360px) {
          .history-grid { grid-template-columns: 1fr; }
          .file-badges { width: 100%; }
        }

        /* --- Ultra-wide / large desktops: widen the measure gracefully --- */
        @media (min-width: 1600px) {
          .app-shell { max-width: 1360px; }
          .grid { grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); }
        }

        /* --- Landscape phones: reclaim vertical space --- */
        @media (max-height: 480px) and (orientation: landscape) {
          .app-shell { padding-top: 16px; padding-bottom: 32px; }
          .textarea-shell textarea { min-height: 160px; }
          .hero { margin-bottom: 12px; }
        }

        /* --- Respect reduced-motion: no transforms, no spin pressure --- */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.001ms !important;
            scroll-behavior: auto !important;
          }
        }

        /* --- Coarse fallback for browsers without container-query support
               (Safari <16 / older Chromium): keep viewport breakpoints --- */
        @supports not (container-type: inline-size) {
          @media (max-width: 860px) { .hero { grid-template-columns: 1fr; } }
          @media (max-width: 760px) { .input-grid { grid-template-columns: 1fr; } }
        }

      `}</style>
    </div>
  );
}
