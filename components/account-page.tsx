'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/lib/theme';
import type { RecordingItem } from '@/lib/recording-view';

export function AccountPage({
  user,
  signInConfigured,
  signInFailed,
  recordings,
}: {
  user: { name: string | null; email: string | null } | null;
  signInConfigured: boolean;
  signInFailed: boolean;
  recordings: RecordingItem[];
}) {
  const { t } = useTheme();
  const router = useRouter();
  const card = { background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow };

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.refresh();
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight" style={{ margin: '0 0 18px' }}>
        Account
      </h1>

      {!user && (
        <div className="rounded-[10px] p-5 text-[13.5px]" style={card} data-testid="account-signed-out">
          {signInFailed && (
            <p className="mb-3" style={{ margin: '0 0 12px', color: t.danger }}>
              Sign-in failed. Please try again.
            </p>
          )}
          {signInConfigured ? (
            <a
              href="/api/auth/login"
              data-testid="google-sign-in"
              className="inline-flex items-center rounded-lg px-[18px] py-[10px] text-[13.5px] font-semibold no-underline"
              style={{ background: t.primary, color: t.primaryFg }}
            >
              Sign in with Google
            </a>
          ) : (
            <p data-testid="sign-in-not-configured" style={{ margin: 0, color: t.mutedFg }}>
              Sign-in isn&apos;t configured on this server.
            </p>
          )}
        </div>
      )}

      {user && (
        <>
          <div className="flex flex-wrap items-center gap-4 rounded-[10px] p-5" style={card} data-testid="account-signed-in">
            <div className="min-w-0">
              {user.name && <div className="text-[14px] font-semibold" data-testid="account-name">{user.name}</div>}
              {user.email && (
                <div className="text-[13px]" style={{ color: t.mutedFg }} data-testid="account-email">
                  {user.email}
                </div>
              )}
            </div>
            <button
              type="button"
              data-testid="sign-out"
              onClick={() => void signOut()}
              className="ml-auto cursor-pointer rounded-lg bg-transparent px-[16px] py-[8px] text-[13px] font-semibold"
              style={{ border: `1px solid ${t.border}`, color: t.fg, fontFamily: 'inherit' }}
            >
              Sign out
            </button>
          </div>

          <section className="mt-8">
            <h2 className="mb-4 text-[19px] font-semibold tracking-tight">Your recordings</h2>
            {recordings.length === 0 ? (
              <p className="text-[13.5px]" style={{ color: t.mutedFg }} data-testid="recordings-empty">
                No recordings yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5" data-testid="recordings-list">
                {recordings.map((r) => (
                  <RecordingRow key={r.id} rec={r} onDeleted={() => router.refresh()} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

function RecordingRow({ rec, onDeleted }: { rec: RecordingItem; onDeleted: () => void }) {
  const { t } = useTheme();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const remove = async () => {
    if (!window.confirm('Delete this recording? This cannot be undone.')) return;
    setBusy(true);
    const res = await fetch(`/api/recordings/${rec.id}`, { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    if (res?.ok) onDeleted();
    else setFailed(true);
  };

  return (
    <div
      data-testid={`recording-${rec.id}`}
      className="rounded-[10px] px-4 py-3 text-[13px]"
      style={{ background: t.card, border: `1px solid ${t.border}` }}
    >
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
        <span className="font-semibold">Experiment {rec.experiment}</span>
        <span style={{ color: t.mutedFg }}>{new Date(rec.createdAt).toLocaleString()}</span>
      </div>
      <div className="mb-0.5">{rec.sentence}</div>
      <div className="mb-2.5" style={{ color: t.mutedFg }}>
        {rec.label}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <audio controls preload="none" src={`/api/recordings/${rec.id}/audio`} className="h-9 max-w-full" />
        <button
          type="button"
          data-testid={`recording-delete-${rec.id}`}
          disabled={busy}
          onClick={() => void remove()}
          className="ml-auto cursor-pointer rounded-lg bg-transparent px-[14px] py-[7px] text-[12.5px] font-semibold"
          style={{ border: `1px solid ${t.dangerBorder}`, color: t.danger, fontFamily: 'inherit' }}
        >
          Delete
        </button>
      </div>
      {failed && (
        <div className="mt-2" style={{ color: t.danger }}>
          Couldn&apos;t delete this recording.
        </div>
      )}
    </div>
  );
}
