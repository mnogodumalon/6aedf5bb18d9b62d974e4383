import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PublicShell } from '@/components/PublicShell';
import { Button } from '@/components/ui/button';
import { Bound } from '@/components/blocks/Bound';
import { FieldErrorSummary } from '@/components/blocks/FieldErrorSummary';
import { LoadProblem } from '@/components/blocks/LoadProblem';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import {
  loadPublicPagesConfig,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import {
  useLiveList,
  useStepForm,
  useJourneySubmit,
  useVisitorKey,
  freshRef,
  fieldRef,
  fieldText,
  type JourneyPort,
  type JourneyRecord,
} from '@/lib/journey';
import { tx } from '@/i18n';

const SLUG = 'feedback-geben';

function newKennung(): string {
  const c = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : null;
  return c ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export default function FeedbackGeben() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPublicPagesConfig(SLUG).then(c => {
      setCfg(c);
      setPage(c?.pages[SLUG] ?? null);
      setLoading(false);
    });
  }, []);

  if (loading || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={!loading} />;
  }
  return <FeedbackInner cfg={cfg} page={page} />;
}

function FeedbackInner({ cfg, page }: { cfg: PublicPagesConfig; page: PublicPageConfig }) {
  const port: JourneyPort = useMemo(() => createPublicPort(cfg, page), [cfg, page]);
  const [params] = useSearchParams();
  const linkedId = params.get('veranstaltung');
  const kuerzel = useVisitorKey({ length: 5 });

  const live = useLiveList(port, 'veranstaltungen', { intervalMs: 20000, enabled: !!linkedId });
  const veranstaltung: JourneyRecord | undefined = live.records.find(r => r.id === linkedId);
  const pointerId = veranstaltung ? fieldRef(veranstaltung, 'aktive_interaktion') : null;

  const [interaktion, setInteraktion] = useState<JourneyRecord | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!pointerId || !linkedId) {
      setInteraktion(null);
      return;
    }
    port
      .get('interaktionen', pointerId)
      .then(r => {
        if (cancelled) return;
        setInteraktion(r && fieldRef(r, 'veranstaltung') === linkedId ? r : null);
      })
      .catch(() => {
        if (!cancelled) setInteraktion(null);
      });
    return () => {
      cancelled = true;
    };
  }, [port, pointerId, linkedId]);

  const shownId = interaktion?.id ?? null;
  const shownRef = useRef<string | null>(null);
  shownRef.current = shownId;

  const [round, setRound] = useState(0);
  const kennung = useMemo(() => newKennung(), [round]); // eslint-disable-line react-hooks/exhaustive-deps

  const form = useStepForm('feedbacks', {
    fields: ['feedback_text'],
    required: { feedback_text: true },
    autoComplete: true,
  });
  const submit = useJourneySubmit(
    port,
    [
      {
        key: 'feedback',
        entity: 'feedbacks',
        form,
        primary: true,
        values: () => ({ interaktion: shownRef.current ?? '', kuerzel: kuerzel, sende_kennung: kennung }),
      },
    ],
    {
      draftKey: `feedback-${linkedId ?? 'ohne'}`,
      check: async () => {
        if (!linkedId || !shownRef.current) return tx('Gerade ist keine Frage offen.');
        const current = await freshRef(port, 'veranstaltungen', linkedId, 'aktive_interaktion');
        return current === shownRef.current ? null : tx('Inzwischen ist eine andere Frage dran.');
      },
      onSuccess: () => setRound(n => n + 1),
    },
  );

  if (!linkedId) {
    return (
      <PublicShell title={tx('Feedback geben')}>
        <p className="text-sm text-muted-foreground">
          {tx('Bitte öffne den Link oder scanne den QR-Code deiner Veranstaltung.')}
        </p>
      </PublicShell>
    );
  }
  if (!live.loaded && live.error) {
    return (
      <PublicShell title={tx('Feedback geben')}>
        <LoadProblem onRetry={live.reload} />
      </PublicShell>
    );
  }
  if (!live.loaded) {
    return <PublicShell loading />;
  }
  if (!veranstaltung) {
    return (
      <PublicShell title={tx('Feedback geben')}>
        <p className="text-sm text-muted-foreground">
          {tx('Dieser Link passt zu keiner Veranstaltung. Scanne bitte den QR-Code noch einmal.')}
        </p>
      </PublicShell>
    );
  }

  const title = fieldText(veranstaltung, 'titel');
  const nextHref = `#/public/abschlussbewertung?veranstaltung=${linkedId}`;

  if (submit.result) {
    return (
      <PublicShell title={title} description={tx('Danke für dein Feedback!')}>
        <SuccessStep
          result={submit.result}
          title={tx('Feedback gesendet')}
          submit={submit}
          restartLabel={tx('Weiteres Feedback geben')}
          actions={{ copy: false, print: false }}
          next={[{ label: tx('Abschlussbewertung abgeben'), href: nextHref }]}
        >
          <p className="text-sm">
            {tx('Dein Kürzel:')} <span className="font-mono text-lg font-semibold tracking-widest">{kuerzel}</span>
          </p>
        </SuccessStep>
      </PublicShell>
    );
  }

  return (
    <PublicShell title={title}>
      {!interaktion ? (
        <p className="text-sm text-muted-foreground">
          {tx('Gerade ist keine Frage offen. Diese Seite aktualisiert sich von selbst.')}
        </p>
      ) : (
        <form
          className="space-y-5"
          onSubmit={e => {
            e.preventDefault();
            if (form.validate()) void submit.run();
          }}
        >
          <div className="space-y-1">
            <h2 className="text-lg font-semibold whitespace-pre-line">{fieldText(interaktion, 'frage')}</h2>
            {fieldText(interaktion, 'erlaeuterung') && (
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {fieldText(interaktion, 'erlaeuterung')}
              </p>
            )}
          </div>
          <Bound form={form} name="feedback_text" rows={5} label={tx('Dein Feedback')} />
          <FieldErrorSummary forms={[form]} />
          {submit.error && !submit.offline && (
            <p role="alert" className="text-sm text-destructive">{submit.error.message}</p>
          )}
          {submit.offline && (
            <p className="text-sm text-muted-foreground">
              {tx('Keine Verbindung — deine Eingaben sind gesichert.')}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={submit.submitting}>
            {tx('Absenden')}
          </Button>
        </form>
      )}
    </PublicShell>
  );
}
