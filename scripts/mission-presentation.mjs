#!/usr/bin/env node
// Local presentation only. The caller owns runtime execution and serializes updates per mission.
import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const colors = { orchestrator: '#A855F7', worker: '#3B82F6', review: '#06B6D4' };
const titles = { orchestrator: 'ORCH', worker: 'WORK', review: 'REVIEW' };
const roles = { ORCH: 'orchestrator', WORK: 'worker', REVIEW: 'review' };

async function cmux(args) {
  const { stdout } = await execute('cmux', args, { timeout: 5000, maxBuffer: 1024 * 1024 });
  return decodeCmuxResponse(args, stdout);
}
export function decodeCmuxResponse(args, stdout) {
  return args[1] === 'tree' ? JSON.parse(stdout) : stdout;
}
function identifier(value, name) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(value)) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}
function workspaces(tree) {
  if (!Array.isArray(tree.windows)) throw new Error('Unsupported cmux tree response');
  return tree.windows.flatMap(window => window.workspaces);
}
function surfaces(workspace) { return workspace.panes.flatMap(pane => pane.surfaces); }
function bindings(workspace) {
  const result = surfaces(workspace).map(surface => {
    const match = /^(ORCH|WORK|REVIEW) \| ([A-Za-z0-9._-]+)$/.exec(surface.title);
    if (!match || surface.type !== 'terminal') throw new Error('Unregistered surface: reconcile workspace before continuing');
    return { id: match[2], role: roles[match[1]], surface: surface.ref };
  });
  if (new Set(result.map(item => item.id)).size !== result.length) throw new Error('Ambiguous surface identity');
  if (result.filter(item => item.role === 'orchestrator').length !== 1) throw new Error('Missing or ambiguous orchestrator');
  return result;
}

/** Infrastructure seam: run accepts cmux argument arrays and returns parsed JSON. */
export async function presentMission(request, run = cmux) {
  const project = await realpath(request.project);
  const mission = identifier(request.mission, 'mission');
  const action = request.action ?? 'ensure';
  const adapter = request.adapter ?? 'auto';
  if (!['ensure', 'worker', 'status'].includes(action)) throw new Error('Unknown presentation action');
  if (!['auto', 'cmux', 'text'].includes(adapter)) throw new Error('Unknown presentation adapter');
  if (action !== 'ensure') identifier(request.id, 'agent id');
  if (action === 'worker' && (!['worker', 'review'].includes(request.role ?? 'worker') || request.id === 'orchestrator')) throw new Error('Invalid worker role or identity');
  if (action === 'status' && (typeof request.state !== 'string' || !request.state.trim() || request.state.length > 160 || /[\r\n\x00-\x1f]/.test(request.state))) throw new Error('Invalid display state');
  if (request.overview && (action !== 'status' || !['worker', 'review'].includes(request.role))) throw new Error('Invalid overview role or action');
  const text = () => ({ adapter: 'text', project, mission, action, overview: request.overview ?? false, id: request.id, role: request.role, state: request.state, panes: false, execution: 'caller-owned' });
  if (adapter === 'text') return text();
  const call = (...args) => run(['--json', ...args]);
  let tree;
  try { tree = await call('tree', '--all'); }
  catch (error) {
    if (adapter === 'auto' && error.code === 'ENOENT') return text();
    throw error;
  }
  const owner = JSON.stringify({ owner: 'void-mission-presentation-v1', project, mission });
  const find = value => {
    const matches = workspaces(value).filter(workspace => workspace.description === owner);
    if (matches.length > 1) throw new Error('Ambiguous mission workspace');
    return matches[0];
  };
  let workspace = find(tree);
  const rename = (surface, id, role) => call('rename-tab', '--workspace', workspace.ref, '--surface', surface, `${titles[role]} | ${id}`);
  if (!workspace) {
    if (action !== 'ensure') throw new Error('Ensure the mission workspace first');
    await call('new-workspace', '--name', `${basename(project)} | ${mission}`, '--description', owner, '--cwd', project, '--focus', 'false');
    workspace = find(await call('tree', '--all'));
    if (!workspace || surfaces(workspace).length !== 1) throw new Error('Workspace creation needs reconciliation');
    await rename(surfaces(workspace)[0].ref, 'orchestrator', 'orchestrator');
    workspace = find(await call('tree', '--all'));
    await call('set-status', 'void-orchestrator', 'orchestrator | terminal prepared; runtime not launched', '--workspace', workspace.ref, '--color', colors.orchestrator);
  }
  let agents = bindings(workspace);
  const status = (agent, state) => call('set-status', `void-${agent.id}`, `${agent.role} | ${state}`, '--workspace', workspace.ref, '--color', colors[agent.role]);
  if (action === 'worker') {
    const id = identifier(request.id, 'agent id');
    const role = request.role ?? 'worker';
    const existing = agents.find(agent => agent.id === id);
    if (existing && existing.role !== role) throw new Error('Agent role collision');
    if (!existing) {
      if (!request.createSurface) throw new Error('Pass --create-surface explicitly to prepare a terminal');
      const workers = agents.filter(agent => agent.role !== 'orchestrator');
      if (workers.length >= 3) throw new Error('At most three worker terminals');
      const anchor = workers.at(-1) ?? agents.find(agent => agent.role === 'orchestrator');
      await call('new-split', workers.length ? 'down' : 'right', '--workspace', workspace.ref, '--surface', anchor.surface, '--focus', 'false');
      const refreshed = find(await call('tree', '--all'));
      const added = surfaces(refreshed).filter(surface => !agents.some(agent => agent.surface === surface.ref));
      if (added.length !== 1) throw new Error('Split creation needs reconciliation');
      await rename(added[0].ref, id, role);
      workspace = find(await call('tree', '--all'));
      agents = bindings(workspace);
      await status(agents.find(agent => agent.id === id), 'terminal prepared; runtime not launched');
    }
  } else if (action === 'status') {
    const bound = agents.find(item => item.id === request.id);
    if (request.overview && bound) throw new Error('Overview identity collision with terminal');
    const agent = request.overview ? { id: request.id, role: request.role } : bound;
    if (!agent) throw new Error('Unknown agent identity');
    await status(agent, request.state);
  }
  return { adapter: 'cmux', project, mission, workspace: workspace.ref, agents, ...(request.overview ? { overview: true, id: request.id, role: request.role, state: request.state } : {}), execution: 'caller-owned' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [action, ...args] = process.argv.slice(2);
  const options = { action };
  if (action === '--help' || action === 'help') {
    process.stdout.write('Usage: node scripts/mission-presentation.mjs <ensure|worker|status> --project <path> --mission <id> [--adapter auto|cmux|text]\nworker: --id <native-agent-id> [--role worker|review] --create-surface\nstatus: --id <agent-id|orchestrator> --state <display-text> [--overview --role worker|review]\nPresentation only: caller launches runtimes and serializes updates. No agent is launched by this command.\n');
  } else try {
    for (let index = 0; index < args.length; index++) {
      const flag = args[index];
      if (flag === '--overview') { options.overview = true; continue; }
      if (flag === '--create-surface') { options.createSurface = true; continue; }
      if (!['--project', '--mission', '--adapter', '--id', '--role', '--state'].includes(flag) || !args[index + 1]) throw new Error(`Invalid option ${flag}`);
      options[flag.slice(2)] = args[++index];
    }
    process.stdout.write(`${JSON.stringify(await presentMission(options))}\n`);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
