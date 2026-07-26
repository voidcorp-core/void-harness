import { computeProjectState, type ProjectState } from './project-state.js';
import { inspectMission } from './store.js';

export async function inspectCurrentMission(
  root: string,
  missionId: string,
  secrets: readonly string[],
): Promise<{
  readonly inspected: Awaited<ReturnType<typeof inspectMission>>;
  readonly project: ProjectState;
}> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = await computeProjectState(root);
    const inspected = await inspectMission(
      root,
      missionId,
      { dependencies: { 'git:working-tree': before.diffHash } },
      { secrets },
    );
    const after = await computeProjectState(root);
    if (before.diffHash === after.diffHash) {
      return { inspected, project: after };
    }
  }
  throw new Error(
    'MISSION_PROJECT_CHANGED_DURING_INSPECT: retry after concurrent writes settle',
  );
}
