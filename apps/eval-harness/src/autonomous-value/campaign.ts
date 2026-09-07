import type { AutonomousValueCell, AutonomousValueManifest } from '../types.js';
import {
  type PilotScheduleOptions,
  runPilotSchedule,
} from './consumer.js';
import {
  createPilotReport,
  createPilotSchedule,
  type PilotExecution,
  type PilotObservation,
  type PilotReport,
  type PilotResult,
} from './pilot.js';

export interface PilotCampaignCellRunInput {
  readonly execution: PilotExecution;
  readonly cell: AutonomousValueCell;
}

export type PilotCampaignCellRun = (
  input: PilotCampaignCellRunInput,
) => Promise<PilotResult>;

export interface PilotCampaignResult {
  readonly schedule: readonly PilotExecution[];
  readonly observations: readonly PilotObservation[];
  readonly report: PilotReport;
}

/**
 * Run the versioned campaign path from schedule creation through report
 * materialization. Runtime adapters return a PilotResult; this boundary owns
 * the stable cell identity and turns every thrown adapter failure into unknown.
 */
export async function runAutonomousValuePilot(
  manifest: AutonomousValueManifest,
  runCell: PilotCampaignCellRun,
  options: PilotScheduleOptions = {},
): Promise<PilotCampaignResult> {
  const schedule = createPilotSchedule(manifest);
  const observations = await runPilotSchedule(
    schedule,
    async ({ execution }) => {
      const cell = manifest.cells[execution.cellId];
      if (cell === undefined) {
        return {
          executionId: execution.executionId,
          result: { status: 'unknown', reason: 'manifest cell is missing' },
        };
      }
      try {
        return {
          executionId: execution.executionId,
          result: await runCell({ execution, cell }),
        };
      } catch {
        return {
          executionId: execution.executionId,
          result: { status: 'unknown', reason: 'pilot cell adapter failed' },
        };
      }
    },
    options,
  );
  return {
    schedule,
    observations,
    report: createPilotReport(schedule, observations),
  };
}
