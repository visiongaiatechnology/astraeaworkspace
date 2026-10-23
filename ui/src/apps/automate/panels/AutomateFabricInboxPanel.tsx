// STATUS: DIAMANT VGT SUPREME — the visible Fabric event inbox.
//
// This panel is the first caller of `integrations/automateWorkspaceIntegration.ts`, whose
// `createFabricAutomationEvent` validated event envelopes that no application code ever produced.
//
// It records observed workspace events and answers, per event, whether a trigger of this flow accepts
// it. It deliberately does NOT claim delivery: no Fabric bus is wired in this tree, so every event is
// shown as recorded-but-not-delivered, and the panel says exactly that in every locale.
import React, { useMemo, useState } from 'react';
import { Inbox, Radio, ShieldAlert } from 'lucide-react';
import type { AutomateDocumentModel, JsonValue } from '../model/types';
import {
  acceptedWorkspaceEvents,
  describeEventDelivery,
  FABRIC_WORKSPACE_EVENT_TYPES,
  flowFabricEvents,
  recordFabricEvent,
} from '../integrations/automateFabricInboxCore';
import { useAutomateCopy } from '../locale/automateLocale';

interface Props {
  model: AutomateDocumentModel;
  onUpdateModel: (updater: (prev: AutomateDocumentModel) => AutomateDocumentModel) => void;
}

/** i18n key per refusal code. Every code the core can emit is listed, so none renders raw. */
const REFUSAL_KEYS: Readonly<Record<string, string>> = {
  'fabric-event-type-unsupported': 'fabricEventTypeUnsupported',
  'fabric-event-duplicate': 'fabricEventDuplicate',
  'fabric-event-log-boundary': 'fabricLogBoundary',
  'fabric-payload-boundary': 'fabricPayloadBoundary',
  'fabric-event-invalid': 'fabricEventInvalid',
};

let eventSeed = 0;

export const AutomateFabricInboxPanel: React.FC<Props> = ({ model, onUpdateModel }) => {
  const copy = useAutomateCopy();
  const labels = copy as unknown as Record<string, string>;
  const events = useMemo(() => flowFabricEvents(model), [model]);
  const accepted = useMemo(() => acceptedWorkspaceEvents(model), [model]);
  const [eventType, setEventType] = useState<string>(FABRIC_WORKSPACE_EVENT_TYPES[0]);
  const [objectRef, setObjectRef] = useState('vgt://workspace/documents/current');
  const [refusal, setRefusal] = useState('');

  const record = () => {
    eventSeed += 1;
    try {
      // Validated against the current document first, so a refusal is a value, not a thrown render.
      const next = recordFabricEvent(model, {
        eventId: `evt-${Date.now().toString(36)}-${eventSeed}`,
        eventType,
        objectRef,
        objectVersion: 1,
        occurredAt: Date.now(),
        payload: { source: 'inbox' } as JsonValue,
      });
      setRefusal('');
      onUpdateModel(() => next);
    } catch (error) {
      setRefusal(error instanceof Error ? error.message : 'fabric-event-invalid');
    }
  };

  return (
    <section className="automate-fabric-inbox" data-automate-fabric-events={events.length} aria-labelledby="automate-fabric-heading">
      <h4 id="automate-fabric-heading" className="automate-fabric-title text-[0.625rem] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
        <Inbox aria-hidden="true"/>{copy.fabricInbox}
      </h4>

      <p className="automate-fabric-count text-[0.6875rem]" role="status">
        {events.length === 0 ? copy.fabricEmpty : copy.fabricRecorded(events.length)}
      </p>
      <p className="automate-fabric-accepted text-[0.625rem]">{copy.fabricAcceptedKinds(accepted.length)}</p>

      <div className="automate-fabric-controls mt-2 space-y-1">
        <label className="automate-fabric-field block" htmlFor="automate-fabric-type">
          <span className="automate-fabric-label block text-[0.625rem]">{copy.fabricEventKind}</span>
          <select
            id="automate-fabric-type"
            value={eventType}
            data-automate-fabric-type="true"
            onChange={(event) => setEventType(event.target.value)}
            className="automate-fabric-input w-full px-2 py-1 text-[0.6875rem]"
          >
            {FABRIC_WORKSPACE_EVENT_TYPES.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
          </select>
        </label>
        <label className="automate-fabric-field block" htmlFor="automate-fabric-ref">
          <span className="automate-fabric-label block text-[0.625rem]">{copy.inspector}</span>
          <input
            id="automate-fabric-ref"
            type="text"
            value={objectRef}
            maxLength={512}
            data-automate-fabric-ref="true"
            onChange={(event) => setObjectRef(event.target.value)}
            className="automate-fabric-input w-full px-2 py-1 text-[0.6875rem]"
          />
        </label>
        <button type="button" onClick={record} className="automate-primary-button w-full py-1 text-[0.6875rem] font-semibold">
          {copy.fabricInbox}
        </button>
      </div>

      {refusal !== '' && (
        <p data-automate-fabric-refusal={refusal} role="alert" className="automate-fabric-refusal text-[0.625rem] mt-1">
          <ShieldAlert aria-hidden="true"/> {labels[REFUSAL_KEYS[refusal]] ?? refusal}
        </p>
      )}

      {events.length > 0 && (
        <ul className="automate-fabric-list mt-2 space-y-1">
          {events.map((event) => {
            const delivery = describeEventDelivery(model, event);
            return (
              <li
                key={event.eventId}
                data-automate-fabric-event={event.eventType}
                data-automate-fabric-delivered={delivery.delivered ? 'true' : 'false'}
                data-automate-fabric-matched={delivery.matchedTriggerIds.length}
                className="automate-fabric-event text-[0.625rem]"
              >
                <span className="automate-fabric-event-kind font-mono">{event.eventType}</span>
                <span className="automate-fabric-event-verdict block">
                  <Radio aria-hidden="true"/> {delivery.matchedTriggerIds.length > 0 ? copy.fabricAccepted : copy.fabricUnmatched}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <p data-automate-fabric-not-delivered="true" className="automate-fabric-honest text-[0.625rem] mt-1">{copy.fabricNotDelivered}</p>
    </section>
  );
};
