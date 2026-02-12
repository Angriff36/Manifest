import { adapter } from '../adapters/manifest-core.js';
import { hashIR } from './output-formatter.js';
import { validateScript } from './validator.js';
const HARNESS_VERSION = '1.0.0';
function checkAssertions(expect, result) {
    const details = [];
    details.push({
        check: 'success',
        expected: expect.success,
        actual: result.success,
        passed: expect.success === result.success,
    });
    if (expect.error) {
        if (expect.error.type) {
            details.push({
                check: 'error.type',
                expected: expect.error.type,
                actual: result.error?.type ?? null,
                passed: expect.error.type === result.error?.type,
            });
        }
        if (expect.error.guardIndex !== undefined) {
            const actualGuardIndex = result.guardFailures?.[0]?.guardIndex ?? null;
            details.push({
                check: 'error.guardIndex',
                expected: expect.error.guardIndex,
                actual: actualGuardIndex,
                passed: expect.error.guardIndex === actualGuardIndex,
            });
        }
        if (expect.error.message) {
            const actualMessage = result.error?.message ?? '';
            details.push({
                check: 'error.message',
                expected: expect.error.message,
                actual: actualMessage,
                passed: actualMessage.includes(expect.error.message),
            });
        }
    }
    if (expect.stateAfter && result.entityStateAfter) {
        for (const [key, value] of Object.entries(expect.stateAfter)) {
            details.push({
                check: `stateAfter.${key}`,
                expected: value,
                actual: result.entityStateAfter[key],
                passed: JSON.stringify(value) === JSON.stringify(result.entityStateAfter[key]),
            });
        }
    }
    if (expect.emittedEvents) {
        const actualEvents = result.emittedEvents.map((e) => e.name);
        details.push({
            check: 'emittedEvents',
            expected: expect.emittedEvents,
            actual: actualEvents,
            passed: JSON.stringify(expect.emittedEvents) === JSON.stringify(actualEvents),
        });
    }
    if (expect.constraintWarnings) {
        details.push({
            check: 'constraintWarnings',
            expected: expect.constraintWarnings,
            actual: result.constraintWarnings,
            passed: JSON.stringify(expect.constraintWarnings) === JSON.stringify(result.constraintWarnings),
        });
    }
    const passed = details.filter((d) => d.passed).length;
    const failed = details.filter((d) => !d.passed).length;
    return { passed, failed, details };
}
export async function runScript(options) {
    const validation = validateScript(options.script);
    if (!validation.valid) {
        throw new Error(`Invalid script: ${validation.errors.join('; ')}`);
    }
    let ir;
    let sourceType;
    if (options.irSource) {
        ir = options.irSource;
        sourceType = 'ir';
    }
    else if (options.manifestSource) {
        const result = await adapter.compile(options.manifestSource);
        if (!result.ir) {
            throw new Error(`Compilation failed: ${result.diagnostics.map((d) => d.message).join('; ')}`);
        }
        ir = result.ir;
        sourceType = 'manifest';
    }
    else {
        throw new Error('Either irSource or manifestSource must be provided');
    }
    const runtime = adapter.createRuntime(ir);
    const script = options.script;
    const context = script.context ?? {};
    if (script.seedEntities) {
        for (const seed of script.seedEntities) {
            runtime.seedEntity(seed.entity, seed.id, seed.properties);
        }
    }
    const steps = [];
    for (const cmd of script.commands) {
        const result = runtime.executeCommand(cmd.entity, cmd.id, cmd.command, cmd.params ?? {}, context);
        const assertions = checkAssertions(cmd.expect, result);
        steps.push({
            step: cmd.step,
            command: {
                entity: cmd.entity,
                id: cmd.id,
                name: cmd.command,
                params: cmd.params ?? {},
            },
            result,
            assertions,
        });
    }
    const totalSteps = steps.length;
    const passedSteps = steps.filter((s) => s.assertions.failed === 0).length;
    const failedSteps = totalSteps - passedSteps;
    const assertionsPassed = steps.reduce((sum, s) => sum + s.assertions.passed, 0);
    const assertionsFailed = steps.reduce((sum, s) => sum + s.assertions.failed, 0);
    const output = {
        harness: {
            version: HARNESS_VERSION,
            executedAt: options.timestamp ?? new Date().toISOString(),
        },
        source: {
            type: sourceType,
            path: options.sourcePath ?? '<inline>',
            irHash: hashIR(ir),
        },
        script: {
            path: options.scriptPath ?? '<inline>',
            description: script.description,
        },
        execution: {
            context,
            steps,
        },
        summary: {
            totalSteps,
            passed: passedSteps,
            failed: failedSteps,
            assertionsPassed,
            assertionsFailed,
        },
    };
    return output;
}
//# sourceMappingURL=executor.js.map