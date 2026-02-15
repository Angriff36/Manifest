// Auto-generated client SDK from Manifest IR
// DO NOT EDIT - This file is generated from .manifest source

export async function getCounters(): Promise<Counter[]> {
  const response = await fetch(`/api/counter`);
  if (!response.ok) {
    throw new Error("Failed to fetch Counters");
  }
  const data = await response.json();
  return data.counters;
}

export async function getTimers(): Promise<Timer[]> {
  const response = await fetch(`/api/timer`);
  if (!response.ok) {
    throw new Error("Failed to fetch Timers");
  }
  const data = await response.json();
  return data.timers;
}

export async function getLoggers(): Promise<Logger[]> {
  const response = await fetch(`/api/logger`);
  if (!response.ok) {
    throw new Error("Failed to fetch Loggers");
  }
  const data = await response.json();
  return data.loggers;
}
