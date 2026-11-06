import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { IconPlus, IconQrcode, IconFileText, IconCheck, IconMessage2, IconSparkles } from '@tabler/icons-react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { flowActionFor, viewHref, countOf } from '@/config/plan';
import type { EnrichedInteraktionen, EnrichedAbschlussbewertungen } from '@/types/enriched';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatDateTime, lookupKey } from '@/lib/formatters';
import { useClock, gruss, undoToast } from '@/lib/polish';
import { tx, appLabel } from '@/i18n';
import { Button } from '@/components/ui/button';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatCard, StatCardRow } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { ChartWidget, type ChartRow } from '@/components/widgets/ChartWidget';

function KiAnswer({ rec, onSave }: { rec: EnrichedInteraktionen; onSave: (text: string) => Promise<void> }) {
  const saved = rec.fields.ki_antwort ?? '';
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const dirty = text !== saved;
  return (
    <div className="mt-3 space-y-2">
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <IconSparkles size={14} className="shrink-0" />{tx('Antwort der KI')}
      </label>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={2}
        placeholder={tx('Antwort des Chatbots hier einfügen …')}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
      {dirty && (
        <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); try { await onSave(text); } finally { setBusy(false); } }}>
          <IconCheck size={16} className="shrink-0" />{tx('Antwort speichern')}
        </Button>
      )}
    </div>
  );
}

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const { setInteraktionen, fetchAll } = data;
  const crud = useEntityCrud(data);
  const veranstaltungen = crud.enriched.veranstaltungen;
  const interaktionen = crud.enriched.interaktionen;
  const feedbacks = crud.enriched.feedbacks;
  const bewertungen = crud.enriched.abschlussbewertungen;
  const clock = useClock();
  const todayKey = format(clock, 'yyyy-MM-dd');
  const [picked, setPicked] = useState<string | null>(null);

  const events = useMemo(
    () => [...veranstaltungen].sort((a, b) => (a.fields.datum ?? '9999').localeCompare(b.fields.datum ?? '9999')),
    [veranstaltungen],
  );
  const defaultEvent = events.find(e => (e.fields.datum ?? '').slice(0, 10) >= todayKey) ?? events[events.length - 1];
  const event = events.find(e => e.record_id === picked) ?? defaultEvent;

  const feedbackCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of feedbacks) {
      const id = extractRecordId(f.fields.interaktion);
      if (id) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [feedbacks]);

  const steps = useMemo(
    () => interaktionen
      .filter(i => event && extractRecordId(i.fields.veranstaltung) === event.record_id)
      .sort((a, b) => (a.fields.reihenfolge ?? 0) - (b.fields.reihenfolge ?? 0)),
    [interaktionen, event],
  );
  const active = steps.find(i => i.fields.aktiv);
  const activeIdx = active ? steps.indexOf(active) + 1 : 0;

  const eventRatings = useMemo<ChartRow<EnrichedAbschlussbewertungen>[]>(
    () => bewertungen
      .filter(b => event && extractRecordId(b.fields.veranstaltung) === event.record_id)
      .map(b => ({ id: `abschlussbewertung:${b.record_id}`, data: b })),
    [bewertungen, event],
  );
  const avg = eventRatings.length
    ? eventRatings.reduce((s, r) => s + Number((lookupKey(r.data.fields.sterne) ?? '').replace('stern_', '') || 0), 0) / eventRatings.length
    : null;

  // Auswertung offen: Feedbacks da, aber noch keine KI-Antwort (alle Veranstaltungen)
  const toEvaluate = interaktionen
    .filter(i => (feedbackCount.get(i.record_id) ?? 0) > 0 && !i.fields.ki_antwort)
    .sort((a, b) => (a.fields.reihenfolge ?? 0) - (b.fields.reihenfolge ?? 0));

  const openTab = (route: string, id: string) => { window.open(viewHref(route, id), '_blank', 'noopener'); };

  // ONE write path: Aktiv setzen (Tab öffnet synchron im Klick, dann Schreiben)
  const activate = (i: EnrichedInteraktionen) => {
    openTab('qr-code', i.record_id);
    if (i.fields.aktiv) return;
    const evId = extractRecordId(i.fields.veranstaltung);
    const before = interaktionen.filter(r => extractRecordId(r.fields.veranstaltung) === evId && r.fields.aktiv).map(r => r.record_id);
    const set = (on: string | null, off: string[]) => setInteraktionen(prev => prev.map(r =>
      r.record_id === on ? { ...r, fields: { ...r.fields, aktiv: true } }
        : off.includes(r.record_id) || (on && r.record_id !== on && extractRecordId(r.fields.veranstaltung) === evId) ? { ...r, fields: { ...r.fields, aktiv: false } }
          : r));
    set(i.record_id, before);
    void (async () => {
      try {
        for (const id of before) await LivingAppsService.updateInteraktionenEntry(id, { aktiv: false });
        await LivingAppsService.updateInteraktionenEntry(i.record_id, { aktiv: true });
        if (evId) flowActionFor('veranstaltungen', 'aktive_interaktion', evId, i.record_id)?.();
        undoToast(tx`„${i.fields.frage ?? ''}“ ist jetzt aktiv`, () => {
          setInteraktionen(prev => prev.map(r => r.record_id === i.record_id ? { ...r, fields: { ...r.fields, aktiv: false } }
            : before.includes(r.record_id) ? { ...r, fields: { ...r.fields, aktiv: true } } : r));
          void LivingAppsService.updateInteraktionenEntry(i.record_id, { aktiv: false });
          for (const id of before) void LivingAppsService.updateInteraktionenEntry(id, { aktiv: true });
        });
      } catch { void fetchAll(); }
    })();
  };

  const saveKi = async (i: EnrichedInteraktionen, text: string) => {
    const old = i.fields.ki_antwort ?? '';
    setInteraktionen(prev => prev.map(r => r.record_id === i.record_id ? { ...r, fields: { ...r.fields, ki_antwort: text } } : r));
    try {
      await LivingAppsService.updateInteraktionenEntry(i.record_id, { ki_antwort: text });
      undoToast(tx('KI-Antwort gespeichert'), () => {
        setInteraktionen(prev => prev.map(r => r.record_id === i.record_id ? { ...r, fields: { ...r.fields, ki_antwort: old } } : r));
        void LivingAppsService.updateInteraktionenEntry(i.record_id, { ki_antwort: old });
      });
    } catch { void fetchAll(); }
  };

  const activeFeedbacks = active ? feedbackCount.get(active.record_id) ?? 0 : 0;
  const context = !event
    ? tx('Lege deine erste Veranstaltung an.')
    : active
      ? tx`„${event.fields.titel ?? ''}“ läuft — gerade aktiv: „${active.fields.frage ?? ''}“.`
      : tx`„${event.fields.titel ?? ''}“ — noch keine Interaktion aktiv.`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{gruss(clock)}</h1>
          <p className="text-muted-foreground line-clamp-2">{context}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {crud.veranstaltungen.canWrite && (
            <Button variant="outline" onClick={() => crud.veranstaltungen.openCreate({})}>
              <IconPlus size={16} className="shrink-0" />{tx('Neue Veranstaltung')}
            </Button>
          )}
          {crud.interaktionen.canWrite && (
            <Button onClick={() => crud.interaktionen.openCreate({ veranstaltung: event?.record_id, reihenfolge: steps.length + 1 })}>
              <IconPlus size={16} className="shrink-0" />{tx('Neue Interaktion')}
            </Button>
          )}
        </div>
      </header>

      <DashboardGrid
        kpis={event && steps.length > 0 ? (
          <StatCardRow>
            <StatCard
              title={tx('Aktueller Schritt')}
              value={active ? `${activeIdx} / ${steps.length}` : `– / ${steps.length}`}
              description={active ? (active.fields.frage ?? '') : tx('Keine Interaktion aktiv')}
              icon={<IconQrcode size={18} className="text-muted-foreground" />}
              tone={active ? 'primary' : 'warning'}
              onClick={active ? () => crud.interaktionen.openDetail(active) : undefined}
            />
            <StatCard
              title={tx('Feedbacks der aktiven Interaktion')}
              value={activeFeedbacks}
              description={active ? tx('kommen live herein') : tx('Setze eine Interaktion aktiv')}
              icon={<IconMessage2 size={18} className="text-muted-foreground" />}
              onClick={active ? () => openTab('zusammenfassung', active.record_id) : undefined}
            />
          </StatCardRow>
        ) : undefined}
        aside={
          <>
            <WorkList
              title={tx('Auszuwerten')}
              items={toEvaluate.map(i => ({
                id: i.record_id,
                title: i.fields.frage ?? '',
                secondLine: <span className="text-muted-foreground">{i.veranstaltungName} · {countOf('feedbacks', feedbackCount.get(i.record_id) ?? 0, appLabel('feedbacks'))}</span>,
                action: { label: tx('Zusammenfassen'), onClick: () => openTab('zusammenfassung', i.record_id) },
              }))}
              onItemClick={id => { const r = interaktionen.find(x => x.record_id === id); if (r) crud.interaktionen.openDetail(r); }}
              empty={{ text: tx('Alle Feedbacks sind mit einer KI-Antwort ausgewertet.') }}
            />
            <ChartWidget<EnrichedAbschlussbewertungen>
              title={tx('Abschlussbewertungen')}
              rows={eventRatings}
              dimension={{ kind: 'category', accessor: r => r.data.fields.sterne, label: tx('Sterne') }}
              footer={avg !== null ? <>{tx`Ø ${avg.toFixed(1)} von 5 Sternen`}</> : undefined}
            />
          </>
        }
        primary={
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-wrap gap-2 border-b p-3">
              {events.length === 0 && <span className="text-sm text-muted-foreground">{tx('Noch keine Veranstaltung angelegt.')}</span>}
              {events.map(e => (
                <button
                  key={e.record_id}
                  onClick={() => setPicked(e.record_id)}
                  className={`min-w-0 max-w-full rounded-full border px-3 py-1.5 text-left text-sm ${e.record_id === event?.record_id ? 'border-primary bg-primary text-primary-foreground' : 'bg-background'}`}
                >
                  <span className="block truncate font-medium">{e.fields.titel}</span>
                  <span className="block truncate text-xs opacity-80">{formatDateTime(e.fields.datum)}</span>
                </button>
              ))}
            </div>
            <div className="divide-y">
              {event && steps.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  {tx('Diese Veranstaltung hat noch keine Interaktionen.')}
                </div>
              )}
              {steps.map(i => {
                const n = feedbackCount.get(i.record_id) ?? 0;
                const isActive = !!i.fields.aktiv;
                return (
                  <div key={i.record_id} className={`p-4 ${isActive ? 'bg-primary/5' : ''}`}>
                    <div className="flex items-start gap-3">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                        {i.fields.reihenfolge}
                      </span>
                      <button className="min-w-0 flex-1 text-left" onClick={() => crud.interaktionen.openDetail(i)}>
                        <span className="block font-medium">{i.fields.frage}</span>
                        {i.fields.erlaeuterung && <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{i.fields.erlaeuterung}</span>}
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {isActive && <b className="text-primary">{tx('Aktiv')} · </b>}
                          {countOf('feedbacks', n, appLabel('feedbacks'))}
                        </span>
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant={isActive ? 'default' : 'outline'} onClick={() => activate(i)}>
                        <IconQrcode size={16} className="shrink-0" />{isActive ? tx('QR-Code zeigen') : tx('Aktiv setzen')}
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a href={`#/ansicht/zusammenfassung?record=${i.record_id}`} target="_blank" rel="noopener">
                          <IconFileText size={16} className="shrink-0" />{tx('Zusammenfassen')}
                        </a>
                      </Button>
                    </div>
                    <KiAnswer key={`${i.record_id}:${i.fields.ki_antwort ?? ''}`} rec={i} onSave={text => saveKi(i, text)} />
                  </div>
                );
              })}
            </div>
          </div>
        }
      />
      {crud.surfaces}
    </div>
  );
}
