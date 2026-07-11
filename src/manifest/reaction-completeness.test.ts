/**
 * Reaction completeness — compile-time checks for silent no-op reactions.
 */

import { describe, it, expect } from 'vitest';
import { compileToIR } from './ir-compiler';

describe('reaction completeness', () => {
  it('errors when reaction listens for an event nothing emits', async () => {
    const { diagnostics, ir } = await compileToIR(`entity Order {
  property required id: string
  command complete() { emit OrderCompleted }
}

store Order in memory

event OrderCompleted: "order.completed" { orderId: string }

on NeverEmitted run Order.complete
  resolve payload._subject.id`);

    expect(diagnostics.some(d => d.severity === 'error' && /no command emits/.test(d.message))).toBe(true);
    expect(ir).toBeNull();
  });

  it('errors when reaction references payload field not on emitter params', async () => {
    const { diagnostics, ir } = await compileToIR(`entity Order {
  property required id: string
  command complete() { mutate id = id emit OrderCompleted }
}

store Order in memory

event OrderCompleted: "order.completed" { orderId: string }

on OrderCompleted run Order.complete
  resolve payload._subject.id
  params { ghost: payload.missingField }`);

    expect(diagnostics.some(d => d.severity === 'error' && /payload\.missingField/.test(d.message))).toBe(true);
    expect(ir).toBeNull();
  });

  it('passes when reaction uses emitter input param via payload', async () => {
    const { diagnostics, ir } = await compileToIR(`entity Order {
  property required id: string
  command record(amount: number) {
    emit OrderRecorded
  }
}

store Order in memory

event OrderRecorded: "order.recorded" { orderId: string amount: number }

on OrderRecorded run Order.record
  resolve payload._subject.id
  params { amount: payload.amount }`);

    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(ir).not.toBeNull();
  });

  it('passes when reaction uses a field explicitly emitted for its event', async () => {
    const { diagnostics, ir } = await compileToIR(`entity Event {
  property required id: string
  command applyExternalCalendarUpdate() {
    emit ExternalCalendarUpdated { eventId: self.id }
  }

  command recordExternalCalendarUpdate(eventId: string) {
    mutate id = eventId
  }
}

store Event in memory

event ExternalCalendarUpdated: "external-calendar.updated"

on ExternalCalendarUpdated run Event.recordExternalCalendarUpdate
  resolve payload.eventId
  params { eventId: payload.eventId }`);

    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(ir).not.toBeNull();
  });
});
