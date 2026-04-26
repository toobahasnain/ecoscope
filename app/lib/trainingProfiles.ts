import { ReferenceProfile } from './analyze';

export const PRETRAINED_PROFILES: ReferenceProfile[] = [
  {
    phase: 'tile_scan_acquisition',
    avgPower: 211.51,
    avgEnergy: 491.41,
    avgGpuPower: 43.33,
    avgCpuPct: 12.72,
    avgTileOverlap: 10.45,
    avgUserInteraction: 0.16,
    avgLiveViewShare: 0.89,
    avgInactivity: 179.86,
    scenarioCount: 10
  },
  {
    phase: 'live_view_monitoring',
    avgPower: 181.97,
    avgEnergy: 239.52,
    avgGpuPower: 39.71,
    avgCpuPct: 9.74,
    avgTileOverlap: 0.0,
    avgUserInteraction: 0.15,
    avgLiveViewShare: 1.0,
    avgInactivity: 471.42,
    scenarioCount: 10
  },
  {
    phase: 'processing',
    avgPower: 194.34,
    avgEnergy: 200.0,
    avgGpuPower: 41.46,
    avgCpuPct: 10.72,
    avgTileOverlap: 6.03,
    avgUserInteraction: 0.05,
    avgLiveViewShare: 0.26,
    avgInactivity: 192.86,
    scenarioCount: 10
  },
  {
    phase: 'idle',
    avgPower: 159.85,
    avgEnergy: 271.14,
    avgGpuPower: 27.4,
    avgCpuPct: 3.36,
    avgTileOverlap: 0.0,
    avgUserInteraction: 0.04,
    avgLiveViewShare: 0.22,
    avgInactivity: 165.15,
    scenarioCount: 10
  }
];