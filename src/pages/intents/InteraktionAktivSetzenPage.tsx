/**
 * Interaktion aktiv setzen — 3-Schritt-Wizard.
 * Steps: 1) Interaktion wählen → 2) Veranstaltung der Interaktion bekommt sie als aktive → 3) Prüfen & setzen;
 * danach öffnet die Erfolgsseite den QR-Code zum Feedback-Formular in einem eigenen Tab.
 * Reads: interaktionen, veranstaltungen. Writes: veranstaltungen.aktive_interaktion (via useInteraktionAktivSetzenFlow).
 * Composes: IntentWizardShell, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IconQrcode } from '@tabler/icons-react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldText, fieldNumber, fieldRef } from '@/lib/journey';
import { useInteraktionAktivSetzenFlow } from '@/lib/journey/flows/InteraktionAktivSetzen';
import { viewHref } from '@/config/plan';
import { tx } from '@/i18n';

export default function InteraktionAktivSetzenPage() {
  const [step, setStep] = useState(1);
  const flow = useInteraktionAktivSetzenFlow({
    steps: { aktive_interaktion: 1, veranstaltungen: 1 },
    items: {
      aktive_interaktion: (r, ctx) => {
        const nr = fieldNumber(r, 'reihenfolge');
        return {
          id: r.id,
          title: fieldText(r, 'frage'),
          subtitle: [ctx.ref('veranstaltung'), nr != null ? tx`Frage ${nr}` : ''].filter(Boolean).join(' · ') || undefined,
        };
      },
    },
  });

  const interaktionPick = flow.pick('aktive_interaktion');
  const veranstaltungId = flow.targets.veranstaltungen.selectedId;
  const interaktionId = interaktionPick.selectedId;

  // The picked interaktion decides the veranstaltung: load it, take it as the record to change,
  // then write the interaktion into the form (the target's prefill must not overwrite it).
  const choose = (id: string) => {
    const rec = flow.picks.aktive_interaktion.recordOf(id);
    const vId = rec ? fieldRef(rec, 'veranstaltung') : null;
    void (async () => {
      if (vId) {
        const v = await flow.port.get('veranstaltungen', vId);
        if (v) {
          flow.picks.veranstaltungen.adopt(v);
          flow.targets.veranstaltungen.onSelect(v.id);
        }
      }
      interaktionPick.onSelect(id);
    })();
  };

  const openQr = () => {
    const fromResult = flow.submit.result ? fieldRef(flow.submit.result.primary, 'aktive_interaktion') : null;
    const id = fromResult ?? interaktionId;
    window.open(viewHref('qr-code', id), '_blank', 'noopener');
  };

  return (
    <IntentWizardShell
      title={tx('Interaktion aktiv setzen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Eine Interaktion für ihre Veranstaltung als die laufende festlegen.'),
        needs: [tx('Die Interaktion, die jetzt laufen soll')],
      }}
    >
      <WizardStep label={tx('Interaktion')} description={tx('Welche Interaktion soll jetzt laufen?')}>
        <EntitySelectStep
          {...flow.picks.aktive_interaktion.select}
          selectedId={interaktionId}
          onSelect={choose}
          avatar="none"
          searchPlaceholder={tx('Frage suchen …')}
        />
      </WizardStep>

      <WizardStep
        label={tx('Veranstaltung')}
        description={tx('Diese Veranstaltung bekommt die Interaktion als aktive.')}
        needs={['aktive_interaktion']}
      >
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card p-4 overflow-hidden space-y-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{tx('Veranstaltung')}</p>
              <p className="font-medium truncate">
                {veranstaltungId
                  ? flow.picks.veranstaltungen.labelOf(veranstaltungId) ?? veranstaltungId
                  : tx('Wird geladen …')}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{tx('Wird aktiv')}</p>
              <p className="font-medium line-clamp-3">
                {interaktionId ? flow.picks.aktive_interaktion.labelOf(interaktionId) ?? interaktionId : '—'}
              </p>
            </div>
          </div>
          <StepNav
            onBack={() => setStep(1)}
            onNext={() => (veranstaltungId ? flow.validateStep(1) : tx('Die Veranstaltung der Interaktion wird noch geladen.'))}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            confirmLabel={tx('Aktiv setzen')}
            whatHappensNext={tx('Danach kannst du den QR-Code zum Feedback-Formular in einem eigenen Tab öffnen.')}
          />
        )}
      </WizardStep>

      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          undo={flow.undo}
          actions={{ copy: false, print: false }}
          next={[
            { label: tx('QR-Code öffnen'), onClick: openQr, icon: <IconQrcode size={16} className="shrink-0" /> },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          whatHappensNext={tx('Der QR-Code öffnet sich bildschirmfüllend in einem neuen Tab — ideal für den Beamer.')}
        />
      )}
    </IntentWizardShell>
  );
}
