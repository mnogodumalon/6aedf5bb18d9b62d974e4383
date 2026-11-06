/**
 * useInteraktionAktivSetzenFlow — the plumbing of the flow « Interaktion aktiv setzen », generated from the plan.
 *
 * Changes `veranstaltungen`: the record to change is picked (`flow.pick('veranstaltungen')`), the form is prefilled with its values; asks `aktive_interaktion`.
 * The hook OWNS: the form(s) with exactly these fields and the plan's required
 * ingredients, one record search per picked field (columns and filter from
 * the plan), and the submit plan with its fixed and derived values. A page
 * that only calls `flow.submit.run()` cannot write a field the plan does not
 * know — there is no way to spell it.
 *
 * YOU decide what a person notices, through the options:
 *   steps     which wizard step asks which field (default: one step per pick,
 *             then one for the typed fields, then "Prüfen" = step 3)
 *   items     how a search hit is displayed per pick (title, subtitle, status …)
 *   initial   prefills for typed fields
 *   messages  the sentence for an empty required field, per field
 *
 *   const flow = useInteraktionAktivSetzenFlow({
 *     steps: { veranstaltungen: 1, aktive_interaktion: 2 },
 *     items: { aktive_interaktion: r => ({ id: r.id, title: fieldText(r, 'frage') }) },
 *   });
 *   <IntentWizardShell forms={flow.forms} draftKey={flow.draftKey} …>
 *     <EntitySelectStep {...flow.picks.aktive_interaktion.select} {...flow.pick('aktive_interaktion')} />
 *     // the record this flow changes: <EntitySelectStep {...flow.picks.veranstaltungen.select} {...flow.pick('veranstaltungen')} />
 *     <StepNav onNext={() => flow.validateStep(n)} />
 *     {!flow.submit.done && <SummaryStep forms={flow.formList} submit={flow.submit} />}
 *     {flow.submit.result && <SuccessStep result={flow.submit.result} forms={flow.formList} submit={flow.submit} undo={flow.undo} />}
 *   </IntentWizardShell>
 */
import { useEffect, useRef, useState } from 'react';
import { readJourneyExtra, writeJourneyExtra } from '@/lib/journey/draft';
import { nounOne } from '@/config/plan';
import {
  useStepForm, useJourneySubmit, useRecordSearch,
  fieldText, fieldLookup, fieldLookups, fieldNumber, fieldDate, fieldRef,
  todayIso, nowIso, isEmptyValue, policyFixedValue, withPickPolicy, usePolicyVersion, refFilter, combineFilters,  type StepForm, type JourneyRecord, type RefContext, type SelectItemLike, type FormValues, type PlanStep,} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { requestWizardStep } from '@/lib/journey/useStepForm';
import { reportReadFailure } from '@/lib/journey/readFailures';
import { pickHint, whereSentence, type PickWhere } from '@/lib/journey/policy';
import { labelOf, optionsOf, type EntityKey } from '@/lib/journey/rules';
import { entityLabel } from '@/lib/journey/rules';

export type InteraktionAktivSetzenFieldKey = 'aktive_interaktion' | 'veranstaltungen';

export interface InteraktionAktivSetzenForms {
  veranstaltungen: StepForm<'veranstaltungen'>;
}

// Alias so the option generics stay readable.
type Key = InteraktionAktivSetzenFieldKey;

export interface InteraktionAktivSetzenFlowOptions {
  /** field → wizard step that asks it; drives „Ändern“ links and answer chips. */
  steps?: Partial<Record<Key, number>>;
  initial?: Partial<Record<Key, unknown>>;
  messages?: Partial<Record<Key, string>>;
  /** How a search hit reads — the card's title/subtitle/status per pick. */
  items?: {
    aktive_interaktion?: (record: JourneyRecord, ctx: RefContext) => SelectItemLike;
    veranstaltungen?: (record: JourneyRecord, ctx: RefContext) => SelectItemLike;
  };
  /** A page-side narrowing per pick, on top of the plan's filter (J-3): the
   *  questions of the picked event, the open ones — `r => fieldRef(r, 'veranstaltung') === eventId`. */
  where?: {
    aktive_interaktion?: (record: JourneyRecord) => boolean;
    veranstaltungen?: (record: JourneyRecord) => boolean;
  };
}

const DEFAULT_STEPS: Record<string, number> = {"aktive_interaktion": 2, "veranstaltungen": 1};
export const INTERAKTIONAKTIVSETZEN_REVIEW_STEP = 3;
// a label of the plan in the page's language
function labelIn(m: Record<string, string>): string {
  const l = (typeof document !== 'undefined' ? document.documentElement.lang : '') || 'de';
  return m[l.slice(0, 2)] ?? m.de ?? Object.values(m)[0] ?? '';
}
// the counter-action (plan: undo) — what puts the changed record back
const UNDO_SETS: Record<string, unknown> = {"aktive_interaktion": ""};

function fromPick<T>(pick: { recordOf(id: string): JourneyRecord | undefined }, form: StepForm, field: string, read: (r: JourneyRecord) => T): T | undefined {
  const id = form.get(field);
  const rec = typeof id === 'string' && id ? pick.recordOf(id) : undefined;
  return rec ? read(rec) : undefined;
}
// local calendar day — the ISO-string of a Date is UTC and flips the date in the evening (J-7)
function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Returns T, not Partial<T>: a Record's index signature is already "maybe
// absent", and Partial<Record<string, string>> does not assign to the
// Record<string, string> useStepForm wants (tsc, live 23.09.2026 — eight
// errors, one per hook, caught only in the sandbox build).
function only<T extends Record<string, unknown>>(obj: T | undefined, keys: string[]): T | undefined {
  if (!obj) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out as T;
}

function hasValues(form: StepForm): boolean {
  return form.keys.some(k => !isEmptyValue(form.values[k]));
}
// The picked record as `?record=<id>` in the address — a reload or a shared
// address opens the flow on the same record (J-8). replaceState: no navigation.
function mirrorRecordParam(id: string | null): void {
  try {
    const [base, query = ''] = window.location.hash.split('?');
    const q = new URLSearchParams(query);
    if (id) q.set('record', id); else q.delete('record');
    const qs = q.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${base}${qs ? `?${qs}` : ''}`);
  } catch {
    /* ignore */
  }
}

export function useInteraktionAktivSetzenFlow(options: InteraktionAktivSetzenFlowOptions = {}) {
  const steps = { ...DEFAULT_STEPS, ...(options.steps ?? {}) } as Record<string, number>;
  const [veranstaltungenTargetId, setVeranstaltungenTargetId] = useState<string | null>(null);
  const veranstaltungen = useStepForm('veranstaltungen', {
    fields: ["aktive_interaktion"],
    steps: only(steps, ["aktive_interaktion"]) as Record<string, number>,
    initial: only(options.initial as FormValues | undefined, ["aktive_interaktion"]),
    messages: only(options.messages as Record<string, string> | undefined, ["aktive_interaktion"]),
  });
  const forms: InteraktionAktivSetzenForms = { veranstaltungen };
  // the editor of a list is not a record of its own: the review and the success
  // page read the entries (PlanStep.review), never the half-filled editor
  const formList: StepForm[] = [veranstaltungen];
  // The owner's rules after the build (intent-policies.json): a fixed value
  // for a field this flow sets itself, a narrower or wider pick — read at
  // render time, so a change works on the running application.
  usePolicyVersion();
  // a pick that belongs to another pick's record (A9): server filter + its client twin
  const dependsOn = (dep: unknown, field: string) => (typeof dep === 'string' && /^[a-f0-9]{24}$/i.test(dep) ? refFilter(field, dep) : undefined);
  const dependsWhere = (r: JourneyRecord, field: string, dep: unknown) => typeof dep !== 'string' || dep === '' || fieldRef(r, field) === dep;
  const searches = {
    aktive_interaktion: useRecordSearch(servicePort, 'interaktionen', withPickPolicy('aktive_interaktion', {
      searchFields: ["frage", "erlaeuterung"] as never,
      // only the interaktionen of the veranstaltungen picked before
      filter: combineFilters(undefined, dependsOn(veranstaltungenTargetId, 'veranstaltung')),
      where: (r: JourneyRecord) => (true) && dependsWhere(r, 'veranstaltung', veranstaltungenTargetId) && (options.where?.aktive_interaktion?.(r) ?? true),
      toItem: options.items?.aktive_interaktion as never,
    })),
    veranstaltungen: useRecordSearch(servicePort, 'veranstaltungen', withPickPolicy('veranstaltungen', {
      searchFields: ["titel"] as never,
      // only the veranstaltungen of the aktive_interaktion picked before
      filter: combineFilters(undefined, dependsOn(veranstaltungen.get("aktive_interaktion"), 'aktive_interaktion')),
      where: (r: JourneyRecord) => (true) && dependsWhere(r, 'aktive_interaktion', veranstaltungen.get("aktive_interaktion")) && (options.where?.veranstaltungen?.(r) ?? true),
      toItem: options.items?.veranstaltungen as never,
    })),
  };
  // Whether a pick offers „Neu anlegen“ is the plan's call: off for the record
  // this flow changes, for multi picks, for a catalogue entity and for an
  // entity with its own flow. The page spreads `.select` and writes no `create=`.
  // what the person sees under the search field: the rule that narrows the
  // pick (the owner's, else the plan's) — and the link that changes it
  const hintFor = (key: string, entity: EntityKey, planned: PickWhere | null) => pickHint(key, planned,
    w => whereSentence(w, f => labelOf(entity, f), (f, v) => optionsOf(entity, f).find(o => o.key === String(v))?.label ?? String(v)),
    `#/verwaltung/anwendung?line=intent:interaktion-aktiv-setzen:read:${entity}`);
  const picks = {
    aktive_interaktion: { ...searches.aktive_interaktion, select: { ...searches.aktive_interaktion.select, create: true as boolean, hint: hintFor('aktive_interaktion', 'interaktionen', {"conditions": [{"field": "aktiv", "op": "ne", "value": "true"}], "mode": "all"} as PickWhere | null) } },
    veranstaltungen: { ...searches.veranstaltungen, select: { ...searches.veranstaltungen.select, create: false as boolean, hint: hintFor('veranstaltungen', 'veranstaltungen', null as PickWhere | null) } },
  };

  const plan: PlanStep[] = [
    {
      key: 'veranstaltungen', entity: 'veranstaltungen', form: veranstaltungen, label: nounOne('veranstaltungen', entityLabel('veranstaltungen')), primary: true,
      updates: () => veranstaltungenTargetId ?? undefined,
      // the review names the record this step changes; "Ändern" leads back to its pick
      target: () => veranstaltungenTargetId
        ? { key: 'target:veranstaltungen', label: nounOne('veranstaltungen', entityLabel('veranstaltungen')), value: picks.veranstaltungen.labelOf(veranstaltungenTargetId) ?? veranstaltungenTargetId, step: steps.veranstaltungen }
        : undefined,    },
  ];

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'interaktion-aktiv-setzen' });

  // A typed field the plan prefills from the picked record (`user:from_pick`),
  // still the person's to change: filled once, only while empty (PV-12)
  const prefillFrom = (pickKey: string, rec: JourneyRecord) => {
    void pickKey; void rec;
  };

  // Opened with `?<field>=<value>` for a field this flow asks — a dashboard
  // link that pre-picks the event, a form that hands the question on (J-2):
  // a typed field takes the value while it is empty (a draft wins), a pick
  // loads the record, takes it into the pick and selects it WITH its name.
  // `initial` with a bare record id gets its name the same way.
  const [linkedParams] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] ?? ''));
  useEffect(() => {
    let on = true;
    const coerce = (form: StepForm, key: string, raw: string): unknown => {
      const kind = form.rules[key]?.kind;
      if (kind === 'number') { const n = Number(raw); return Number.isFinite(n) ? n : raw; }
      if (kind === 'bool') return raw === 'true' || raw === '1' || raw === 'ja';
      return raw;
    };
    {
      const cur = forms.veranstaltungen.get('aktive_interaktion');
      const fromLink = linkedParams.get('aktive_interaktion');
      const unnamed = typeof cur === 'string' && cur !== '' && !forms.veranstaltungen.labels[cur] ? cur : null;
      const id = fromLink && isEmptyValue(cur) ? fromLink : unnamed;
      if (id) void servicePort.get('interaktionen', id).then(rec => {
        if (!on || !rec) return;
        picks.aktive_interaktion.adopt(rec);
        const name = picks.aktive_interaktion.labelOf(rec.id) ?? rec.id;
        (forms.veranstaltungen.set as (k: string, v: unknown, l?: string) => void)('aktive_interaktion', rec.id, name);
        prefillFrom('aktive_interaktion', rec);
      }).catch(() => undefined);
    }
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per link
  }, []);

  /** The record(s) this flow CHANGES: picked through {...flow.picks.<entity>.select} {...flow.pick('<entity>')};
   *  picking prefills the form with the record's current values, and the plan step updates that record. */
  const targets = {
    veranstaltungen: {
      selectedId: veranstaltungenTargetId,
      onSelect: (id: string) => {
        setVeranstaltungenTargetId(id);
        const rec = picks.veranstaltungen.recordOf(id);
        if (rec) veranstaltungen.reset({ aktive_interaktion: fieldRef(rec, "aktive_interaktion"), });
        // survives a reload: in the draft's side data, and as `?record=` in the address (J-8)
        writeJourneyExtra('interaktion-aktiv-setzen', 'target:veranstaltungen', id);
        mirrorRecordParam(id);
      },
      get record(): JourneyRecord | undefined { return veranstaltungenTargetId ? picks.veranstaltungen.recordOf(veranstaltungenTargetId) : undefined; },
    },
  };
  // Opened for one record — `#/intents/interaktion-aktiv-setzen?record=<id>`, the dashboard's
  // flowActionFor(): that record is the one to change. Loaded, taken into the
  // pick and selected — when this flow may change it at all (the pick's rule).
  // After a reload the pick comes back the same way: from the address, else
  // from the draft's side data (J-8).
  const [linkedId] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('record')
    ?? readJourneyExtra<string>('interaktion-aktiv-setzen', 'target:veranstaltungen'));
  useEffect(() => {
    if (!linkedId) return;
    let on = true;
    void servicePort.get('veranstaltungen', linkedId).then(rec => {
      if (!on || !rec) return;
      reportReadFailure('interaktion-aktiv-setzen:linked', null);
      picks.veranstaltungen.adopt(rec);
      targets.veranstaltungen.onSelect(rec.id);
      // the link named the record — start after the steps that pick it, without the start screen
      const after = Math.max(...Object.keys(targets).map(k => steps[k] ?? 1)) + 1;
      if (new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('record') === linkedId) requestWizardStep(after);
    }).catch(() => { if (on) reportReadFailure('interaktion-aktiv-setzen:linked', 'veranstaltungen'); });
    return () => { on = false; reportReadFailure('interaktion-aktiv-setzen:linked', null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per link
  }, [linkedId]);
  /** Props for a single-record pick step: {...flow.picks.x.select} {...flow.pick('x')} */
  const pick = (field: InteraktionAktivSetzenFieldKey) => {
    if (field in targets) {
      const t = targets[field as keyof typeof targets];
      return { selectedId: t.selectedId, onSelect: t.onSelect };
    }
    const owner = formList.find(f => f.keys.includes(field)) ?? formList[0];
    const search = (picks as Record<string, { labelOf(id: string): string | undefined; recordOf?(id: string): JourneyRecord | undefined }>)[field];
    return {
      selectedId: (typeof owner.get(field) === 'string' ? (owner.get(field) as string) : null) || null,
      // `field as never` collapsed the conditional SetArgs<E, never> to never and
      // no argument was assignable any more (tsc, live 23.09.2026); widen `set`
      // itself instead — the label stays a required third argument.
      onSelect: (id: string) => {
        (owner.set as (k: string, v: unknown, l?: string) => void)(field, id, search?.labelOf(id));
        const rec = search?.recordOf?.(id);
        if (rec) prefillFrom(field, rec);
      },
    };
  };
  /** Props for a multi-record pick step: {...flow.picks.x.select} {...flow.pickMany('x')} */
  const pickMany = (field: InteraktionAktivSetzenFieldKey) => {
    const owner = formList.find(f => f.keys.includes(field)) ?? formList[0];
    const search = (picks as Record<string, { labelOf(id: string): string | undefined }>)[field];
    return owner.records(field, id => search?.labelOf(id));
  };
  /** Validate every field the wizard asks in step `n` — for StepNav.onNext. */
  const validateStep = (n: number): boolean =>
    formList.every(f => f.validate(f.keys.filter(k => steps[k] === n)))    && Object.entries(targets).every(([k, t]) => steps[k] !== n || !!t.selectedId);
  const reset = () => { submit.reset(); formList.forEach(f => f.reset()); setVeranstaltungenTargetId(null); writeJourneyExtra('interaktion-aktiv-setzen', 'target:veranstaltungen', null); mirrorRecordParam(null); };

  /** The counter-action of the changed record — `undo={flow.undo}` on <SuccessStep> (PV-15). */
  const flowUndo = veranstaltungenTargetId
    ? { label: labelIn({"de": "Aktivierung zur\u00fccknehmen", "en": "Undo activation"}), run: () => servicePort.update('veranstaltungen', veranstaltungenTargetId, UNDO_SETS).then(() => undefined) }
    : undefined;
  return {
    slug: 'interaktion-aktiv-setzen' as const,
    draftKey: 'interaktion-aktiv-setzen' as const,    undo: flowUndo,    entity: 'veranstaltungen' as const,
    form: veranstaltungen,
    forms, formList, picks, submit, steps, targets,    reviewStep: INTERAKTIONAKTIVSETZEN_REVIEW_STEP,
    pick, pickMany, validateStep, reset,    // the door the hook reads through — for what it does not own: availability
    // (useOccupancy(flow.port, …)), a count (useRecordCount(flow.port, …)). A page
    // importing servicePort next to the hook fails gate 3 (fewo 05.10.2026: the
    // gate taught useOccupancy(servicePort, …) and forbade servicePort at once)
    port: servicePort,
  };
}

export type InteraktionAktivSetzenFlow = ReturnType<typeof useInteraktionAktivSetzenFlow>;
