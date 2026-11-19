'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/lib/theme';
import type { Prompt } from '@/lib/prompts';

export function RecordPage({ signedIn, prompts }: { signedIn: boolean; prompts: Prompt[] }) {
  const { t } = useTheme();
  /** Only one prompt records at a time. */
  const [active, setActive] = useState<string | null>(null);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight" style={{ margin: '0 0 6px' }}>
        Record
      </h1>
      {!signedIn ? (
        <div
          data-testid="record-signed-out"
          className="mt-4 rounded-[10px] p-5 text-[13.5px]"
          style={{ background: t.card, border: `1px solid ${t.border}`, color: t.mutedFg }}
        >
          Please{' '}
          <Link href="/account" className="font-semibold" style={{ color: t.fg }}>
            sign in
          </Link>{' '}
          to record yourself reading the sentences.
        </div>
      ) : (
        <>
          <p className="mb-6 text-sm" style={{ margin: '0 0 22px', color: t.mutedFg }}>
            Record yourself reading each sentence so that it conveys what is shown below it. Play it back, then save
            it or record it again.
          </p>
          {([1, 2] as const).map((exp) => (
            <section key={exp} className="mb-8">
              <h2 className="mb-3 text-[17px] font-semibold tracking-tight">Experiment {exp}</h2>
              <div className="flex flex-col gap-2.5">
                {prompts
                  .filter((p) => p.experiment === exp)
                  .map((p) => (
                    <PromptCard
                      key={p.id}
                      prompt={p}
                      busyElsewhere={active !== null && active !== p.id}
                      onRecording={(on) => setActive(on ? p.id : null)}
                    />
                  ))}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}

type Phase = 'idle' | 'recording' | 'recorded' | 'saving' | 'saved';

function PromptCard({
  prompt,
  busyElsewhere,
  onRecording,
}: {
  prompt: Prompt;
  busyElsewhere: boolean;
  onRecording: (on: boolean) => void;
}) {
  const { t } = useTheme();
  const [phase, setPhase] = useState<Phase>('idle');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const start = async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Microphone unavailable. Allow microphone access and try again.');
      return;
    }
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      const b = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      setBlob(b);
      setUrl(URL.createObjectURL(b));
      setPhase('recorded');
      onRecording(false);
    };
    recorderRef.current = rec;
    rec.start();
    setBlob(null);
    setUrl(null);
    setPhase('recording');
    onRecording(true);
  };

  const stop = () => recorderRef.current?.stop();

  const save = async () => {
    if (!blob) return;
    setPhase('saving');
    setError(null);
    try {
      const res = await fetch(`/api/recordings?prompt=${encodeURIComponent(prompt.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'audio/webm' },
        body: blob,
      });
      if (!res.ok) throw new Error();
      setPhase('saved');
    } catch {
      setError('Couldn’t save the recording.');
      setPhase('recorded');
    }
  };

  const button = (primary: boolean) => ({
    background: primary ? t.primary : 'transparent',
    color: primary ? t.primaryFg : t.fg,
    border: primary ? '0' : `1px solid ${t.border}`,
    fontFamily: 'inherit',
  });
  const cls = 'cursor-pointer rounded-lg px-[14px] py-[7px] text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div
      data-testid={`prompt-${prompt.id}`}
      className="rounded-[10px] px-4 py-3.5 text-[13.5px]"
      style={{ background: t.card, border: `1px solid ${t.border}` }}
    >
      <div className="mb-0.5 font-semibold">{prompt.sentence}</div>
      <div className="mb-3 text-[13px]" style={{ color: t.mutedFg }}>
        {prompt.experiment === 1 ? `Answering: ${prompt.cue}` : `Interpretation ${prompt.interpretation}: ${prompt.cue}`}
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        {phase === 'recording' ? (
          <button type="button" data-testid={`rec-stop-${prompt.id}`} onClick={stop} className={cls} style={button(true)}>
            Stop
          </button>
        ) : phase === 'idle' ? (
          <button
            type="button"
            data-testid={`rec-start-${prompt.id}`}
            disabled={busyElsewhere}
            onClick={() => void start()}
            className={cls}
            style={button(true)}
          >
            Record
          </button>
        ) : (
          <>
            {url && <audio controls src={url} data-testid={`rec-audio-${prompt.id}`} className="h-9 max-w-full" />}
            <button
              type="button"
              data-testid={`rec-redo-${prompt.id}`}
              disabled={busyElsewhere || phase === 'saving'}
              onClick={() => void start()}
              className={cls}
              style={button(false)}
            >
              Re-record
            </button>
            {phase !== 'saved' && (
              <button
                type="button"
                data-testid={`rec-save-${prompt.id}`}
                disabled={phase === 'saving'}
                onClick={() => void save()}
                className={cls}
                style={button(true)}
              >
                {phase === 'saving' ? 'Saving…' : 'Save'}
              </button>
            )}
          </>
        )}
        <span data-testid={`rec-status-${prompt.id}`} className="text-[12px] font-semibold" style={{ color: phase === 'saved' ? t.success : t.mutedFg }}>
          {phase === 'recording' ? 'Recording…' : phase === 'saved' ? 'Saved' : ''}
        </span>
      </div>
      {error && (
        <div className="mt-2 text-[12.5px]" style={{ color: t.danger }}>
          {error}
        </div>
      )}
    </div>
  );
}
