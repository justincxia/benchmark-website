'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTheme } from '@/lib/theme';

const CONTACT = '[CONTACT NAME / EMAIL]';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2.5 text-[17px] font-semibold tracking-tight">{title}</h2>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

/** The privacy policy. Every statement here describes what the code actually does; facts that
 *  are policy decisions not made yet are marked [TO BE DECIDED: …]. */
export function PrivacyPage() {
  const { t } = useTheme();
  const muted = { color: t.mutedFg };
  return (
    <article className="text-[14px] leading-[1.65]" data-testid="privacy-policy">
      <h1 className="text-2xl font-semibold tracking-tight" style={{ margin: '0 0 6px' }}>
        Privacy Policy
      </h1>
      <p className="text-[13px]" style={{ ...muted, margin: 0 }}>
        Last updated: November 9, 2026
      </p>

      <Section title="Who we are">
        <p>
          Prosody Bench is run by a research team studying speech prosody: how emphasis, pauses and grouping
          carry meaning, and whether speech models produce them. Questions about this policy or your data go to{' '}
          {CONTACT}.
        </p>
      </Section>

      <Section title="What we collect">
        <p>
          <b>Arena answers (no account needed).</b> When you take a trial in the Arena, we store: a random
          participant ID created in your browser, a random session ID for your current block of trials, the
          trial number, which clip you heard, your answers (naturalness rating, and either your human-or-AI
          judgment and the question you chose, or the interpretation you chose), how long you listened, and
          the time of submission. Arena answers are never linked to an account, even if you are signed in.
        </p>
        <p>
          <b>Google sign-in (optional).</b> Signing in is only needed to record your voice. When you sign in
          with Google, we store three things Google sends us: your Google account ID (a number that identifies
          the account), your name and your email address. We do not receive or store your Google password,
          and we ask Google for nothing beyond your basic profile and email address.
        </p>
        <p>
          <b>Voice recordings (optional, signed in only).</b> If you record yourself on the Record page and
          press Save, we store the audio file on our server, along with which sentence and reading it was
          for, its file type and size, and when you saved it. Recordings you make but do not save never leave
          your browser.
        </p>
        <p>
          We do not store your IP address. The service that hosts this site may keep its own standard
          server logs, which we do not control. [TO BE DECIDED: name the hosting provider and link its
          privacy policy.]
        </p>
      </Section>

      <Section title="Cookies and local storage">
        <p>
          <b>Session cookie.</b> When you sign in, we set one cookie, <code>pb_session</code>, holding a random
          token that keeps you signed in for 30 days or until you sign out. It cannot be read by scripts on the
          page, and we store only a scrambled (hashed) form of it on our server. Signing out deletes the
          session on our side and removes the cookie. While you are signing in, a second cookie,{' '}
          <code>pb_oauth</code>, holds security values for the sign-in step for up to 10 minutes.
        </p>
        <p>
          <b>Local storage.</b> The Arena keeps its state in your browser&apos;s local storage: your random
          participant ID, which experiment you last had open, and your progress through each block of trials
          (so a reload resumes where you were). The light/dark theme is not saved anywhere. You can clear all
          of this by clearing this site&apos;s data in your browser.
        </p>
        <p>
          We use no advertising, analytics or tracking tools, and no third-party cookies. Fonts are served
          from this site itself, not loaded from Google or any other outside service.
        </p>
      </Section>

      <Section title="How we use the data">
        <p>
          We use the data only for research on speech prosody: to see how people perceive and produce
          emphasis and grouping in speech, and how speech models compare. Arena answers are kept separate from
          the survey results shown on the leaderboard and experiment pages, which come from earlier listening
          studies. [TO BE DECIDED: whether and how arena answers or recordings may appear in publications,
          e.g. only in aggregate or anonymized form.]
        </p>
      </Section>

      <Section title="Who can see it">
        <p>
          Your recordings and account details are shown only to you, on your{' '}
          <Link href="/account" style={{ color: t.fg }}>
            Account
          </Link>{' '}
          page; no other user can see or play them. The research team can access all stored data on the
          server. We do not sell or share the data with anyone else. [TO BE DECIDED: any other people or
          institutions who will have access, e.g. collaborators.]
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          [TO BE DECIDED: how long arena answers, accounts and voice recordings are kept.] Until then, they
          are kept until you delete them or ask us to.
        </p>
      </Section>

      <Section title="Deleting your data">
        <p>
          You can delete any of your voice recordings yourself from your{' '}
          <Link href="/account" style={{ color: t.fg }}>
            Account
          </Link>{' '}
          page; this removes both the audio file and its details from our server. To have your account
          (name, email and Google account ID) deleted, or to ask about anything else we hold, contact{' '}
          {CONTACT}. Because arena answers are anonymous, we can only find yours if you give us the
          participant ID stored in your browser. [TO BE DECIDED: how a participant can look up their
          participant ID to make such a request.]
        </p>
      </Section>

      <Section title="Changes">
        <p>If we change this policy, we will update it on this page and change the date at the top.</p>
      </Section>
    </article>
  );
}
