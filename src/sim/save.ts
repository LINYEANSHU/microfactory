import { Sim } from './engine';

export const SAVE_KEY = 'microfactory.save.v1';
export const BACKUP_KEY = 'microfactory.save.backup.v1';

type Position = [number, number, number];

interface Playback {
  paused: boolean;
  speed: number;
}

function position(value: unknown): value is Position {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

export function decodeFactorySave(raw: string) {
  const data = JSON.parse(raw);
  const payload = data?.sim ?? data;
  if (!payload || ![1, 2, 3].includes(payload.v) || !Array.isArray(payload.ents)
    || !payload.ledger || typeof payload.ledger !== 'object' || Array.isArray(payload.ledger)) {
    throw new Error('Invalid factory save');
  }
  const sim = new Sim();
  sim.load(payload);
  const settings = data.playback;
  const playback: Playback = {
    paused: settings?.paused === true,
    speed: Number.isInteger(settings?.speed) && settings.speed >= 0 && settings.speed <= 2 ? settings.speed : 0,
  };
  const camera = position(data.camera?.position) && position(data.camera?.target)
    ? { position: data.camera.position, target: data.camera.target } : null;
  return { sim, playback, camera };
}

export function loadFactorySave(storage: Pick<Storage, 'getItem'>) {
  let error: unknown;
  for (const key of [SAVE_KEY, BACKUP_KEY]) {
    try {
      const raw = storage.getItem(key);
      if (raw !== null) return { ...decodeFactorySave(raw), raw, recovered: key === BACKUP_KEY };
    } catch (cause) {
      error = cause;
    }
  }
  if (error) throw error;
  return null;
}
