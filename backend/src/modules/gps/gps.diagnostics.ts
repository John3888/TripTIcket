const history = new Map<string, { receivedAt: string; snapshot: Record<string, unknown> }[]>();

export function saveDiagnostics(deviceId: string, snapshot: Record<string, unknown>) {
  if (!history.has(deviceId) && history.size >= 100) history.delete(history.keys().next().value!);
  const entries = history.get(deviceId) ?? [];
  entries.push({ receivedAt: new Date().toISOString(), snapshot });
  history.set(deviceId, entries.slice(-30));
}

export function readDiagnostics(deviceId?: string) {
  const cutoff = Date.now() - 3600000;
  for (const [id, entries] of history) {
    const fresh = entries.filter((entry) => Date.parse(entry.receivedAt) >= cutoff);
    if (!fresh.length) history.delete(id);
    else history.set(id, fresh);
  }
  return [...history].filter(([id]) => !deviceId || id === deviceId).map(([id, snapshots]) => ({ deviceId: id, snapshots }));
}
