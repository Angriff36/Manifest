import { describe, it, expect } from 'vitest';
import { compileToIR } from './ir-compiler';
import { RuntimeEngine, type EntityInstance } from './runtime-engine';

/**
 * Aggregate count expressions: `count(Entity where fk == value, status == "x", ...)`.
 *
 * A reaction recomputes and stores a count on a parent after a child
 * create/update/delete event — the declarative replacement for hand-written
 * after-emit "count children where FK == parent, patch parent" middleware
 * (capsule-pro's `schedule-shift-count` and `prep-task-station-count`). This is
 * the last clean, uniform aggregate primitive from the middleware-collapse work;
 * everything else remaining is saga/action/conditional (Bucket B) territory.
 */
describe('aggregate count reactions', () => {
  describe('parser + IR (single equality predicate — schedule-shift-count shape)', () => {
    const source = () => `
      entity Schedule {
        property required id: string
        property shiftCount: number = 0
        hasMany shifts: ScheduleShift
        command syncShiftCount(shiftCount: number) { mutate shiftCount = shiftCount }
        store in memory
      }
      entity ScheduleShift {
        property required id: string
        property scheduleId: string = ""
        belongsTo schedule: Schedule
        command assign(scheduleId: string) {
          mutate scheduleId = scheduleId
          emit ScheduleShiftCreated { scheduleId: self.scheduleId }
        }
        store in memory
      }
      event ScheduleShiftCreated: "scheduleShift.created" {}
      on ScheduleShiftCreated run Schedule.syncShiftCount
        resolve self.scheduleId
        params {
          shiftCount: count(ScheduleShift where scheduleId == self.scheduleId)
        }
    `;

    it('compiles the count expression into an IR aggregate node', async () => {
      const { ir, diagnostics } = await compileToIR(source());
      expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
      const reaction = ir!.reactions?.[0];
      expect(reaction?.targetEntity).toBe('Schedule');
      expect(reaction?.targetCommand).toBe('syncShiftCount');
      expect(reaction?.resolve).toEqual({
        kind: 'member', object: { kind: 'identifier', name: 'self' }, property: 'scheduleId',
      });
      expect(reaction?.params?.[0]).toEqual({
        name: 'shiftCount',
        expression: {
          kind: 'aggregate',
          op: 'count',
          entity: 'ScheduleShift',
          predicates: [
            { field: 'scheduleId', value: { kind: 'member', object: { kind: 'identifier', name: 'self' }, property: 'scheduleId' } },
          ],
        },
      });
    });

    it('counts children matching the FK after each child event and stores the count on the parent', async () => {
      const { ir, diagnostics } = await compileToIR(source());
      expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
      const engine = new RuntimeEngine(ir!, {}, { now: () => 1000, generateId: () => 'gen-id' });
      await engine.createInstance('Schedule', { id: 'p1', shiftCount: 0 } as EntityInstance);
      await engine.createInstance('Schedule', { id: 'p2', shiftCount: 0 } as EntityInstance);
      await engine.createInstance('ScheduleShift', { id: 'c1', scheduleId: '' } as EntityInstance);
      await engine.createInstance('ScheduleShift', { id: 'c2', scheduleId: '' } as EntityInstance);
      await engine.createInstance('ScheduleShift', { id: 'c3', scheduleId: '' } as EntityInstance);

      await engine.runCommand('assign', { scheduleId: 'p1' }, { entityName: 'ScheduleShift', instanceId: 'c1' });
      await engine.runCommand('assign', { scheduleId: 'p1' }, { entityName: 'ScheduleShift', instanceId: 'c2' });
      await engine.runCommand('assign', { scheduleId: 'p2' }, { entityName: 'ScheduleShift', instanceId: 'c3' });

      const schedules = await engine.getAllInstances('Schedule') as EntityInstance[];
      expect(schedules.find(s => s.id === 'p1')?.shiftCount).toBe(2);
      expect(schedules.find(s => s.id === 'p2')?.shiftCount).toBe(1);
    });
  });

  describe('multiple ANDed predicates (prep-task-station-count shape)', () => {
    const source = () => `
      entity Station {
        property required id: string
        property currentTaskCount: number = 0
        hasMany prepTasks: PrepTask
        command syncTaskCount(currentTaskCount: number) { mutate currentTaskCount = currentTaskCount }
        store in memory
      }
      entity PrepTask {
        property required id: string
        property stationId: string = ""
        property status: string = "pending"
        belongsTo station: Station
        command claim(stationId: string) {
          mutate stationId = stationId
          mutate status = "in_progress"
          emit PrepTaskClaimed { stationId: self.stationId }
        }
        store in memory
      }
      event PrepTaskClaimed: "prepTask.claimed" {}
      on PrepTaskClaimed run Station.syncTaskCount
        resolve self.stationId
        params {
          currentTaskCount: count(PrepTask where stationId == self.stationId, status == "in_progress")
        }
    `;

    it('compiles multiple equality predicates into one ANDed aggregate', async () => {
      const { ir, diagnostics } = await compileToIR(source());
      expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
      const agg = ir!.reactions?.[0]?.params?.[0]?.expression;
      expect(agg).toEqual({
        kind: 'aggregate',
        op: 'count',
        entity: 'PrepTask',
        predicates: [
          { field: 'stationId', value: { kind: 'member', object: { kind: 'identifier', name: 'self' }, property: 'stationId' } },
          { field: 'status', value: { kind: 'literal', value: { kind: 'string', value: 'in_progress' } } },
        ],
      });
    });

    it('counts only children matching every predicate (FK AND status)', async () => {
      const { ir, diagnostics } = await compileToIR(source());
      expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
      const engine = new RuntimeEngine(ir!, {}, { now: () => 1000, generateId: () => 'gen-id' });
      await engine.createInstance('Station', { id: 's1', currentTaskCount: 0 } as EntityInstance);
      await engine.createInstance('PrepTask', { id: 't1', stationId: '', status: 'pending' } as EntityInstance);
      await engine.createInstance('PrepTask', { id: 't2', stationId: '', status: 'pending' } as EntityInstance);
      await engine.createInstance('PrepTask', { id: 't3', stationId: '', status: 'pending' } as EntityInstance);

      // Claiming t1 and t2 sets stationId=s1 AND status=in_progress → counted.
      await engine.runCommand('claim', { stationId: 's1' }, { entityName: 'PrepTask', instanceId: 't1' });
      expect((await engine.getAllInstances('Station') as EntityInstance[]).find(s => s.id === 's1')?.currentTaskCount).toBe(1);
      await engine.runCommand('claim', { stationId: 's1' }, { entityName: 'PrepTask', instanceId: 't2' });
      // t3 remains pending → excluded by the status predicate.
      expect((await engine.getAllInstances('Station') as EntityInstance[]).find(s => s.id === 's1')?.currentTaskCount).toBe(2);
    });
  });

  describe('count remains an ordinary identifier outside the aggregate shape', () => {
    it('does NOT reserve "count" — a property named count still parses', async () => {
      const { ir, diagnostics } = await compileToIR(`
        entity Holder {
          property required id: string
          property count: number = 0
          store in memory
        }
      `);
      expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
      expect(ir!.entities[0].properties.find(p => p.name === 'count')?.type.name).toBe('number');
    });
  });
});
