import { getState, setState } from '../runtimeState.js';

/**
 * Stops the run in progress, and leaves the plan alone.
 *
 * Clearing `lastPlan` here raced the handler still executing it: by the time the
 * run reported what it had managed to apply, the plan describing the rest was
 * already gone. Plan lifecycle belongs to the execute handler, which clears it
 * when the run finishes.
 *
 * Nothing needs to be rewound. A mode is recorded only once its value has
 * actually landed, so re-planning *is* the resume — the next plan contains
 * exactly what this run did not finish.
 */
export async function CANCEL_OPERATION(): Promise<void> {
  getState().activeOperation?.abort();
  setState({ activeOperation: null });
}
