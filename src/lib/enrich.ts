import type { EnrichedAbschlussbewertungen, EnrichedFeedbacks, EnrichedInteraktionen, EnrichedVeranstaltungen } from '@/types/enriched';
import type { Abschlussbewertungen, Feedbacks, Interaktionen, Veranstaltungen } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => String(r.fields[f] ?? '')).join(' ').trim();
}

interface VeranstaltungenMaps {
  interaktionenMap: Map<string, Interaktionen>;
}

export function enrichVeranstaltungen(
  veranstaltungen: Veranstaltungen[],
  maps: VeranstaltungenMaps
): EnrichedVeranstaltungen[] {
  return veranstaltungen.map(r => ({
    ...r,
    aktive_interaktionName: resolveDisplay(r.fields.aktive_interaktion, maps.interaktionenMap, 'frage'),
  }));
}

interface InteraktionenMaps {
  veranstaltungenMap: Map<string, Veranstaltungen>;
}

export function enrichInteraktionen(
  interaktionen: Interaktionen[],
  maps: InteraktionenMaps
): EnrichedInteraktionen[] {
  return interaktionen.map(r => ({
    ...r,
    veranstaltungName: resolveDisplay(r.fields.veranstaltung, maps.veranstaltungenMap, 'titel'),
  }));
}

interface FeedbacksMaps {
  interaktionenMap: Map<string, Interaktionen>;
}

export function enrichFeedbacks(
  feedbacks: Feedbacks[],
  maps: FeedbacksMaps
): EnrichedFeedbacks[] {
  return feedbacks.map(r => ({
    ...r,
    interaktionName: resolveDisplay(r.fields.interaktion, maps.interaktionenMap, 'frage'),
  }));
}

interface AbschlussbewertungenMaps {
  veranstaltungenMap: Map<string, Veranstaltungen>;
}

export function enrichAbschlussbewertungen(
  abschlussbewertungen: Abschlussbewertungen[],
  maps: AbschlussbewertungenMaps
): EnrichedAbschlussbewertungen[] {
  return abschlussbewertungen.map(r => ({
    ...r,
    veranstaltungName: resolveDisplay(r.fields.veranstaltung, maps.veranstaltungenMap, 'titel'),
  }));
}
