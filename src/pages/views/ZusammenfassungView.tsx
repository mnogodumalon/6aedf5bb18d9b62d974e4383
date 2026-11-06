/**
 * src/pages/views/ZusammenfassungView.tsx — the view „Zusammenfassung der Feedbacks“ the plan orders (dashboard.views).
 *
 * ROUTE   #/ansicht/zusammenfassung — generated in App.tsx, OUTSIDE the dashboard chrome
 *         (no header, drawer or assistant: a beamer / kiosk / print surface). Never wire a route for it yourself.
 * LIVE    static — loads once.
 * READS   interaktionen (veranstaltung, frage, erlaeuterung, vorprompt, endprompt, zusammenfassung); feedbacks (interaktion, kuerzel, feedback_text) * COMPOSE interaktionen.zusammenfassung: THIS view puts the text together when it opens and the field is empty —
 *         Vorprompt, dann jedes Feedback der Interaktion als Zeile mit Kürzel und Text, zuletzt der Endprompt.
 *         Records you put together go in the order they came: sort by `createdat` (oldest first), never the REST order.
 *         Fill `compose` below (return null until every source read has loaded; `blocked` gets a sentence when one
 *         failed — then nothing is composed or saved). The overview's card opens this view in a NEW TAB with a real
 *         link: <a href={`#/ansicht/zusammenfassung?record=${r.record_id}`} target="_blank" rel="noopener">Zusammenfassen</a> —
 *         no flow, no tool, no window.open after an await. „Neu zusammenführen“ asks twice before it overwrites.
 * EDITS   interaktionen.zusammenfassung is edited ON this view, in front of the room: keep the
 *         <ViewTextEditor field="zusammenfassung" …> below (big field, saves by itself with
 *         „Gespeichert“ / „Speichert …“ / „Nicht gespeichert — erneut versuchen“, „Text kopieren“) on
 *         the record the view SHOWS — never a read-only text with an „Bearbeiten“ dialog
 *         (check-dashboard refuses a view without it).
 * RECORD  this view shows ONE record: it is opened as `#/ansicht/zusammenfassung?record=<id>` (links: `viewHref('zusammenfassung', id)` from
 *         '@/config/plan') and reads that id. Without `?record=` it says so („Bitte über die Übersicht öffnen“) —
 *         never `records[0]` of a list, never the first active one app-wide (EF-30: another event's QR).
 * ERRORS  a read that fails sets `error` (`unauthorized` when nobody is signed in: ask to sign in, never „connection lost“);
 *         a write the view makes by itself (autosave) shows „Nicht gespeichert — erneut versuchen“ on an error, never „Speichert …“ for good (the rows stay the last good state). With no rows AND an
 *         error the view says so on screen (keep the `data-live-error` block) — never the empty state.
 * JOIN    a QR or link to the public page is BUILT: <PublicPageQr entity="veranstaltungen" recordId={…} page="<one of abschlussbewertung, feedback-geben>" />
 *         (or usePublicPageLink) from '@/components/widgets/PublicPageQr' — never a record's link field, and
 *         never shown only when such a field is filled: the record existing is enough (EF-15: every new event
 *         read „Kein Feedback-Link hinterlegt“ because a link field nobody writes gated the QR).
 * PURPOSE Führt alle Feedbacks einer Interaktion in ein großes, änderbares Textfeld zusammen, das bildschirmfüllend im eigenen Tab liegt und mit einem Klick kopiert wird.
 *
 * CONTRACT — what the overview (or a flow) and this view agree on. The overview
 * agent reads the same sentences; build EXACTLY this, never negotiate:
 *   - Der Klick auf „Zusammenfassen“ bei einer Interaktion öffnet diese Ansicht sofort in einem neuen Tab, und zwar für genau diese Interaktion.
 *   - Zeigt oben Frage und Erläuterung der Interaktion, darunter das große Textfeld.
 *   - Ist die Zusammenfassung leer, setzt die Ansicht den Text zusammen: oben der Vorprompt, dann jedes Feedback der Interaktion mit seinem Kürzel, unten der Endprompt.
 *   - Der Moderator ändert den Text beliebig; er speichert sich selbst bei der Interaktion und bleibt beim erneuten Öffnen erhalten.
 *   - „Neu zusammenführen“ ersetzt den Text jederzeit durch den frisch aus den aktuellen Feedbacks gebauten; ein Kopieren-Knopf legt den ganzen Text in die Zwischenablage.
 *   - Ohne Feedbacks besteht der Text nur aus Vorprompt und Endprompt.
 *
 * This file is a PLACEHOLDER (KLAR_VIEW_PLACEHOLDER): replace its body with the real
 * view and drop that token. Rules: reads through useLiveRecords / useLiveRecord
 * (silent, stale on error, pauses hidden) — no own setInterval; `tx()` for every
 * visible string; big type, high contrast — this is read from across a room.
 */
import { useLiveRecords } from '@/hooks/useLiveRecords';
import { tx } from '@/i18n';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { ViewTextEditor } from '@/components/blocks/ViewTextEditor';

export default function ZusammenfassungView() {
  const pinned = (new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('record') ?? '').replace(/["\\]/g, '');
  const interaktionen = useLiveRecords('interaktionen', { intervalMs: 0 });
  const feedbacks = useLiveRecords('feedbacks', { intervalMs: 0 });
  // the record whose zusammenfassung this view edits — the one `?record=` names, never the first row (EF-30)
  const interaktionenEdit = interaktionen.records.find(r => r.record_id === pinned) ?? null;
  const big = { fontSize: 'clamp(1.5rem, 2.8vh, 3rem)' };
  return (
    <main className="min-h-dvh bg-background p-10 text-foreground">
      {!pinned && <p data-view-no-record className="mt-4" style={big}>{tx('Bitte über die Übersicht öffnen — diese Ansicht zeigt einen bestimmten Datensatz.')}</p>}
      {interaktionenEdit && (
        <>
          <h1 className="font-semibold" style={{ fontSize: 'clamp(2rem, 4.5vh, 4.5rem)' }}>{interaktionenEdit.fields.frage}</h1>
          {interaktionenEdit.fields.erlaeuterung && <p className="mt-2 text-muted-foreground" style={big}>{interaktionenEdit.fields.erlaeuterung}</p>}
          <div className="mt-6">
            <ViewTextEditor
              field="zusammenfassung"
              recordId={interaktionenEdit.record_id}
              value={String((interaktionenEdit.fields as Record<string, unknown>)['zusammenfassung'] ?? '')}
              save={async text => {
                await LivingAppsService.updateInteraktionenEntry(interaktionenEdit.record_id, { zusammenfassung: text });
                interaktionen.apply(interaktionenEdit.record_id, { zusammenfassung: text });
              }}
              compose={() => {
                if (interaktionen.loading || feedbacks.loading) return null;
                const rows = feedbacks.records
                  .filter(f => extractRecordId(f.fields.interaktion) === interaktionenEdit.record_id)
                  .sort((a, b) => (a.createdat ?? a.created_at ?? '').localeCompare(b.createdat ?? b.created_at ?? ''))
                  .map(f => `${f.fields.kuerzel ?? '?'}: ${f.fields.feedback_text ?? ''}`);
                return [interaktionenEdit.fields.vorprompt, ...rows, interaktionenEdit.fields.endprompt]
                  .filter((p): p is string => !!p && p.trim() !== '')
                  .join('\n\n');
              }}
              blocked={[interaktionen, feedbacks].some(x => x.error) ? tx('Die Daten konnten nicht geladen werden — es wird nichts zusammengeführt oder gespeichert.') : null}
            />
          </div>
        </>
      )}
      {interaktionen.error && interaktionen.records.length === 0 && (
        <p role="alert" data-live-error className="mt-4 text-destructive" style={big}>
          {interaktionen.unauthorized ? tx('Bitte melde dich an, um diese Ansicht zu sehen.') : tx('Die Daten konnten nicht geladen werden.')}
        </p>
      )}
      {feedbacks.error && feedbacks.records.length === 0 && (
        <p role="alert" data-live-error className="mt-4 text-destructive" style={big}>
          {feedbacks.unauthorized ? tx('Bitte melde dich an, um diese Ansicht zu sehen.') : tx('Die Daten konnten nicht geladen werden.')}
        </p>
      )}
    </main>
  );
}
