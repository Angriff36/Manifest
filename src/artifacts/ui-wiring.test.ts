import { isValidElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { APP_TABS, renderCenterPanel } from '../App';
import {
  BUILTIN_TUTORIALS,
  FlameGraphPanel,
  PolicyMatrixPanel,
  TutorialPanel,
  validateTutorialJson,
} from './index';
import { buildProfilerCommandOptions } from './FlameGraphPanel';

describe('diagnostic UI wiring', () => {
  it('exposes tutorial, policy matrix, and profiler tabs in the app', () => {
    expect(APP_TABS.map((tab) => tab.id)).toEqual(
      expect.arrayContaining(['tutorial', 'policies', 'profiler'])
    );
  });

  it('routes the new tabs to live components with the expected props', () => {
    const onSourceChange = vi.fn();
    const baseProps = {
      output: 'client output',
      serverCode: 'server output',
      testCode: 'test output',
      ast: null,
      source: 'entity Task {}',
      hasErrors: false,
      onSourceChange,
    };

    const tutorial = renderCenterPanel('tutorial', baseProps);
    expect(isValidElement(tutorial)).toBe(true);
    expect(tutorial.type).toBe(TutorialPanel);
    expect(tutorial.props.source).toBe(baseProps.source);
    expect(tutorial.props.onSourceChange).toBe(onSourceChange);

    const policies = renderCenterPanel('policies', baseProps);
    expect(isValidElement(policies)).toBe(true);
    expect(policies.type).toBe(PolicyMatrixPanel);
    expect(policies.props.source).toBe(baseProps.source);
    expect(policies.props.disabled).toBe(false);

    const profiler = renderCenterPanel('profiler', {
      ...baseProps,
      hasErrors: true,
    });
    expect(isValidElement(profiler)).toBe(true);
    expect(profiler.type).toBe(FlameGraphPanel);
    expect(profiler.props.disabled).toBe(true);
  });

  it('exports the reachable tutorial and artifact helpers', () => {
    expect(TutorialPanel).toBeTypeOf('function');
    expect(PolicyMatrixPanel).toBeTypeOf('function');
    expect(FlameGraphPanel).toBeTypeOf('function');
    expect(BUILTIN_TUTORIALS.length).toBeGreaterThan(0);
    expect(validateTutorialJson(BUILTIN_TUTORIALS[0]).valid).toBe(true);
  });

  it('derives profiler actions from compiled commands instead of a hardcoded fallback', () => {
    const commands = buildProfilerCommandOptions({
      commands: [
        { name: 'claim', entity: 'PrepTask' },
        { name: 'complete', entity: 'PrepTask' },
        { name: 'rebuildCache' },
      ],
    });

    expect(commands).toEqual([
      { commandName: 'claim', entityName: 'PrepTask', label: 'PrepTask.claim' },
      {
        commandName: 'complete',
        entityName: 'PrepTask',
        label: 'PrepTask.complete',
      },
      {
        commandName: 'rebuildCache',
        entityName: undefined,
        label: 'rebuildCache',
      },
    ]);
  });
});
