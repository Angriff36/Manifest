import { describe, it, expect } from 'vitest';
import { compileToIR } from './ir-compiler';
import { RuntimeEngine, type EntityInstance } from './runtime-engine';

/**
 * Middleware-collapse regression for the two "count children where FK == parent"
 * after-emit middlewares in capsule-pro:
 *
 *   1. schedule-shift-count   → Schedule.shiftCount   = count(ScheduleShift   where scheduleId == parent)
 *   2. prep-task-station-count → Station.currentTaskCount = count(PrepTask where stationId == parent, status == "in_progress")
 *
 * Both are now expressed DECLARATIVELY as aggregate-count reactions — no hand
 * middleware. This is the last clean, uniform aggregate primitive from the
 * middleware-collapse work.
 *
 * INTENTIONALLY OUT OF SCOPE (remain middleware / saga / action work — NOT Manifest
 * primitive gaps, per the agreed scope fence):
 *   - prep-task-station-count's tenant-wide reconcile (recompute EVERY station per
 *     event) and PrepTaskReassigned's dual-station (A→B) update — multi-target /
 *     conditional fan-out (Bucket B).
 *   - proposal-line-item-count (uses +/- delta, not recompute) — different pattern.
 *   - Identity/RBAC middleware — infra.
 */
describe('middleware-collapse: count reactions retire hand middleware', () => {
  const source = () => `
    entity Schedule {
      property required id: string
      property shiftCount: number = 0
      command syncShiftCount(shiftCount: number) { mutate shiftCount = shiftCount }
      store in memory
    }
    entity ScheduleShift {
      property required id: string
      property scheduleId: string = ""
      command assign(scheduleId: string) {
        mutate scheduleId = scheduleId
        emit ScheduleShiftCreated { scheduleId: self.scheduleId }
      }
      store in memory
    }
    event ScheduleShiftCreated: "scheduleShift.created" {}

    entity Station {
      property required id: string
      property currentTaskCount: number = 0
      command syncTaskCount(currentTaskCount: number) { mutate currentTaskCount = currentTaskCount }
      store in memory
    }
    entity PrepTask {
      property required id: string
      property stationId: string = ""
      property status: string = "pending"
      command claim(stationId: string) {
        mutate stationId = stationId
        mutate status = "in_progress"
        emit PrepTaskClaimed { stationId: self.stationId }
      }
      store in memory
    }
    event PrepTaskClaimed: "prepTask.claimed" {}

    // (1) schedule-shift-count — single FK predicate.
    on ScheduleShiftCreated run Schedule.syncShiftCount
      resolve self.scheduleId
      params { shiftCount: count(ScheduleShift where scheduleId == self.scheduleId) }

    // (2) prep-task-station-count — FK predicate AND a status filter.
    on PrepTaskClaimed run Station.syncTaskCount
      resolve self.stationId
      params { currentTaskCount: count(PrepTask where stationId == self.stationId, status == "in_progress") }
  `;

  it('represents both count cases as reactions (no hand middleware)', async () => {
    const { ir, diagnostics } = await compileToIR(source());
    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const reactions = ir!.reactions ?? [];
    expect(reactions).toHaveLength(2);

    const shift = reactions.find(r => r.targetCommand === 'syncShiftCount')!;
    expect(shift.params?.[0].expression).toMatchObject({ kind: 'aggregate', op: 'count', entity: 'ScheduleShift' });
    expect(shift.params?.[0].expression).toMatchObject({ predicates: [{ field: 'scheduleId' }] });

    const task = reactions.find(r => r.targetCommand === 'syncTaskCount')!;
    expect(task.params?.[0].expression).toMatchObject({ kind: 'aggregate', op: 'count', entity: 'PrepTask' });
    expect(task.params?.[0].expression).toMatchObject({
      predicates: [{ field: 'stationId' }, { field: 'status' }],
    });
  });

  it('recomputes both parent counts from child events at runtime', async () => {
    const { ir, diagnostics } = await compileToIR(source());
    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const engine = new RuntimeEngine(ir!, {}, { now: () => 1000, generateId: () => 'gen-id' });

    await engine.createInstance('Schedule', { id: 'sched-1', shiftCount: 0 } as EntityInstance);
    await engine.createInstance('ScheduleShift', { id: 'sh-1', scheduleId: '' } as EntityInstance);
    await engine.createInstance('ScheduleShift', { id: 'sh-2', scheduleId: '' } as EntityInstance);
    await engine.createInstance('Station', { id: 'st-1', currentTaskCount: 0 } as EntityInstance);
    await engine.createInstance('PrepTask', { id: 'pt-1', stationId: '', status: 'pending' } as EntityInstance);
    await engine.createInstance('PrepTask', { id: 'pt-2', stationId: '', status: 'pending' } as EntityInstance);

    await engine.runCommand('assign', { scheduleId: 'sched-1' }, { entityName: 'ScheduleShift', instanceId: 'sh-1' });
    await engine.runCommand('assign', { scheduleId: 'sched-1' }, { entityName: 'ScheduleShift', instanceId: 'sh-2' });
    await engine.runCommand('claim', { stationId: 'st-1' }, { entityName: 'PrepTask', instanceId: 'pt-1' });
    await engine.runCommand('claim', { stationId: 'st-1' }, { entityName: 'PrepTask', instanceId: 'pt-2' });

    const schedules = await engine.getAllInstances('Schedule') as EntityInstance[];
    const stations = await engine.getAllInstances('Station') as EntityInstance[];
    expect(schedules.find(s => s.id === 'sched-1')?.shiftCount).toBe(2);       // schedule-shift-count
    expect(stations.find(s => s.id === 'st-1')?.currentTaskCount).toBe(2);     // prep-task-station-count
  });
});
