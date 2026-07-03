// Self-contained legal pages (Privacy Policy + Terms of Service).
// Rendered as full-page views at /privacy and /terms. Styles are inlined here so
// the page renders correctly even when App's main style block isn't mounted.
//
// NOTE: These are thorough, protective templates tailored to this product. Before
// launch, have a licensed attorney review them for your jurisdiction and entity,
// and fill in COMPANY, CONTACT_EMAIL, GOVERNING_LAW below.

const COMPANY = 'Contract Scanner';
const CONTACT_EMAIL = 'italiyajemish1999@gmail.com';
const GOVERNING_LAW = 'the State of Delaware, United States';
const EFFECTIVE_DATE = 'July 1, 2026';

const PRIVACY = [
  {
    h: '1. Introduction',
    p: [
      `This Privacy Policy explains how ${COMPANY} ("we," "us," or "our") collects, uses, discloses, and safeguards your information when you use our website and contract-analysis service (the "Service"). By using the Service, you agree to the practices described here. If you do not agree, please do not use the Service.`,
    ],
  },
  {
    h: '2. Information We Collect',
    p: [
      'Account information: your first and last name, email address, phone number (optional), and a securely hashed password. We never store your password in plain text.',
      'Content you submit: the contract text, documents, or images you upload or paste for analysis, and the structured analysis results we generate. We store the structured results associated with your account so you can revisit them; we do not retain the original uploaded files after processing.',
      'Payment information: when you purchase credits or a plan, payments are processed by our payment provider (Stripe). We do not receive or store your full card number. We retain a record of your transactions (amount, plan, status, and a processor reference).',
      'Usage and device data: basic technical information such as IP address, browser type, and interactions with the Service, used for security, rate limiting, and to improve the product.',
      'Local storage: we use your browser’s local storage to keep you signed in and to remember drafts and recent reports on your device.',
    ],
  },
  {
    h: '3. How We Use Your Information',
    p: [
      'To provide, operate, and maintain the Service, including generating contract analyses.',
      'To create and manage your account, process payments, and deliver purchased credits or plans.',
      'To secure the Service, prevent abuse, and enforce usage limits.',
      'To communicate with you about your account, transactions, and material changes to the Service.',
      'To comply with legal obligations and enforce our Terms of Service.',
    ],
  },
  {
    h: '4. AI Processing and Third-Party Service Providers',
    p: [
      'Contract analysis is performed with the assistance of a third-party AI provider (OpenAI). The contract text you submit is transmitted to that provider solely to generate your analysis. We do not sell your content, and we do not use it to train our own models.',
      'We also rely on service providers for payment processing (Stripe), application hosting, and database storage. These providers process data on our behalf under their own terms and privacy commitments.',
      'We do not sell your personal information to third parties.',
    ],
  },
  {
    h: '5. Data Retention and Deletion',
    p: [
      'We retain your account information and saved analyses for as long as your account is active. You may delete individual data or your entire account at any time from your account settings. Deleting your account permanently removes your profile, saved reports, and payment records associated with it, subject to any records we must retain to comply with legal, tax, or accounting obligations.',
    ],
  },
  {
    h: '6. Security',
    p: [
      'We use industry-standard measures to protect your information, including encrypted transport (HTTPS), hashed passwords, and access controls. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.',
    ],
  },
  {
    h: '7. Your Privacy Rights',
    p: [
      'Depending on your location, you may have rights to access, correct, export, or delete your personal information, to object to or restrict certain processing, and to withdraw consent. Residents of the EEA/UK (GDPR) and California (CCPA/CPRA) have specific rights, including the right not to receive discriminatory treatment for exercising them.',
      `To exercise any of these rights, contact us at ${CONTACT_EMAIL}. We will respond within the timeframe required by applicable law.`,
    ],
  },
  {
    h: '8. Cookies and Local Storage',
    p: [
      'We use essential local storage and cookies to operate the Service (for example, to keep you signed in). We do not use them for third-party advertising. You can clear this data through your browser, though doing so may affect functionality.',
    ],
  },
  {
    h: '9. Children’s Privacy',
    p: [
      'The Service is not directed to individuals under 18, and we do not knowingly collect personal information from children. If you believe a child has provided us information, contact us and we will delete it.',
    ],
  },
  {
    h: '10. International Data Transfers',
    p: [
      'Your information may be processed and stored in countries other than your own, including the United States. Where required, we rely on appropriate safeguards for such transfers.',
    ],
  },
  {
    h: '11. Changes to This Policy',
    p: [
      'We may update this Privacy Policy from time to time. We will post the updated version with a new effective date and, where appropriate, notify you. Your continued use of the Service after changes take effect constitutes acceptance.',
    ],
  },
  {
    h: '12. Contact Us',
    p: [
      `If you have questions about this Privacy Policy or our data practices, contact us at ${CONTACT_EMAIL}.`,
    ],
  },
];

const TERMS = [
  {
    h: '1. Acceptance of Terms',
    p: [
      `These Terms of Service ("Terms") govern your access to and use of the ${COMPANY} website and contract-analysis service (the "Service"). By accessing or using the Service, you agree to be bound by these Terms. If you do not agree, do not use the Service.`,
    ],
  },
  {
    h: '2. Description of the Service',
    p: [
      'The Service uses automated and AI-assisted tools to review contracts and highlight potentially notable clauses, risks, and negotiation points in plain language. The Service provides general informational output only.',
    ],
  },
  {
    h: '3. Not Legal Advice',
    p: [
      'THE SERVICE DOES NOT PROVIDE LEGAL ADVICE AND IS NOT A SUBSTITUTE FOR A LICENSED ATTORNEY. We are not a law firm, and using the Service does not create an attorney-client relationship. AI-generated analysis may be incomplete, inaccurate, or out of date. You should not rely on the Service for legal, financial, or other professional decisions, and you should consult a qualified attorney before signing or acting on any contract.',
    ],
  },
  {
    h: '4. Eligibility and Accounts',
    p: [
      'You must be at least 18 years old and able to form a binding contract to use the Service. You are responsible for the accuracy of your account information, for keeping your credentials confidential, and for all activity under your account.',
    ],
  },
  {
    h: '5. Acceptable Use',
    p: [
      'You agree not to misuse the Service, including by: uploading content you do not have the right to submit; attempting to breach security or rate limits; reverse engineering or scraping the Service; using it to build a competing product; or using it for any unlawful purpose.',
    ],
  },
  {
    h: '6. Payments, Credits, and Refunds',
    p: [
      'Certain features require payment. Prices, credits, and plan terms are shown at checkout and may change prospectively. Purchases grant the credits or access described at the time of purchase. Except where required by law, payments are non-refundable and credits are non-transferable and may expire as described at purchase. Payments are processed by our third-party payment provider, and you agree to their terms.',
    ],
  },
  {
    h: '7. Your Content',
    p: [
      'You retain ownership of the content you submit. You grant us a limited, non-exclusive license to process, transmit, and store your content solely to operate and provide the Service (including sending it to our AI provider to generate your analysis). You represent that you have the rights necessary to submit your content and that doing so does not violate any law or third-party right.',
    ],
  },
  {
    h: '8. Intellectual Property',
    p: [
      'The Service, including its software, design, and branding, is owned by us and protected by intellectual-property laws. We grant you a limited, revocable, non-transferable license to use the Service for its intended purpose. You may not copy, modify, or distribute any part of the Service except as expressly permitted.',
    ],
  },
  {
    h: '9. Third-Party Services',
    p: [
      'The Service relies on third-party providers (including AI, payment, and hosting providers). We are not responsible for the acts, omissions, or availability of third-party services, and their use may be subject to their own terms.',
    ],
  },
  {
    h: '10. Disclaimers',
    p: [
      'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT ANY ANALYSIS WILL BE ACCURATE OR COMPLETE.',
    ],
  },
  {
    h: '11. Limitation of Liability',
    p: [
      'TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT WILL WE BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL, ARISING FROM OR RELATED TO YOUR USE OF (OR INABILITY TO USE) THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM WILL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID US IN THE 12 MONTHS BEFORE THE CLAIM OR (B) USD $50.',
    ],
  },
  {
    h: '12. Indemnification',
    p: [
      'You agree to indemnify and hold harmless ' + COMPANY + ', its affiliates, and its personnel from any claims, damages, liabilities, and expenses (including reasonable legal fees) arising from your content, your use of the Service, or your violation of these Terms or any law.',
    ],
  },
  {
    h: '13. Termination',
    p: [
      'We may suspend or terminate your access to the Service at any time, with or without notice, if we believe you have violated these Terms or to protect the Service. You may stop using the Service and delete your account at any time. Sections that by their nature should survive termination will survive.',
    ],
  },
  {
    h: '14. Governing Law and Disputes',
    p: [
      `These Terms are governed by the laws of ${GOVERNING_LAW}, without regard to conflict-of-laws rules. Any dispute will be resolved in the courts located there, and you consent to their jurisdiction, except where applicable law requires otherwise.`,
    ],
  },
  {
    h: '15. Changes to These Terms',
    p: [
      'We may modify these Terms from time to time. We will post the updated Terms with a new effective date. Your continued use of the Service after changes take effect constitutes acceptance of the revised Terms.',
    ],
  },
  {
    h: '16. Contact',
    p: [
      `Questions about these Terms? Contact us at ${CONTACT_EMAIL}.`,
    ],
  },
];

export default function LegalPage({ doc, onNavigate }) {
  const isPrivacy = doc === 'privacy';
  const sections = isPrivacy ? PRIVACY : TERMS;
  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Service';
  const other = isPrivacy ? { to: '/terms', label: 'Terms of Service' } : { to: '/privacy', label: 'Privacy Policy' };

  const go = (to) => (e) => {
    e.preventDefault();
    onNavigate(to);
  };

  return (
    <div className="legal-shell">
      <header className="legal-top">
        <a href="/" onClick={go('/')} className="legal-brand">
          <img src="/logo-mark.svg" width="34" height="34" alt="" />
          <span>Contract Scanner</span>
        </a>
        <a href="/" onClick={go('/')} className="legal-back">← Back to app</a>
      </header>

      <main className="legal-doc">
        <p className="legal-kicker">Legal</p>
        <h1>{title}</h1>
        <p className="legal-date">Effective date: {EFFECTIVE_DATE}</p>

        {sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            {s.p.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </section>
        ))}

        <div className="legal-cross">
          Looking for our <a href={other.to} onClick={go(other.to)}>{other.label}</a>?
        </div>
      </main>

      <footer className="legal-foot">
        <span>© {new Date().getFullYear()} {COMPANY}. All rights reserved.</span>
        <span className="legal-links">
          <a href="/privacy" onClick={go('/privacy')}>Privacy</a>
          <a href="/terms" onClick={go('/terms')}>Terms</a>
          <a href="/" onClick={go('/')}>Home</a>
        </span>
      </footer>

      <style>{`
        .legal-shell {
          min-height: 100dvh;
          background:
            radial-gradient(1100px 600px at 12% -10%, rgba(13,148,136,0.07), transparent 60%),
            #f6faf9;
          color: #0f1a18;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .legal-top {
          display: flex; align-items: center; justify-content: space-between;
          max-width: 820px; margin: 0 auto; padding: 22px clamp(16px, 4vw, 32px);
        }
        .legal-brand { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; color: #0f1a18; font-weight: 700; }
        .legal-brand img { display: block; }
        .legal-back { text-decoration: none; color: #0f766e; font-weight: 600; font-size: 0.9rem; }
        .legal-back:hover { text-decoration: underline; }

        .legal-doc {
          max-width: 820px; margin: 0 auto; padding: 8px clamp(16px, 4vw, 32px) 40px;
        }
        .legal-kicker { text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.72rem; font-weight: 700; color: #0d9488; margin: 0 0 4px; }
        .legal-doc h1 { font-size: clamp(1.7rem, 1.2rem + 2vw, 2.4rem); letter-spacing: -0.02em; margin: 0 0 6px; }
        .legal-date { color: #6b7d78; font-size: 0.9rem; margin: 0 0 18px; }
        .legal-doc h2 { font-size: 1.05rem; margin: 26px 0 8px; color: #0f5c56; }
        .legal-doc p { color: #2c3733; line-height: 1.7; margin: 0 0 10px; font-size: 0.95rem; }
        .legal-cross {
          margin-top: 30px; padding-top: 18px; border-top: 1px solid rgba(15,26,24,0.12);
          color: #6b7d78; font-size: 0.92rem;
        }
        .legal-cross a, .legal-links a { color: #0f766e; font-weight: 600; text-decoration: none; }
        .legal-cross a:hover, .legal-links a:hover { text-decoration: underline; }

        .legal-foot {
          max-width: 820px; margin: 0 auto; padding: 20px clamp(16px, 4vw, 32px) 48px;
          display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
          border-top: 1px solid rgba(15,26,24,0.12);
          color: #93a39c; font-size: 0.82rem;
        }
        .legal-links { display: inline-flex; gap: 16px; }
      `}</style>
    </div>
  );
}
