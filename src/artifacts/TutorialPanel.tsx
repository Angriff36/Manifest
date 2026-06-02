/**
 * Interactive Tutorial Panel
 *
 * A guided walkthrough UI that helps new users learn Manifest
 * step by step with inline hints, validation feedback, and
 * progressive disclosure of language features.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Eye,
  EyeOff,
  Sparkles,
  Clock,
  Tag,
  BookOpen,
  Trophy,
  Play,
  Lock,
  AlertTriangle,
} from 'lucide-react';
import { BUILTIN_TUTORIALS } from './tutorials/builtin';
import {
  validateStep,
  getNextStep,
  getProgressPercent,
} from './tutorials/engine';
import type {
  Tutorial,
  TutorialStep,
  TutorialProgress,
  ValidationResult,
  CheckResult,
} from './tutorials/types';

const STORAGE_KEY = 'manifest-tutorial-progress';

function loadProgress(): TutorialProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {
    completedSteps: {},
    completedTutorials: {},
    activeTutorialId: null,
  };
}

function saveProgress(progress: TutorialProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // ignore
  }
}

interface TutorialPanelProps {
  /** Current source code in the editor (synced both ways) */
  source: string;
  /** Called when tutorial step requires loading code into editor */
  onSourceChange: (source: string) => void;
}

export function TutorialPanel({ source, onSourceChange }: TutorialPanelProps) {
  const [tutorials] = useState<Tutorial[]>(BUILTIN_TUTORIALS);
  const [progress, setProgress] = useState<TutorialProgress>(loadProgress);
  const [activeTutorialId, setActiveTutorialId] = useState<string | null>(
    progress.activeTutorialId
  );
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [failureCount, setFailureCount] = useState(0);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [tutorialListOpen, setTutorialListOpen] = useState(true);

  // Persist progress
  useEffect(() => {
    saveProgress({ ...progress, activeTutorialId: activeTutorialId });
  }, [progress, activeTutorialId]);

  // Get active tutorial
  const activeTutorial = useMemo(
    () => tutorials.find((t) => t.id === activeTutorialId) || null,
    [tutorials, activeTutorialId]
  );

  // Get current step
  const activeStep = useMemo<TutorialStep | null>(() => {
    if (!activeTutorial) return null;
    return (
      activeTutorial.steps.find((s) => s.id === activeStepId) ||
      getNextStep(activeTutorial, progress.completedSteps[activeTutorial.id] || [])
    );
  }, [activeTutorial, activeStepId, progress]);

  // Get completed steps for active tutorial
  const completedStepsForActive = useMemo(() => {
    if (!activeTutorial) return [];
    return progress.completedSteps[activeTutorial.id] || [];
  }, [progress, activeTutorial]);

  // Validate source against current step
  useEffect(() => {
    if (!activeStep) {
      setValidation(null);
      return;
    }
    let cancelled = false;
    validateStep(activeStep, source).then((result) => {
      if (cancelled) return;
      setValidation(result);
      if (!result.passed) {
        setFailureCount((c) => c + 1);
      } else {
        setFailureCount(0);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [source, activeStep]);

  // Mark step as complete when validation passes
  useEffect(() => {
    if (!activeTutorial || !activeStep || !validation) return;
    // Guard against race condition: only mark complete if validation is for the current step
    if (validation.stepId !== activeStep.id) return;
    if (validation.passed && !completedStepsForActive.includes(activeStep.id)) {
      setProgress((prev) => {
        const updated = { ...prev };
        const existing = updated.completedSteps[activeTutorial.id] || [];
        updated.completedSteps = {
          ...updated.completedSteps,
          [activeTutorial.id]: [...existing, activeStep.id],
        };
        // Check if all steps done
        if (updated.completedSteps[activeTutorial.id].length === activeTutorial.steps.length) {
          updated.completedTutorials = {
            ...updated.completedTutorials,
            [activeTutorial.id]: true,
          };
        }
        return updated;
      });
    }
  }, [validation, activeStep, activeTutorial, completedStepsForActive]);

  // Select tutorial
  const selectTutorial = useCallback(
    (tutorialId: string) => {
      setActiveTutorialId(tutorialId);
      setActiveStepId(null);
      setShowAnswer(false);
      setHintsRevealed(0);
      setFailureCount(0);
      setTutorialListOpen(false);
    },
    []
  );

  // Load step code into editor
  const loadStarterCode = useCallback(() => {
    if (activeStep) {
      onSourceChange(activeStep.starterCode);
      setShowAnswer(false);
      setHintsRevealed(0);
      setFailureCount(0);
    }
  }, [activeStep, onSourceChange]);

  // Reveal next hint
  const revealHint = useCallback(() => {
    setHintsRevealed((n) => n + 1);
  }, []);

  // Load expected code
  const revealAnswer = useCallback(() => {
    if (activeStep) {
      onSourceChange(activeStep.expectedCode);
      setShowAnswer(true);
    }
  }, [activeStep, onSourceChange]);

  // Go to next step
  const goToNextStep = useCallback(() => {
    if (!activeTutorial) return;
    const currentIdx = activeTutorial.steps.findIndex((s) => s.id === activeStep?.id);
    if (currentIdx < activeTutorial.steps.length - 1) {
      const nextStep = activeTutorial.steps[currentIdx + 1];
      setActiveStepId(nextStep.id);
      onSourceChange(nextStep.starterCode);
      setShowAnswer(false);
      setHintsRevealed(0);
      setFailureCount(0);
    }
  }, [activeTutorial, activeStep, onSourceChange]);

  // Go to previous step
  const goToPrevStep = useCallback(() => {
    if (!activeTutorial || !activeStep) return;
    const currentIdx = activeTutorial.steps.findIndex((s) => s.id === activeStep.id);
    if (currentIdx > 0) {
      const prevStep = activeTutorial.steps[currentIdx - 1];
      setActiveStepId(prevStep.id);
      onSourceChange(prevStep.starterCode);
      setShowAnswer(false);
      setHintsRevealed(0);
      setFailureCount(0);
    }
  }, [activeTutorial, activeStep, onSourceChange]);

  // Show tutorial list view
  if (!activeTutorial || tutorialListOpen) {
    return (
      <div className="h-full overflow-auto p-4 bg-gray-950">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-sky-500 to-cyan-400 rounded-xl flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Interactive Tutorials</h2>
              <p className="text-xs text-gray-500">Learn Manifest step by step</p>
            </div>
          </div>
          <div className="space-y-3">
            {tutorials.map((tutorial) => {
              const completed = progress.completedTutorials[tutorial.id] || false;
              const stepCount = progress.completedSteps[tutorial.id]?.length || 0;
              const percent = getProgressPercent(tutorial, progress.completedSteps[tutorial.id] || []);
              const prereqsMet = !tutorial.prerequisites ||
                tutorial.prerequisites.every((p) => progress.completedTutorials[p]);
              return (
                <button
                  key={tutorial.id}
                  onClick={() => prereqsMet && selectTutorial(tutorial.id)}
                  disabled={!prereqsMet}
                  className={`w-full text-left p-4 rounded-lg border transition-colors ${
                    prereqsMet
                      ? 'bg-gray-800/50 border-gray-700 hover:border-sky-500 hover:bg-gray-800'
                      : 'bg-gray-900/50 border-gray-800 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {completed ? (
                          <Trophy className="w-4 h-4 text-amber-400" />
                        ) : !prereqsMet ? (
                          <Lock className="w-4 h-4 text-gray-500" />
                        ) : (
                          <Play className="w-4 h-4 text-sky-400" />
                        )}
                        <h3 className="font-semibold text-white">{tutorial.title}</h3>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">{tutorial.description}</p>
                      <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {tutorial.estimatedMinutes} min
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          tutorial.difficulty === 'beginner'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : tutorial.difficulty === 'intermediate'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          {tutorial.difficulty}
                        </span>
                        {tutorial.tags.map((tag) => (
                          <span key={tag} className="flex items-center gap-1">
                            <Tag className="w-3 h-3" />{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    {stepCount > 0 && (
                      <div className="text-right">
                        <div className="text-sm font-medium text-sky-400">{percent}%</div>
                        <div className="text-xs text-gray-500">{stepCount}/{tutorial.steps.length} steps</div>
                      </div>
                    )}
                  </div>
                  {stepCount > 0 && (
                    <div className="mt-3 w-full bg-gray-700 rounded-full h-1.5">
                      <div
                        className="bg-sky-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Active tutorial step view
  if (!activeStep) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-white">Tutorial Complete!</h3>
          <p className="text-sm text-gray-400 mt-1">You've finished all steps in this tutorial.</p>
          <button
            onClick={() => setTutorialListOpen(true)}
            className="mt-4 px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg text-sm text-white"
          >
            Browse More Tutorials
          </button>
        </div>
      </div>
    );
  }

  const stepIndex = activeTutorial.steps.findIndex((s) => s.id === activeStep.id);
  const totalSteps = activeTutorial.steps.length;
  const isStepCompleted = completedStepsForActive.includes(activeStep.id);
  const isLastStep = stepIndex === totalSteps - 1;

  // Determine which hints to show based on failure count
  const visibleHints = activeStep.hints.filter((h) => {
    if (h.final) return failureCount >= 3;
    if (h.afterFailures !== undefined) return failureCount >= h.afterFailures;
    return true;
  });

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-800 bg-gray-900/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setTutorialListOpen(true)}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-white"
          >
            <ChevronLeft className="w-4 h-4" />
            All Tutorials
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              Step {stepIndex + 1} of {totalSteps}
            </span>
          </div>
        </div>
        <h3 className="text-base font-semibold text-white mt-2">{activeTutorial.title}</h3>
        {/* Progress bar */}
        <div className="mt-2 w-full bg-gray-800 rounded-full h-1.5">
          <div
            className="bg-sky-500 h-1.5 rounded-full transition-all"
            style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Step Title */}
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
            isStepCompleted
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-sky-500/20 text-sky-400'
          }`}>
            {isStepCompleted ? <CheckCircle2 className="w-4 h-4" /> : stepIndex + 1}
          </div>
          <div className="flex-1">
            <h4 className="text-lg font-semibold text-white">{activeStep.title}</h4>
            <p className="text-sm text-gray-300 mt-1 whitespace-pre-wrap leading-relaxed">
              {activeStep.instruction}
            </p>
          </div>
        </div>

        {/* Unlocks notice (progressive disclosure) */}
        {activeStep.unlocks && activeStep.unlocks.length > 0 && isStepCompleted && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
              <Sparkles className="w-4 h-4" />
              New concepts unlocked:
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {activeStep.unlocks.map((u) => (
                <span key={u} className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded text-xs">
                  {u}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Hints */}
        {visibleHints.length > 0 && hintsRevealed > 0 && (
          <div className="p-3 bg-sky-500/10 border border-sky-500/30 rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-sky-400 text-sm font-medium">
              <Lightbulb className="w-4 h-4" />
              Hint {Math.min(hintsRevealed, visibleHints.length)} of {visibleHints.length}
            </div>
            {visibleHints.slice(0, hintsRevealed).map((hint, i) => (
              <div key={i} className="text-sm text-gray-300 whitespace-pre-wrap pl-6 border-l-2 border-sky-500/30 ml-1">
                {hint.text}
              </div>
            ))}
          </div>
        )}

        {/* Validation Status */}
        {validation && (
          <ValidationStatus validation={validation} />
        )}

        {/* Answer preview */}
        {showAnswer && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium mb-2">
              <CheckCircle2 className="w-4 h-4" />
              Expected solution:
            </div>
            <pre className="p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto font-mono whitespace-pre-wrap">
{activeStep.expectedCode}
            </pre>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex-shrink-0 border-t border-gray-800 bg-gray-900/50 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={loadStarterCode}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded"
              title="Reset to starter code"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
            {visibleHints.length > hintsRevealed && (
              <button
                onClick={revealHint}
                className="flex items-center gap-1 px-2 py-1.5 text-xs text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 rounded"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                Hint
              </button>
            )}
            <button
              onClick={() => (showAnswer ? setShowAnswer(false) : revealAnswer())}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded"
            >
              {showAnswer ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showAnswer ? 'Hide' : 'Answer'}
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={goToPrevStep}
              disabled={stepIndex === 0}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-gray-800 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Back
            </button>
            <button
              onClick={goToNextStep}
              disabled={!isStepCompleted || isLastStep}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-sky-600 hover:bg-sky-500 text-white rounded disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-gray-700"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Validation status display with individual check results */
function ValidationStatus({ validation }: { validation: ValidationResult }) {
  if (validation.passed) {
    return (
      <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
        <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
          <CheckCircle2 className="w-4 h-4" />
          {validation.message}
        </div>
      </div>
    );
  }

  if (validation.compileError) {
    return (
      <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg">
        <div className="flex items-center gap-2 text-rose-400 text-sm font-medium">
          <XCircle className="w-4 h-4" />
          {validation.message}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg space-y-2">
      <div className="flex items-center gap-2 text-gray-400 text-sm font-medium">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        {validation.message}
      </div>
      <div className="space-y-1">
        {validation.checks.map((check, i) => (
          <CheckItem key={i} check={check} />
        ))}
      </div>
    </div>
  );
}

function CheckItem({ check }: { check: CheckResult }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {check.passed ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
      ) : (
        <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
      )}
      <div>
        <span className={check.passed ? 'text-gray-400' : 'text-gray-300'}>
          {check.description}
        </span>
        {check.detail && !check.passed && (
          <div className="text-xs text-rose-400/80 mt-0.5">{check.detail}</div>
        )}
      </div>
    </div>
  );
}
