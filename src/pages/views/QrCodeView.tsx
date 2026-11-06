/**
 * src/pages/views/QrCodeView.tsx — the view „QR-Code zum Feedback“ the plan orders (dashboard.views).
 *
 * ROUTE   #/ansicht/qr-code — generated in App.tsx, OUTSIDE the dashboard chrome
 *         (no header, drawer or assistant: a beamer / kiosk / print surface). Never wire a route for it yourself.
 * LIVE    static — loads once.
 * READS   interaktionen (veranstaltung, reihenfolge, frage, erlaeuterung, aktiv) — plan: aktiv eq 'true' and aktiv eq 'true' * FILTER  interaktionen: r.v_aktiv == True and r.v_aktiv == True  ← already vSQL, already in the call below: keep `query.filter`
 *         EXACTLY. The plan's words above are NOT vSQL — never send them (a 400 leaves the view empty).
 * SHOWS   exactly the record whose interaktionen.aktiv=true — the OVERVIEW sets that field (its button, plan.dashboard.writes);
 *         never „the newest“ or „the first open one“ (PV-26: the view and the dashboard showed two different events).
 *         The filter below already carries it; nothing marked → the view says so („Nichts ausgewählt“).
 * RECORD  this view shows ONE record: it is opened as `#/ansicht/qr-code?record=<id>` (links: `viewHref('qr-code', id)` from
 *         '@/config/plan') and reads that id. Without `?record=` it says so („Bitte über die Übersicht öffnen“) —
 *         never `records[0]` of a list, never the first active one app-wide (EF-30: another event's QR).
 * ERRORS  a read that fails sets `error` (`unauthorized` when nobody is signed in: ask to sign in, never „connection lost“);
 *         a write the view makes by itself (autosave) shows „Nicht gespeichert — erneut versuchen“ on an error, never „Speichert …“ for good (the rows stay the last good state). With no rows AND an
 *         error the view says so on screen (keep the `data-live-error` block) — never the empty state.
 * JOIN    a QR or link to the public page is BUILT: <PublicPageQr entity="veranstaltungen" recordId={…} page="<one of abschlussbewertung, feedback-geben>" />
 *         (or usePublicPageLink) from '@/components/widgets/PublicPageQr' — never a record's link field, and
 *         never shown only when such a field is filled: the record existing is enough (EF-15: every new event
 *         read „Kein Feedback-Link hinterlegt“ because a link field nobody writes gated the QR).
 * PURPOSE Zeigt den QR-Code zum Feedback-Formular der aktiven Interaktion bildschirmfüllend in einem eigenen Browsertab.
 *
 * CONTRACT — what the overview (or a flow) and this view agree on. The overview
 * agent reads the same sentences; build EXACTLY this, never negotiate:
 *   - Der Klick auf „Aktiv setzen“ bei einer Interaktion setzt deren Feld „Aktiv“ und öffnet diese Ansicht in einem neuen Tab.
 *   - Zeigt genau die Interaktion, die die Übersicht auf aktiv gesetzt hat: den QR-Code zur öffentlichen Feedback-Seite, darüber die Frage.
 *   - Ist keine Interaktion aktiv, erscheint der Hinweis „Keine aktive Interaktion“ ohne QR-Code.
 *   - Die Ansicht enthält keine Menüs und keine Bedienelemente, damit Teilnehmende nur den Code sehen.
 *
 * This file is a PLACEHOLDER (KLAR_VIEW_PLACEHOLDER): replace its body with the real
 * view and drop that token. Rules: reads through useLiveRecords / useLiveRecord
 * (silent, stale on error, pauses hidden) — no own setInterval; `tx()` for every
 * visible string; big type, high contrast — this is read from across a room.
 */
import { useLiveRecords } from '@/hooks/useLiveRecords';
import { tx } from '@/i18n';
import { extractRecordId } from '@/services/livingAppsService';
import { PublicPageQr } from '@/components/widgets/PublicPageQr';

export default function QrCodeView() {
  const pinned = (new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('record') ?? '').replace(/["\\]/g, '');
  const interaktionen = useLiveRecords('interaktionen', { intervalMs: 0, query: { filter: "r.v_aktiv == True and r.v_aktiv == True" } });
  const rec = interaktionen.records.find(r => r.record_id === pinned) ?? null;
  const eventId = rec ? extractRecordId(rec.fields.veranstaltung) : null;
  const big = { fontSize: 'clamp(1.5rem, 2.8vh, 3rem)' };
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background p-10 text-center text-foreground">
      {!pinned && <p data-view-no-record style={big}>{tx('Bitte über die Übersicht öffnen — diese Ansicht zeigt einen bestimmten Datensatz.')}</p>}
      {pinned && !interaktionen.loading && !rec && !interaktionen.error && (
        <p className="font-semibold" style={{ fontSize: 'clamp(2rem, 4.5vh, 4.5rem)' }}>{tx('Keine aktive Interaktion')}</p>
      )}
      {rec && (
        <>
          <h1 className="max-w-5xl font-semibold" style={{ fontSize: 'clamp(2rem, 5vh, 5rem)' }}>{rec.fields.frage}</h1>
          {eventId && <PublicPageQr entity="veranstaltungen" recordId={eventId} page="feedback-geben" size="48vh" title={tx('QR-Code zum Feedback')} />}
        </>
      )}
      {interaktionen.error && interaktionen.records.length === 0 && (
        <p role="alert" data-live-error className="text-destructive" style={big}>
          {interaktionen.unauthorized ? tx('Bitte melde dich an, um diese Ansicht zu sehen.') : tx('Die Daten konnten nicht geladen werden.')}
        </p>
      )}
    </main>
  );
}
