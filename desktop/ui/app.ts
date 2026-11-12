/**
 * @file Editable genuine metadata-node workflow and durable exact-run evidence UI.
 * @description All user strings are rendered as text; renderer receives no filesystem, endpoint or executable interface.
 * @exports No module API; the frozen preload bridge admits bounded native operations.
 * @data Current editor, selected saved run and busy/dirty state are explicit rather than inferred from success-looking examples.
 * @remarks Functions, parameters and variables: generated docs/code-map.md.
 */
import type { WorkbenchProject, WorkbenchState, WorkbenchRun } from '../../src/workbench/project';
interface Saved {
  value: WorkbenchState;
  sha256: string;
  hasPrevious: boolean;
  version: string;
}
interface Bridge {
  request(operation: string, value: unknown): Promise<unknown>;
  changed(value: boolean): Promise<void>;
  ready(): Promise<void>;
  quit(): Promise<void>;
  onClosing(handler: () => void): void;
  onProgress(handler: (value: Record<string, unknown>) => void): void;
}
declare global {
  interface Window {
    metadataWorkbench: Bridge;
  }
}
const bridge = window.metadataWorkbench;
let saved: Saved,
  dirty = false,
  busy = false,
  running = false,
  selected = '',
  closing = false;
const policyNames = [
  'timeoutMs',
  'maxResponseBytes',
  'retryCount',
  'retryDelayMs',
  'maxConcurrent',
  'maxQueueDepth',
] as const;
function element<T extends HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error('Required workbench control is missing.');
  return result as T;
}
const input = (id: string): HTMLInputElement => element(id);
const area = (id: string): HTMLTextAreaElement => element(id);
const select = (id: string): HTMLSelectElement => element(id);
const button = (id: string): HTMLButtonElement => element(id);
function status(text: string, error = false): void {
  element('status').textContent = text;
  element('status').dataset.error = String(error);
}
async function call<T>(operation: string, value: unknown = null): Promise<T> {
  const result = await bridge.request(operation, value);
  if (
    !result ||
    typeof result !== 'object' ||
    !('success' in result) ||
    result.success !== true ||
    !('value' in result)
  )
    throw new Error(
      result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
        ? result.error
        : 'The native operation did not complete.',
    );
  return result.value as T;
}
function controls(): void {
  for (const control of document.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement
  >('button,input,textarea,select'))
    control.disabled = busy || closing;
  button('cancel').disabled = !running || closing;
  button('run').disabled = busy || dirty || closing;
  button('export-flow').disabled = busy || dirty || closing;
  button('export-project').disabled = busy || dirty || closing;
  button('restore-run').disabled = busy || !selected || closing;
  button('export-run').disabled = busy || !selected || closing;
  button('previous').disabled = busy || !saved?.hasPrevious || closing;
  button('quit').disabled = closing;
  if (element<HTMLDialogElement>('replace-confirm').open) {
    button('keep-draft').disabled = false;
    button('replace-draft').disabled = false;
  }
}
/** A replacement cannot discard authored unsaved text merely because it is another valid project. */
async function confirmReplacement(): Promise<boolean> {
  if (!dirty) return true;
  const dialog = element<HTMLDialogElement>('replace-confirm');
  dialog.returnValue = 'keep';
  const answer = new Promise<boolean>((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'replace'), {
      once: true,
    });
  });
  dialog.showModal();
  controls();
  return answer;
}
button('keep-draft').addEventListener('click', () =>
  element<HTMLDialogElement>('replace-confirm').close('keep'),
);
button('replace-draft').addEventListener('click', () =>
  element<HTMLDialogElement>('replace-confirm').close('replace'),
);
function savedLabel(): void {
  element('saved-label').textContent = dirty
    ? 'Unsaved changes — save before deploying.'
    : 'Saved project; run evidence is bound to its separate project SHA256.';
}
function populate(project: WorkbenchProject): void {
  input('title').value = project.title;
  for (const key of policyNames) input(key).value = String(project.policy[key]);
  area('payloads').value = JSON.stringify(project.payloads, null, 2);
  area('records').value = JSON.stringify(project.provider.records, null, 2);
  select('scenario').value = project.provider.scenario;
  input('responseDelayMs').value = String(project.provider.responseDelayMs);
}
/** Preserve authored fragment bytes for the owner's duplicate-key/depth/schema validation. */
function projectText(): string {
  if (
    [...policyNames, 'responseDelayMs'].some(
      (key) => !input(key).value.trim() || !Number.isFinite(input(key).valueAsNumber),
    )
  )
    throw new Error('Fill every numeric policy/delay field with a finite number before saving.');
  const policy = Object.fromEntries(policyNames.map((key) => [key, Number(input(key).value)]));
  return (
    '{"schema":1,"title":' +
    JSON.stringify(input('title').value) +
    ',"policy":' +
    JSON.stringify(policy) +
    ',"payloads":' +
    area('payloads').value +
    ',"provider":{"scenario":' +
    JSON.stringify(select('scenario').value) +
    ',"responseDelayMs":' +
    JSON.stringify(Number(input('responseDelayMs').value)) +
    ',"records":' +
    area('records').value +
    '}}'
  );
}
function chosen(): { project: WorkbenchProject; run: WorkbenchRun } | undefined {
  return saved.value.history.find((item) => item.run.id === selected);
}
function queueText(queue: Record<string, unknown> | null): string {
  return queue
    ? String(queue.active) +
        ' active / ' +
        String(queue.pending) +
        ' queued / peak ' +
        String(queue.highWaterMark) +
        ' / refused ' +
        String(queue.rejected)
    : 'Flow removed after cancellation';
}
function metrics(run: WorkbenchRun): void {
  const data: [string, string][] = [
    ['Actual Node-RED', run.actualNodeRedVersion],
    ['Completed / duration', run.completedAt + ' / ' + run.durationMs + ' ms'],
    ['Scenario / cancelled', run.scenario + ' / ' + String(run.cancelled)],
    ['Actual provider requests', String(run.provider.requests)],
    ['Project SHA256', run.projectSha256],
    ['Graph revision / deployment', run.revision + ' / ' + run.deployment],
  ];
  const list = element('metrics');
  list.replaceChildren();
  for (const [name, value] of data) {
    const cell = document.createElement('div'),
      term = document.createElement('dt'),
      description = document.createElement('dd');
    term.textContent = name;
    description.textContent = value;
    cell.append(term, description);
    list.append(cell);
  }
}
function showRun(): void {
  const item = chosen();
  const rows = element('results');
  rows.replaceChildren();
  if (!item) {
    element('metrics').replaceChildren();
    element('detail').textContent =
      'No completed run is selected. A saved project has not necessarily been executed.';
    controls();
    return;
  }
  metrics(item.run);
  element('flow-queue').textContent = queueText(item.run.queue);
  for (const row of item.run.results) {
    const tr = document.createElement('tr');
    for (const text of [String(row.index + 1), row.outcome, String(row.done)]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    const cell = document.createElement('td'),
      inspect = document.createElement('button');
    inspect.textContent = 'Inspect input ' + (row.index + 1);
    inspect.addEventListener('click', () => {
      element('detail').textContent = JSON.stringify(
        {
          authoredPayload: item.project.payloads[row.index],
          actual: row,
          provider: item.run.provider,
          queue: item.run.queue,
        },
        null,
        2,
      );
    });
    cell.append(inspect);
    tr.append(cell);
    rows.append(tr);
  }
  element('detail').textContent = JSON.stringify(
    { provider: item.run.provider, queue: item.run.queue },
    null,
    2,
  );
  element('flow-input').textContent = item.run.results.length + ' messages / ' + item.run.id;
  element('flow-output').textContent =
    item.run.results.filter((row) => row.outcome === 'success').length +
    ' success; ' +
    item.run.results.filter((row) => row.outcome === 'failure').length +
    ' failure; cancelled ' +
    item.run.cancelled;
  element('flow-provider').textContent =
    item.run.provider.requests + ' actual requests; all recorded responses closed';
  controls();
}
function render(): void {
  const history = select('history');
  history.replaceChildren();
  for (const item of [...saved.value.history].reverse()) {
    const option = document.createElement('option');
    option.value = item.run.id;
    option.textContent =
      item.run.completedAt +
      ' | ' +
      item.run.scenario +
      ' | ' +
      item.run.results.length +
      ' inputs';
    history.append(option);
  }
  if (!saved.value.history.some((item) => item.run.id === selected))
    selected = saved.value.history.at(-1)?.run.id ?? '';
  history.value = selected;
  element('history-budget').textContent =
    saved.value.history.length +
    ' retained runs; ' +
    saved.value.dropped +
    ' older runs evicted. Limit: 10 runs / 16 MiB, not a complete archive.';
  savedLabel();
  showRun();
}
async function work(action: () => Promise<void>): Promise<void> {
  if (busy || closing) return;
  busy = true;
  controls();
  try {
    await action();
  } catch (error) {
    status(error instanceof Error ? error.message : 'The operation failed.', true);
  } finally {
    busy = false;
    controls();
  }
}
for (const control of document.querySelectorAll<
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
>('input,textarea,#scenario'))
  control.addEventListener('input', () => {
    dirty = true;
    void bridge.changed(true);
    savedLabel();
    controls();
  });
button('save').addEventListener('click', () => {
  void work(async () => {
    saved = await call<Saved>('save', { project: projectText(), sha256: saved.sha256 });
    dirty = false;
    await bridge.changed(false);
    populate(saved.value.project);
    render();
    status('Project validated and saved. Deploy to execute these exact messages and records.');
  });
});
button('run').addEventListener('click', () => {
  void work(async () => {
    running = true;
    controls();
    try {
      status('Deploying the actual shipped metadata nodes and waiting for real completion...');
      element('flow-output').textContent = 'Batch active';
      saved = await call<Saved>('run');
      selected = saved.value.history.at(-1)?.run.id ?? '';
      render();
      status(
        'Actual batch completed and its exact project/results were saved. Inspect success, failure and cancellation per input.',
      );
    } finally {
      running = false;
    }
  });
});
button('cancel').addEventListener('click', () => {
  button('cancel').disabled = true;
  void call<{ cancelled: boolean }>('cancel')
    .then((result) => {
      status(
        result.cancelled
          ? 'Actual cancellation/redeployment completed; waiting for the run evidence to be saved.'
          : 'No active batch remained to cancel; saved state was preserved.',
      );
    })
    .catch(() => {
      status(
        'Cancellation could not complete. The runtime remains owned until real completion.',
        true,
      );
    });
});
for (const [id, operation] of [
  ['prepared', 'prepared'],
  ['previous', 'previous'],
  ['import', 'import'],
] as const)
  button(id).addEventListener('click', () => {
    void work(async () => {
      if (!(await confirmReplacement())) {
        status('Kept the unsaved editor draft; saved project and history were preserved.');
        return;
      }
      const project = await call<WorkbenchProject | null>(operation);
      if (project) {
        populate(project);
        dirty = true;
        await bridge.changed(true);
        savedLabel();
        status(
          'Project loaded into the editor for review. Save explicitly before deploying; current saved state has not been replaced.',
        );
      } else status('Import canceled; current editor and saved state were preserved.');
    });
  });
select('history').addEventListener('change', () => {
  selected = select('history').value;
  showRun();
});
button('restore-run').addEventListener('click', () => {
  void work(async () => {
    const item = chosen();
    if (!item || !(await confirmReplacement())) {
      status('Kept the unsaved editor draft; saved project and history were preserved.');
      return;
    }
    populate(item.project);
    dirty = true;
    await bridge.changed(true);
    savedLabel();
    status('This exact historical project is in the editor. Review and save before replaying.');
  });
});
for (const kind of ['project', 'flow', 'run'] as const)
  button('export-' + kind).addEventListener('click', () => {
    void work(async () => {
      const result = await call<{ canceled: boolean }>('export', {
        kind,
        id: kind === 'run' ? selected : null,
      });
      status(
        result.canceled
          ? 'Export canceled; existing files were preserved.'
          : kind === 'flow'
            ? 'Credential-free real Node-RED flow exported. Configure an approved service and credentials independently before deployment.'
            : 'New JSON file exported without overwriting an existing file.',
      );
    });
  });
button('quit').addEventListener('click', () => {
  void bridge.quit();
});
bridge.onProgress((value) => {
  if (value.kind === 'provider-request')
    element('flow-provider').textContent = String(value.requests) + ' actual provider requests';
  if (value.kind === 'node-output')
    element('flow-output').textContent = String(value.completed) + ' original node outputs';
  if (value.queue && typeof value.queue === 'object')
    element('flow-queue').textContent = queueText(value.queue as Record<string, unknown>);
});
bridge.onClosing(() => {
  closing = true;
  status(
    'Finishing accepted operations, actual Node-RED shutdown and provider/child exit. The window is retained until completion.',
  );
  controls();
});
void (async () => {
  saved = await call<Saved>('load');
  populate(saved.value.project);
  render();
  status('Ready. Edit messages, records and policy, save, then deploy the actual runtime.');
  await bridge.ready();
})().catch(() => {
  status('The actual native workspace did not load. No project has been replaced.', true);
});
