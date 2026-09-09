import { expect, test } from 'vitest';
import { presentMission } from '../../scripts/mission-presentation.mjs';

function terminal() {
  const workspaces: {ref:string;description:string;panes:{surfaces:{ref:string;title:string;type:string}[]}[]}[] = [];
  const splits: string[] = [];
  const run = async (args: string[]) => {
    const command = args[1];
    const value = (key: string) => args[args.indexOf(key)+1];
    if(command === 'tree') return {windows:[{workspaces}]};
    if(command === 'new-workspace') workspaces.push({ref:'workspace:1',description:value('--description'),panes:[{surfaces:[{ref:'surface:1',title:'shell',type:'terminal'}]}]});
    if(command === 'new-split') {splits.push(args[2]);workspaces[0].panes.push({surfaces:[{ref:`surface:${workspaces[0].panes.length+1}`,title:'shell',type:'terminal'}]});}
    if(command === 'rename-tab') {
      const surface = workspaces[0].panes.flatMap(p=>p.surfaces).find(s=>s.ref===value('--surface'));
      if(surface) surface.title=args.at(-1) ?? '';
    }
    return {};
  };
  return {run,workspaces,splits};
}
const request = {project:process.cwd(),mission:'DEV-832',action:'ensure',adapter:'cmux'};

test('reuses one mission workspace and stacks three workers beside its orchestrator',async()=>{
 const boundary=terminal();
 const first=await presentMission(request,boundary.run);
 expect(await presentMission(request,boundary.run)).toEqual(first);
 for(const id of ['a','b','c']) await presentMission({...request,action:'worker',id,createSurface:true},boundary.run);
 await presentMission({...request,action:'worker',id:'b',createSurface:true},boundary.run);
 expect(boundary.workspaces).toHaveLength(1);
 expect(boundary.splits).toEqual(['right','down','down']);
 expect(boundary.workspaces[0].panes.flatMap(p=>p.surfaces).map(s=>s.title)).toEqual(['ORCH | orchestrator','WORK | a','WORK | b','WORK | c']);
 await expect(presentMission({...request,action:'worker',id:'d',createSurface:true},boundary.run)).rejects.toThrow('three');
});

test('refuses ambiguous identities and foreign surfaces without adding terminals',async()=>{
 const boundary=terminal();
 await presentMission(request,boundary.run);
 boundary.workspaces.push(boundary.workspaces[0]);
 await expect(presentMission(request,boundary.run)).rejects.toThrow('Ambiguous');
 boundary.workspaces.pop();
 boundary.workspaces[0].panes[0].surfaces.push({ref:'surface:99',title:'user work',type:'terminal'});
 await expect(presentMission({...request,action:'worker',id:'a',createSurface:true},boundary.run)).rejects.toThrow('Unregistered');
 expect(boundary.splits).toEqual([]);
});

test('falls back only for absent cmux and never executes a terminal command in text mode',async()=>{
 let calls=0;
 const absent=async()=>{calls++;throw Object.assign(new Error('missing'),{code:'ENOENT'});};
 expect((await presentMission({...request,adapter:'text'},absent)).adapter).toBe('text');
 expect(calls).toBe(0);
 expect((await presentMission({...request,adapter:'auto'},absent)).adapter).toBe('text');
 expect(calls).toBe(1);
 await expect(presentMission({...request,adapter:'auto'},async()=>{throw new Error('socket denied');})).rejects.toThrow('socket denied');
});

test('requires explicit surface creation and propagates failed splits',async()=>{
 const boundary=terminal();
 await presentMission(request,boundary.run);
 await expect(presentMission({...request,action:'worker',id:'a'},boundary.run)).rejects.toThrow('create-surface');
 await expect(presentMission({...request,action:'worker',id:'a',createSurface:true},async(args:string[])=>{
 if(args[1]==='new-split') throw new Error('split failed');
 return boundary.run(args);
 })).rejects.toThrow('split failed');
 expect(boundary.workspaces[0].panes).toHaveLength(1);
});

test('refuses updates for another mission and identity reuse for another role', async () => {
 const boundary = terminal();
 await presentMission(request, boundary.run);
 await presentMission({...request, action:'worker',id:'reviewer',role:'review',createSurface:true},boundary.run);
 await expect(presentMission({...request,action:'worker',id:'reviewer',role:'worker'},boundary.run)).rejects.toThrow('collision');
 await expect(presentMission({...request,mission:'OTHER',action:'status',id:'orchestrator',state:'waiting'},boundary.run)).rejects.toThrow('Ensure');
 expect(boundary.workspaces).toHaveLength(1);
});

test('refuses retry after an unnamed split instead of duplicating the interrupted effect', async () => {
 const boundary = terminal();
 await presentMission(request,boundary.run);
 await expect(presentMission({...request,action:'worker',id:'a',createSurface:true},async(args:string[])=>{
 if(args[1]==='rename-tab') throw new Error('rename interrupted');
 return boundary.run(args);
 })).rejects.toThrow('rename interrupted');
 await expect(presentMission({...request,action:'worker',id:'a',createSurface:true},boundary.run)).rejects.toThrow('Unregistered');
 expect(boundary.splits).toEqual(['right']);
});

test('accepts native mutation acknowledgements while requiring structured observation', async () => {
 const { decodeCmuxResponse } = await import('../../scripts/mission-presentation.mjs');
 expect(decodeCmuxResponse(['--json','new-workspace'], 'OK workspace:14\n')).toBe('OK workspace:14\n');
 expect(decodeCmuxResponse(['--json','tree','--all'], '{"windows":[]}')).toEqual({windows:[]});
 expect(()=>decodeCmuxResponse(['--json','tree','--all'], 'OK')).toThrow();
});

test('validates status and worker identity even without a terminal adapter',async()=>{
 await expect(presentMission({...request,adapter:'text',action:'status',id:'orchestrator',state:''})).rejects.toThrow('state');
 await expect(presentMission({...request,adapter:'text',action:'worker',id:'../bad'})).rejects.toThrow('agent id');
});

test('shows native agents without terminals and refuses terminal identity collisions', async () => {
 const boundary = terminal();
 await presentMission(request,boundary.run);
 const statuses:string[][]=[];
 const run=async(args:string[])=>{if(args[1]==='set-status') statuses.push(args);return boundary.run(args);};
 const shown=await presentMission({...request,action:'status',overview:true,id:'native-review',role:'review',state:'reading diff'},run);
 expect(shown.overview).toBe(true);
 expect(statuses[0]).toContain('review | reading diff');
 expect(boundary.splits).toEqual([]);
 await expect(presentMission({...request,action:'status',overview:true,id:'orchestrator',role:'review',state:'reading'},run)).rejects.toThrow('collision');
 await expect(presentMission({...request,action:'status',overview:true,id:'other',role:'invalid',state:'reading'},run)).rejects.toThrow('role');
});
