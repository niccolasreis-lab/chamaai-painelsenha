import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Edit3,
  FileAudio,
  Folder,
  FolderPlus,
  Music2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '../shared/components/Button';
import { Input } from '../shared/components/Input';
import { StatusBadge } from '../shared/components/StatusBadge';
import {
  findNextScheduleOccurrence,
  findScheduleConflict,
  getScheduleMinutes,
  ISO_WEEKDAYS,
  minutesToTime,
  validateScheduleWindow,
} from '../shared/vignetteSchedule';
import type { IsoWeekday, VignetteFolder, VignetteSchedule } from '../shared/types';

type Props = { API_URL: string };

type ScheduleDraft = {
  name: string;
  folder_id: number;
  weekdays: IsoWeekday[];
  start_time: string;
  end_time: string;
  interval_minutes: number;
  is_active: boolean;
};

type ApiErrorBody = {
  error?: string;
  conflict?: {
    schedule_name?: string;
    weekday?: IsoWeekday;
    time?: string;
  };
};

const BUSINESS_DAYS: IsoWeekday[] = [1, 2, 3, 4, 5];

function createDraft(folderId = 0): ScheduleDraft {
  return {
    name: '',
    folder_id: folderId,
    weekdays: BUSINESS_DAYS,
    start_time: '08:00',
    end_time: '18:00',
    interval_minutes: 5,
    is_active: false,
  };
}

function describeApiError(body: ApiErrorBody, fallback: string): string {
  if (body.conflict?.schedule_name && body.conflict.weekday && body.conflict.time) {
    const day = ISO_WEEKDAYS.find((item) => item.value === body.conflict?.weekday)?.label;
    return 'Conflito com "' + body.conflict.schedule_name + '" em '
      + (day ?? 'um dia compartilhado') + ', às ' + body.conflict.time + '.';
  }
  return body.error || fallback;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as ApiErrorBody;
  if (!response.ok) {
    throw new Error(describeApiError(body, 'A operação não pôde ser concluída.'));
  }
  return body as T;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  return (bytes / (1024 * 1024)).toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
  }) + ' MB';
}

function formatDays(days: readonly IsoWeekday[]): string {
  if (days.length === 7) return 'Todos os dias';
  if (days.length === 5 && BUSINESS_DAYS.every((day) => days.includes(day))) {
    return 'Segunda a sexta';
  }
  return ISO_WEEKDAYS
    .filter((day) => days.includes(day.value))
    .map((day) => day.short)
    .join(', ');
}

function formatNext(schedule: VignetteSchedule): string {
  const next = findNextScheduleOccurrence(schedule);
  if (!next) return schedule.is_active ? 'Sem próximo horário válido' : 'Agendamento pausado';
  return next.toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function VignetteSchedulerAdmin({ API_URL }: Props) {
  const [folders, setFolders] = useState<VignetteFolder[]>([]);
  const [schedules, setSchedules] = useState<VignetteSchedule[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [draft, setDraft] = useState<ScheduleDraft>(() => createDraft());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setLoadError(null);
    try {
      const [folderData, scheduleData] = await Promise.all([
        requestJson<VignetteFolder[]>(API_URL + '/api/media/vignette-folders'),
        requestJson<VignetteSchedule[]>(API_URL + '/api/media/vignette-schedules'),
      ]);
      setFolders(folderData);
      setSchedules(scheduleData);
      setSelectedFolderId((current) => (
        current && folderData.some((folder) => folder.id === current)
          ? current
          : folderData[0]?.id ?? null
      ));
      setDraft((current) => (
        current.folder_id || folderData.length === 0
          ? current
          : { ...current, folder_id: folderData[0].id }
      ));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Falha ao carregar vinhetas.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [API_URL]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void loadData();
  }, [loadData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? null;
  const draftFolder = folders.find((folder) => folder.id === draft.folder_id) ?? null;
  const previewMinutes = useMemo(
    () => getScheduleMinutes(draft.start_time, draft.end_time, draft.interval_minutes),
    [draft.end_time, draft.interval_minutes, draft.start_time],
  );
  const conflict = useMemo(() => findScheduleConflict(
    {
      id: editingId ?? 0,
      name: draft.name,
      weekdays: draft.weekdays,
      start_time: draft.start_time,
      end_time: draft.end_time,
      interval_minutes: draft.interval_minutes,
      is_active: draft.is_active,
    },
    schedules,
  ), [draft, editingId, schedules]);

  const windowError = validateScheduleWindow({
    name: draft.name,
    weekdays: draft.weekdays,
    start_time: draft.start_time,
    end_time: draft.end_time,
    interval_minutes: draft.interval_minutes,
  });
  const formError = windowError
    || (!draftFolder ? 'Selecione uma pasta.' : null)
    || (draft.is_active && draftFolder?.files.length === 0
      ? 'A pasta precisa ter ao menos um MP3 para ativar a regra.'
      : null)
    || (conflict
      ? 'Conflito com "' + conflict.schedule_name + '" em '
        + (ISO_WEEKDAYS.find((day) => day.value === conflict.weekday)?.label ?? 'dia compartilhado')
        + ', às ' + conflict.time + '.'
      : null);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyKey(key);
    setActionError(null);
    setSuccess(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'A operação não pôde ser concluída.');
    } finally {
      setBusyKey(null);
    }
  };

  const createFolder = () => runAction('create-folder', async () => {
    const name = newFolderName.trim();
    if (!name) throw new Error('Informe o nome da nova pasta.');
    const created = await requestJson<VignetteFolder>(
      API_URL + '/api/media/vignette-folders',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      },
    );
    setNewFolderName('');
    setSelectedFolderId(created.id);
    setDraft((current) => ({ ...current, folder_id: current.folder_id || created.id }));
    await loadData(false);
    setSuccess('Pasta criada. Agora adicione os arquivos MP3.');
  });

  const renameFolder = () => {
    if (!selectedFolder) return Promise.resolve();
    return runAction('rename-folder', async () => {
      const name = renameValue.trim();
      if (!name) throw new Error('Informe o novo nome da pasta.');
      await requestJson(
        API_URL + '/api/media/vignette-folders/' + selectedFolder.id,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        },
      );
      setRenaming(false);
      await loadData(false);
      setSuccess('Pasta renomeada. Os arquivos permaneceram no mesmo local.');
    });
  };

  const deleteFolder = () => {
    if (!selectedFolder) return Promise.resolve();
    if (!window.confirm('Excluir a pasta "' + selectedFolder.name + '" e todos os MP3 dela?')) {
      return Promise.resolve();
    }
    return runAction('delete-folder', async () => {
      await requestJson(
        API_URL + '/api/media/vignette-folders/' + selectedFolder.id,
        { method: 'DELETE' },
      );
      await loadData(false);
      setSuccess('Pasta e arquivos excluídos.');
    });
  };

  const uploadSelectedFiles = () => {
    if (!selectedFolder) return Promise.resolve();
    return runAction('upload-files', async () => {
      if (uploadFiles.length === 0) throw new Error('Selecione ao menos um MP3.');
      const fileCount = uploadFiles.length;
      const form = new FormData();
      uploadFiles.forEach((file) => form.append('files', file));
      await requestJson(
        API_URL + '/api/media/vignette-folders/' + selectedFolder.id + '/files',
        { method: 'POST', body: form },
      );
      setUploadFiles([]);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
      await loadData(false);
      setSuccess(fileCount === 1 ? 'MP3 adicionado à pasta.' : fileCount + ' MP3 adicionados à pasta.');
    });
  };

  const deleteFile = (fileId: number, fileName: string) => {
    if (!window.confirm('Excluir o arquivo "' + fileName + '"?')) return Promise.resolve();
    return runAction('delete-file-' + fileId, async () => {
      await requestJson(
        API_URL + '/api/media/vignette-files/' + fileId,
        { method: 'DELETE' },
      );
      await loadData(false);
      setSuccess('Arquivo excluído.');
    });
  };

  const resetDraft = (folderId = draft.folder_id) => {    setEditingId(null);
    setDraft(createDraft(folderId));
  };

  const saveSchedule = () => runAction('save-schedule', async () => {
    if (formError) throw new Error(formError);
    const url = editingId
      ? API_URL + '/api/media/vignette-schedules/' + editingId
      : API_URL + '/api/media/vignette-schedules';
    await requestJson(url, {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const wasEditing = Boolean(editingId);
    resetDraft();
    await loadData(false);
    setSuccess(wasEditing ? 'Agendamento atualizado.' : 'Agendamento criado.');
  });

  const editSchedule = (schedule: VignetteSchedule) => {
    setEditingId(schedule.id);
    setDraft({
      name: schedule.name,
      folder_id: schedule.folder_id,
      weekdays: schedule.weekdays,
      start_time: schedule.start_time,
      end_time: schedule.end_time,
      interval_minutes: schedule.interval_minutes,
      is_active: schedule.is_active,
    });
    setActionError(null);
    document.getElementById('vignette-schedule-form')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const toggleSchedule = (schedule: VignetteSchedule) => runAction(
    'toggle-schedule-' + schedule.id,
    async () => {
      await requestJson(
        API_URL + '/api/media/vignette-schedules/' + schedule.id,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...schedule, is_active: !schedule.is_active }),
        },
      );
      await loadData(false);
      setSuccess(schedule.is_active ? 'Agendamento pausado.' : 'Agendamento ativado.');
    },
  );

  const deleteSchedule = (schedule: VignetteSchedule) => {
    if (!window.confirm('Excluir o agendamento "' + schedule.name + '"?')) {
      return Promise.resolve();
    }
    return runAction('delete-schedule-' + schedule.id, async () => {
      await requestJson(
        API_URL + '/api/media/vignette-schedules/' + schedule.id,
        { method: 'DELETE' },
      );
      if (editingId === schedule.id) resetDraft();
      await loadData(false);
      setSuccess('Agendamento excluído.');
    });
  };

  const toggleWeekday = (weekday: IsoWeekday) => {
    setDraft((current) => ({
      ...current,
      weekdays: current.weekdays.includes(weekday)
        ? current.weekdays.filter((day) => day !== weekday)
        : [...current.weekdays, weekday].sort((left, right) => left - right),
    }));
  };

  if (loading) {
    return <StatusBadge variant="loading" message="Carregando biblioteca e agendamentos…" />;
  }

  if (loadError) {
    return (
      <StatusBadge
        variant="error"
        message="Não foi possível carregar as vinhetas"
        detail={loadError}
        action={(
          <Button
            variant="secondary"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => void loadData()}
          >
            Tentar novamente
          </Button>
        )}
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-md border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <Music2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h2 className="font-display text-lg font-bold text-ink">Vinhetas programadas</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-variant">
              Organize MP3 em pastas e defina quando cada grupo deve tocar. Chamadas do operador
              sempre interrompem a vinheta e têm prioridade até o fim da voz.
            </p>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="rounded-sm border border-error/30 bg-error/5 px-4 py-3 text-sm text-error-ink" role="alert">
          {actionError}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-sm border border-success/30 bg-success/5 px-4 py-3 text-sm text-success" role="status">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {success}
        </div>
      )}

      <section aria-labelledby="vignette-library-title" className="space-y-4">
        <div>
          <h3 id="vignette-library-title" className="font-display text-lg font-bold text-ink">
            Biblioteca de pastas
          </h3>
          <p className="text-sm text-ink-variant">
            Cada disparo escolhe aleatoriamente um MP3 da pasta selecionada.
          </p>
        </div>

        <form
          className="flex flex-col gap-3 rounded-md border border-outline-variant bg-surface-container-low p-4 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void createFolder();
          }}
        >
          <Input
            label="Nome da nova pasta"
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            placeholder="Ex.: Encerramento"
            className="flex-1"
          />
          <Button
            type="submit"
            icon={<FolderPlus className="h-4 w-4" />}
            loading={busyKey === 'create-folder'}
          >
            Criar pasta
          </Button>
        </form>

        {folders.length === 0 ? (
          <StatusBadge
            variant="empty"
            message="Nenhuma pasta de vinhetas"
            detail="Crie a primeira pasta para começar a enviar os MP3."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.75fr)_minmax(0,2fr)]">
            <div className="space-y-2" role="list" aria-label="Pastas de vinhetas">
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  role="listitem"
                  onClick={() => {
                    setSelectedFolderId(folder.id);
                    setRenameValue(folder.name);
                    setRenaming(false);
                  }}
                  className={[
                    'flex min-h-11 w-full items-center justify-between gap-3 rounded-sm border px-3 py-2 text-left',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                    selectedFolderId === folder.id
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-outline-variant bg-surface hover:bg-surface-container-low text-ink',
                  ].join(' ')}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Folder className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate text-sm font-semibold">{folder.name}</span>
                  </span>
                  <span className="rounded-full bg-surface-container px-2 py-0.5 text-xs text-ink-variant">
                    {folder.files.length}
                  </span>
                </button>
              ))}
            </div>

            {selectedFolder && (
              <div className="rounded-md border border-outline-variant bg-surface p-4">
                <div className="flex flex-col gap-3 border-b border-outline-variant pb-4 sm:flex-row sm:items-center sm:justify-between">
                  {renaming ? (
                    <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
                      <Input
                        label="Novo nome da pasta"
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        className="flex-1"
                      />
                      <Button
                        icon={<Save className="h-4 w-4" />}
                        loading={busyKey === 'rename-folder'}
                        onClick={() => void renameFolder()}
                      >
                        Salvar
                      </Button>
                      <Button
                        variant="ghost"
                        icon={<X className="h-4 w-4" />}
                        onClick={() => setRenaming(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <h4 className="font-bold text-ink">{selectedFolder.name}</h4>
                        <p className="text-xs text-ink-variant">
                          {selectedFolder.files.length} arquivo(s) MP3
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="ghost"
                          icon={<Edit3 className="h-4 w-4" />}
                          onClick={() => {
                            setRenameValue(selectedFolder.name);
                            setRenaming(true);
                          }}
                        >
                          Renomear
                        </Button>
                        <Button
                          variant="danger"
                          icon={<Trash2 className="h-4 w-4" />}
                          loading={busyKey === 'delete-folder'}
                          onClick={() => void deleteFolder()}
                        >
                          Excluir
                        </Button>
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-4 rounded-sm border border-dashed border-outline p-4">
                  <label htmlFor="vignette-files" className="text-sm font-medium text-ink">
                    Adicionar arquivos MP3
                  </label>                  <input
                    ref={uploadInputRef}
                    id="vignette-files"
                    type="file"
                    accept=".mp3,audio/mpeg,audio/mp3"
                    multiple
                    className="mt-2 block min-h-11 w-full rounded-sm border border-outline-variant bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded-sm file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-on-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onChange={(event) => setUploadFiles(Array.from(event.target.files ?? []))}
                  />
                  <p className="mt-2 text-xs text-ink-variant">
                    Somente MP3, até 50 MB por arquivo. Você pode selecionar vários de uma vez.
                  </p>
                  {uploadFiles.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <span className="text-sm text-ink">
                        {uploadFiles.length} arquivo(s) selecionado(s)
                      </span>
                      <Button
                        icon={<Upload className="h-4 w-4" />}
                        loading={busyKey === 'upload-files'}
                        onClick={() => void uploadSelectedFiles()}
                      >
                        Enviar MP3
                      </Button>
                    </div>
                  )}
                </div>

                <div className="mt-4 space-y-2">
                  {selectedFolder.files.length === 0 ? (
                    <StatusBadge
                      variant="empty"
                      message="Pasta vazia"
                      detail="Envie ao menos um MP3 antes de ativar um agendamento."
                      className="py-8"
                    />
                  ) : selectedFolder.files.map((file) => (
                    <div
                      key={file.id}
                      className="flex min-h-11 flex-col gap-2 rounded-sm border border-outline-variant px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <FileAudio className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">{file.original_name}</p>
                          <p className="text-xs text-ink-variant">{formatSize(file.size_bytes)}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        aria-label={'Excluir ' + file.original_name}
                        icon={<Trash2 className="h-4 w-4" />}
                        loading={busyKey === 'delete-file-' + file.id}
                        onClick={() => void deleteFile(file.id, file.original_name)}
                      >
                        Excluir
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="vignette-schedules-title" className="space-y-4 border-t border-outline-variant pt-8">
        <div>
          <h3 id="vignette-schedules-title" className="font-display text-lg font-bold text-ink">
            Agendamentos
          </h3>
          <p className="text-sm text-ink-variant">
            Início e fim são inclusivos. A repetição sempre parte do horário inicial.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.35fr)]">
          <form
            id="vignette-schedule-form"
            className="scroll-mt-6 space-y-4 rounded-md border border-outline-variant bg-surface-container-low p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveSchedule();
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-bold text-ink">
                {editingId ? 'Editar agendamento' : 'Novo agendamento'}
              </h4>
              {editingId && (
                <Button
                  type="button"
                  variant="ghost"
                  icon={<X className="h-4 w-4" />}
                  onClick={() => resetDraft()}
                >
                  Cancelar
                </Button>
              )}
            </div>

            <Input
              label="Nome do agendamento"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ex.: Encerramento da loja"
            />

            <div>
              <label htmlFor="vignette-folder-select" className="mb-1 block text-sm font-medium text-ink">
                Pasta de MP3
              </label>
              <select
                id="vignette-folder-select"
                value={draft.folder_id || ''}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  folder_id: Number(event.target.value),
                }))}
                className="min-h-11 w-full rounded-sm border border-outline-variant bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
              >
                <option value="">Selecione uma pasta</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name} ({folder.files.length} MP3)
                  </option>
                ))}
              </select>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink">Dias da semana</legend>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7 xl:grid-cols-4 2xl:grid-cols-7">
                {ISO_WEEKDAYS.map((weekday) => {
                  const selected = draft.weekdays.includes(weekday.value);
                  return (
                    <button
                      key={weekday.value}
                      type="button"
                      aria-pressed={selected}
                      title={weekday.label}
                      onClick={() => toggleWeekday(weekday.value)}
                      className={[
                        'min-h-11 rounded-sm border px-2 text-sm font-semibold',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                        selected
                          ? 'border-primary bg-primary text-on-primary'
                          : 'border-outline-variant bg-surface text-ink-variant hover:bg-surface-container',
                      ].join(' ')}
                    >
                      {weekday.short}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Início"
                type="time"
                value={draft.start_time}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  start_time: event.target.value,
                }))}
              />
              <Input
                label="Fim"
                type="time"
                value={draft.end_time}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  end_time: event.target.value,
                }))}
              />
            </div>

            <Input
              label="Repetir a cada"
              type="number"
              min={1}
              max={1440}
              step={1}
              value={draft.interval_minutes}
              onChange={(event) => setDraft((current) => ({
                ...current,
                interval_minutes: Number(event.target.value),
              }))}
              trailingIcon={<span className="text-xs">min</span>}
              helper="Use um número inteiro entre 1 e 1.440 minutos."
            />

            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-sm border border-outline-variant bg-surface px-3 py-2 focus-within:ring-2 focus-within:ring-primary">
              <span>
                <span className="block text-sm font-medium text-ink">Agendamento ativo</span>
                <span className="block text-xs text-ink-variant">
                  Regras pausadas ficam salvas como rascunho.
                </span>
              </span>
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  is_active: event.target.checked,
                }))}
                className="h-5 w-5 accent-primary"
              />
            </label>

            <div className="rounded-sm border border-outline-variant bg-surface p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
                Prévia dos horários
              </div>
              {previewMinutes.length > 0 ? (
                <>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {previewMinutes.slice(0, 18).map((minute) => (
                      <span
                        key={minute}
                        className="rounded-full bg-surface-container px-2 py-1 text-xs text-ink"
                      >                        {minutesToTime(minute)}
                      </span>
                    ))}
                    {previewMinutes.length > 18 && (
                      <span className="rounded-full bg-surface-container px-2 py-1 text-xs text-ink-variant">
                        +{previewMinutes.length - 18}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-ink-variant">
                    {previewMinutes.length} reprodução(ões) por dia selecionado.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-xs text-error-ink">
                  Corrija os horários ou o intervalo para gerar a prévia.
                </p>
              )}
            </div>

            {formError && (
              <p className="rounded-sm border border-error/30 bg-error/5 px-3 py-2 text-sm text-error-ink" role="alert">
                {formError}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              icon={<Save className="h-4 w-4" />}
              loading={busyKey === 'save-schedule'}
              disabled={Boolean(formError)}
            >
              {editingId ? 'Salvar alterações' : 'Criar agendamento'}
            </Button>
          </form>

          <div className="space-y-3">
            {schedules.length === 0 ? (
              <StatusBadge
                variant="empty"
                message="Nenhum agendamento"
                detail="Preencha o formulário para criar a primeira regra recorrente."
              />
            ) : schedules.map((schedule) => (
              <article
                key={schedule.id}
                className="rounded-md border border-outline-variant bg-surface p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-bold text-ink">{schedule.name}</h4>
                      <span className={[
                        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold',
                        schedule.is_active
                          ? 'bg-success/10 text-success'
                          : 'bg-surface-container text-ink-variant',
                      ].join(' ')}>
                        {schedule.is_active
                          ? <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          : <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />}
                        {schedule.is_active ? 'Ativo' : 'Pausado'}
                      </span>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-variant">
                      <Folder className="h-4 w-4" aria-hidden="true" />
                      {schedule.folder_name}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      icon={schedule.is_active
                        ? <PauseCircle className="h-4 w-4" />
                        : <PlayCircle className="h-4 w-4" />}
                      loading={busyKey === 'toggle-schedule-' + schedule.id}
                      onClick={() => void toggleSchedule(schedule)}
                    >
                      {schedule.is_active ? 'Pausar' : 'Ativar'}
                    </Button>
                    <Button
                      variant="ghost"
                      icon={<Edit3 className="h-4 w-4" />}
                      onClick={() => editSchedule(schedule)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label={'Excluir ' + schedule.name}
                      icon={<Trash2 className="h-4 w-4" />}
                      loading={busyKey === 'delete-schedule-' + schedule.id}
                      onClick={() => void deleteSchedule(schedule)}
                    >
                      Excluir
                    </Button>
                  </div>
                </div>

                <dl className="mt-4 grid gap-3 rounded-sm bg-surface-container-low p-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-ink-variant">Dias</dt>
                    <dd className="mt-1 text-ink">{formatDays(schedule.weekdays)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-ink-variant">Janela</dt>
                    <dd className="mt-1 text-ink">
                      {schedule.start_time}–{schedule.end_time}, a cada {schedule.interval_minutes} min
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-ink-variant">
                      <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                      Próximo disparo
                    </dt>
                    <dd className="mt-1 font-medium text-ink">{formatNext(schedule)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
