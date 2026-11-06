import type { Abschlussbewertungen, Feedbacks, Interaktionen, Veranstaltungen } from './app';

export type EnrichedVeranstaltungen = Veranstaltungen & {
  aktive_interaktionName: string;
};

export type EnrichedInteraktionen = Interaktionen & {
  veranstaltungName: string;
};

export type EnrichedFeedbacks = Feedbacks & {
  interaktionName: string;
};

export type EnrichedAbschlussbewertungen = Abschlussbewertungen & {
  veranstaltungName: string;
};
