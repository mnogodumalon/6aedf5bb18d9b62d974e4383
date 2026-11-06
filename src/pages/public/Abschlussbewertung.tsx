import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PublicShell } from '@/components/PublicShell';
import { tx } from '@/i18n';
import {
  loadPublicPagesConfig,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import {
  useStepForm,
  useJourneySubmit,
  useLiveList,
  useVisitorKey,
  fieldText,
} from '@/lib/journey';
import { Bound } from '@/components/blocks/Bound';
import { FieldErrorSummary } from '@/components/blocks/FieldErrorSummary';
import { LoadProblem } from '@/components/blocks/LoadProblem';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Button } from '@/components/ui/button';

const SLUG = 'abschlussbewertung';

export default function Abschlussbewertung() {
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
  return <Bewertung cfg={cfg} page={page} />;
}

function Bewertung({ cfg, page }: { cfg: PublicPagesConfig; page: PublicPageConfig }) {
  const [params] = useSearchParams();
  const veranstaltungId = params.get('veranstaltung');
  const port = useMemo(() => createPublicPort(cfg, page), [cfg, page]);
  const kuerzel = useVisitorKey();
  const [consentError, setConsentError] = useState<string | null>(null);

  const live = useLiveList(port, 'veranstaltungen', { intervalMs: 0 });
  const veranstaltung = live.records.find(r => r.id === veranstaltungId) ?? null;

  const f = useStepForm('abschlussbewertungen', {
    fields: ['sterne', 'kommentar', 'email', 'einwilligung'],
    required: { sterne: true, kommentar: false, email: false, einwilligung: false },
    autoComplete: true,
  });
  const submit = useJourneySubmit(
    port,
    [
      {
        key: 'bewertung',
        entity: 'abschlussbewertungen',
        form: f,
        primary: true,
        values: () => ({ veranstaltung: veranstaltungId ?? '', kuerzel }),
      },
    ],
    {
      draftKey: `bewertung-${veranstaltungId ?? 'none'}`,
      check: () => {
        const hasMail = String(f.get('email') ?? '').trim() !== '';
        if (hasMail && f.get('einwilligung') !== true) {
          f.set('email', '');
        }
        return null;
      },
    },
  );

  if (!veranstaltungId) {
    return (
      <PublicShell title={page.title}>
        <p className="text-sm text-muted-foreground">
          {tx('Dieser Link ist unvollständig. Scanne bitte den QR-Code deiner Veranstaltung.')}
        </p>
      </PublicShell>
    );
  }
  if (!live.loaded && live.error) {
    return (
      <PublicShell title={page.title}>
        <LoadProblem onRetry={live.reload} />
      </PublicShell>
    );
  }
  if (!live.loaded) {
    return <PublicShell loading />;
  }
  if (!veranstaltung) {
    return (
      <PublicShell title={page.title}>
        <p className="text-sm text-muted-foreground">
          {tx('Dieser Link passt zu keiner Veranstaltung. Scanne bitte den QR-Code noch einmal.')}
        </p>
      </PublicShell>
    );
  }

  const titel = fieldText(veranstaltung, 'titel');
  const datum = fieldText(veranstaltung, 'datum');

  if (submit.result) {
    return (
      <PublicShell title={page.title}>
        <SuccessStep
          result={submit.result}
          forms={[f]}
          title={tx('Danke für deine Bewertung!')}
          actions={{ copy: false, print: false }}
        >
          <div className="space-y-3 text-sm">
            <p>{tx`Dein Kürzel für diese Veranstaltung: ${kuerzel}`}</p>
            <Link
              className="inline-block font-medium text-primary underline"
              to={`/public/feedback-geben?veranstaltung=${veranstaltungId}`}
            >
              {tx('Zum Feedback geben')}
            </Link>
          </div>
        </SuccessStep>
      </PublicShell>
    );
  }

  const send = async () => {
    setConsentError(null);
    if (!f.validate()) return;
    await submit.run();
  };

  return (
    <PublicShell title={page.title} description={datum ? `${titel} · ${datum}` : titel}>
      <form
        className="space-y-5"
        onSubmit={e => {
          e.preventDefault();
          void send();
        }}
      >
        <Bound form={f} name="sterne" label={tx('Wie hat dir die Veranstaltung gefallen?')} />
        <Bound form={f} name="kommentar" label={tx('Kommentar (optional)')} rows={4} />

        <div className="space-y-3 rounded-xl border p-4">
          <p className="text-sm font-medium">{tx('Persönliche Auswertung (freiwillig)')}</p>
          <p className="text-xs text-muted-foreground">
            {tx('Nein, danke? Lass die E-Mail-Adresse einfach leer.')}
          </p>
          <Bound form={f} name="email" />
          <Bound form={f} name="einwilligung" />
          {String(f.get('email') ?? '').trim() !== '' && f.get('einwilligung') !== true && (
            <p className="text-xs text-muted-foreground">
              {tx('Ohne Einwilligung wird deine E-Mail-Adresse nicht gespeichert.')}
            </p>
          )}
        </div>

        <FieldErrorSummary forms={[f]} />
        {(consentError || submit.error) && (
          <p role="alert" className="text-sm text-destructive">
            {consentError ?? tx('Das Senden hat nicht geklappt. Bitte versuche es noch einmal.')}
          </p>
        )}
        {submit.offline && (
          <p className="text-sm text-muted-foreground">
            {tx('Keine Verbindung — deine Eingaben sind gesichert.')}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={submit.submitting}>
          {tx('Bewertung absenden')}
        </Button>
      </form>
    </PublicShell>
  );
}
