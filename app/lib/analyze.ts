export interface ReferenceProfile {
  phase: string;
  avgPower: number;
  avgEnergy: number;
  avgGpuPower: number;
  avgCpuPct: number;
  avgTileOverlap: number;
  avgUserInteraction: number;
  avgLiveViewShare: number;
  avgInactivity: number;
  scenarioCount: number;
}

export interface PhaseStats {
  phase: string;
  avgPower: number;
  totalEnergy: number;
  avgGpuPower: number;
  avgCpuPct: number;
  avgTileOverlap: number;
  avgSecondsInactive: number;
  liveViewShare: number;
  userInteractingShare: number;
  durationSec: number;
  rowCount: number;
  potentialSavingWh: number;
  recommendedAction: string;
  // Comparison against reference
  powerDeviation: number;
  energyDeviation: number;
  isDeviant: boolean;
  deviationReason: string;
}

export interface ScenarioAnalysis {
  scenarioCode: string;
  scenarioName: string;
  totalEnergyWh: number;
  totalPotentialSavingWh: number;
  savingPct: number;
  energyLabel: string;
  phases: PhaseStats[];
  wasteFlags: WasteFlag[];
  referenceProfiles?: ReferenceProfile[];
}

export interface WasteFlag {
  phase: string;
  type: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  saving: string;
  rStrategy: string;
}

// STEP 1: Learn reference profiles from training data (S1-S12)
export function buildReferenceProfiles(allTrainingRows: Record<string, string>[][]): ReferenceProfile[] {
  const phaseNames = ['tile_scan_acquisition', 'live_view_monitoring', 'processing', 'idle'];
  const profiles: ReferenceProfile[] = [];

  for (const phase of phaseNames) {
    const phaseDataPerScenario: {
      avgPower: number;
      avgEnergy: number;
      avgGpu: number;
      avgCpu: number;
      avgOverlap: number;
      avgInteraction: number;
      avgLiveView: number;
      avgInactivity: number;
    }[] = [];

    for (const scenarioRows of allTrainingRows) {
      const phaseRows = scenarioRows.filter(r => r.workflow_phase === phase);
      if (phaseRows.length === 0) continue;

      const avg = (key: string) => phaseRows.reduce((s, r) => s + parseFloat(r[key] || '0'), 0) / phaseRows.length;
      const share = (key: string) => phaseRows.filter(r => r[key] === 'TRUE' || r[key] === 'True' || r[key] === '1').length / phaseRows.length;

      phaseDataPerScenario.push({
        avgPower: avg('estimated_system_power_w'),
        avgEnergy: phaseRows.reduce((s, r) => s + parseFloat(r['estimated_energy_wh_interval'] || '0'), 0),
        avgGpu: avg('perf_gpu_power_w'),
        avgCpu: avg('perf_cpu_pct'),
        avgOverlap: avg('tile_overlap_pct'),
        avgInteraction: share('user_interacting_flag'),
        avgLiveView: share('live_view_enabled_flag'),
        avgInactivity: avg('seconds_since_last_ui_interaction'),
      });
    }

    if (phaseDataPerScenario.length === 0) continue;

    // Sort by energy and take the best 50% as reference (efficient scenarios)
    phaseDataPerScenario.sort((a, b) => a.avgEnergy - b.avgEnergy);
    const efficientHalf = phaseDataPerScenario.slice(0, Math.max(1, Math.floor(phaseDataPerScenario.length * 0.5)));

    const meanOf = (key: keyof typeof efficientHalf[0]) =>
      efficientHalf.reduce((s, d) => s + d[key], 0) / efficientHalf.length;

    profiles.push({
      phase,
      avgPower: Math.round(meanOf('avgPower') * 10) / 10,
      avgEnergy: Math.round(meanOf('avgEnergy') * 100) / 100,
      avgGpuPower: Math.round(meanOf('avgGpu') * 10) / 10,
      avgCpuPct: Math.round(meanOf('avgCpu') * 10) / 10,
      avgTileOverlap: Math.round(meanOf('avgOverlap') * 10) / 10,
      avgUserInteraction: Math.round(meanOf('avgInteraction') * 100) / 100,
      avgLiveViewShare: Math.round(meanOf('avgLiveView') * 100) / 100,
      avgInactivity: Math.round(meanOf('avgInactivity')),
      scenarioCount: phaseDataPerScenario.length,
    });
  }

  return profiles;
}

export function getEnergyLabel(savingPct: number): { label: string; color: string; description: string } {
  if (savingPct < 5) return { label: 'A++', color: '#00A651', description: 'Extremely Efficient' };
  if (savingPct < 15) return { label: 'A+', color: '#4CB84C', description: 'Very Efficient' };
  if (savingPct < 25) return { label: 'A', color: '#8DC63F', description: 'Efficient' };
  if (savingPct < 35) return { label: 'B', color: '#C8D400', description: 'Above Average' };
  if (savingPct < 45) return { label: 'C', color: '#FFED00', description: 'Average' };
  if (savingPct < 55) return { label: 'D', color: '#FAA61A', description: 'Below Average' };
  if (savingPct < 65) return { label: 'E', color: '#F26522', description: 'Needs Improvement' };
  if (savingPct < 75) return { label: 'F', color: '#ED1C24', description: 'Poor' };
  return { label: 'G', color: '#BE1E2D', description: 'Very Poor' };
}

// STEP 2: Analyze a scenario against reference profiles
export function analyzeScenario(
  rows: Record<string, string>[],
  referenceProfiles?: ReferenceProfile[]
): ScenarioAnalysis {

  
const sessionId = rows[0]?.session_id || '';
const scenarioCode = rows[0]?.scenario_code || sessionId.split('_')[1] || 'S?';
const scenarioName = rows[0]?.scenario_name
  ? rows[0].scenario_name.replace(/_/g, ' ')
  : sessionId.split('_').slice(1).join(' ') || scenarioCode;
  const phaseMap = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const phase = row.workflow_phase;
    if (!phaseMap.has(phase)) phaseMap.set(phase, []);
    phaseMap.get(phase)!.push(row);
  }

  const phases: PhaseStats[] = [];
  const wasteFlags: WasteFlag[] = [];

  for (const [phase, phaseRows] of phaseMap.entries()) {
    const avg = (key: string) => phaseRows.reduce((s, r) => s + parseFloat(r[key] || '0'), 0) / phaseRows.length;
    const sum = (key: string) => phaseRows.reduce((s, r) => s + parseFloat(r[key] || '0'), 0);
    const share = (key: string) => phaseRows.filter(r => r[key] === 'TRUE' || r[key] === 'True' || r[key] === '1').length / phaseRows.length;

    const avgPower = avg('estimated_system_power_w');
    const totalEnergy = sum('estimated_energy_wh_interval');
    const potentialSaving = sum('estimated_energy_saving_wh_interval') > 0
      ? sum('estimated_energy_saving_wh_interval')
      : totalEnergy * 0.25;
    const avgInactive = avg('seconds_since_last_ui_interaction');
    const liveViewShare = share('live_view_enabled_flag');
    const userShare = share('user_interacting_flag');
    const avgTileOverlap = avg('tile_overlap_pct');

    // Find reference for this phase
    const ref = referenceProfiles?.find(r => r.phase === phase);

    // Calculate deviations against learned reference
    const powerDeviation = ref ? Math.round(((avgPower - ref.avgPower) / ref.avgPower) * 100) : 0;
    const energyDeviation = ref ? Math.round(((totalEnergy - ref.avgEnergy) / ref.avgEnergy) * 100) : 0;
    const isDeviant = Math.abs(powerDeviation) > 20 || Math.abs(energyDeviation) > 20;

    let deviationReason = '';
    if (ref) {
      const reasons = [];
      if (powerDeviation > 20) reasons.push(`power is ${powerDeviation}% above efficient reference (${ref.avgPower}W)`);
      if (phase === 'live_view_monitoring' && liveViewShare > 0.7 && userShare < 0.2)
        reasons.push(`live view active ${Math.round(liveViewShare * 100)}% of time with only ${Math.round(userShare * 100)}% user interaction`);
      if (phase === 'idle' && avgPower > ref.avgPower * 1.2)
        reasons.push(`idle consuming ${Math.round(avgPower)}W vs efficient reference of ${ref.avgPower}W`);
      if (phase === 'tile_scan_acquisition' && avgTileOverlap > ref.avgTileOverlap * 1.2)
        reasons.push(`tile overlap ${Math.round(avgTileOverlap)}% vs efficient reference of ${ref.avgTileOverlap}%`);
      deviationReason = reasons.join('; ');
    }

    // Action counts
    // Smart action detection based on data patterns
let recommendedAction = 'no_action';
if (phase === 'live_view_monitoring' && liveViewShare > 0.6 && userShare < 0.3) {
  recommendedAction = 'pause_live_view';
} else if (phase === 'tile_scan_acquisition' && avgTileOverlap > 15) {
  recommendedAction = 'optimize_tile_scan_settings';
} else if (phase === 'idle' && avgPower > 120) {
  recommendedAction = 'enable_auto_standby';
} else if (phase === 'processing' && avg('perf_gpu_power_w') > 55 && userShare < 0.1) {
  recommendedAction = 'schedule_processing';
} else {
  // Fall back to training label
  const actionCounts = new Map<string, number>();
  for (const r of phaseRows) {
    const action = (r.recommended_action || r.action_class || 'no_action').trim();
    actionCounts.set(action, (actionCounts.get(action) || 0) + 1);
  }
  let maxCount = 0;
  for (const [action, count] of actionCounts.entries()) {
    if (count > maxCount) { maxCount = count; recommendedAction = action; }
  }
}

    phases.push({
      phase,
      avgPower: Math.round(avgPower * 10) / 10,
      totalEnergy: Math.round(totalEnergy * 100) / 100,
      avgGpuPower: Math.round(avg('perf_gpu_power_w') * 10) / 10,
      avgCpuPct: Math.round(avg('perf_cpu_pct') * 10) / 10,
      avgTileOverlap: Math.round(avgTileOverlap * 10) / 10,
      avgSecondsInactive: Math.round(avgInactive),
      liveViewShare: Math.round(liveViewShare * 100) / 100,
      userInteractingShare: Math.round(userShare * 100) / 100,
      durationSec: phaseRows.length * 15,
      rowCount: phaseRows.length,
      potentialSavingWh: Math.round(potentialSaving * 100) / 100,
      recommendedAction,
      powerDeviation,
      energyDeviation,
      isDeviant,
      deviationReason,
    });

    // Waste flags
    if (phase === 'live_view_monitoring' && liveViewShare > 0.7 && userShare < 0.2) {
      wasteFlags.push({
        phase, type: 'Unattended Live View', severity: 'high',
        description: `Live view running ${Math.round(liveViewShare * 100)}% of phase with only ${Math.round(userShare * 100)}% user interaction`,
        saving: `~${Math.round(potentialSaving * 10) / 10} Wh`, rStrategy: 'R2 — Reduce',
      });
    }
    if (phase === 'idle' && avgPower > 100) {
      wasteFlags.push({
        phase, type: 'High Idle Power', severity: 'high',
        description: `System consuming ${Math.round(avgPower)}W during idle — auto-standby recommended`,
        saving: `~${Math.round(potentialSaving * 10) / 10} Wh`, rStrategy: 'R1 — Rethink',
      });
    }
    if (phase === 'tile_scan_acquisition' && avgTileOverlap > 18) {
      wasteFlags.push({
        phase, type: 'Excessive Tile Overlap', severity: 'medium',
        description: `Tile overlap at ${Math.round(avgTileOverlap)}% — reducing to 10% saves energy`,
        saving: `~${Math.round(potentialSaving * 10) / 10} Wh`, rStrategy: 'R2 — Reduce',
      });
    }
  }

  const totalEnergyWh = phases.reduce((s, p) => s + p.totalEnergy, 0);
  const totalPotentialSaving = phases.reduce((s, p) => s + p.potentialSavingWh, 0);
  const savingPct = totalEnergyWh > 0 ? (totalPotentialSaving / totalEnergyWh) * 100 : 0;
  const { label } = getEnergyLabel(savingPct);

  return {
    scenarioCode,
    scenarioName,
    totalEnergyWh: Math.round(totalEnergyWh * 100) / 100,
    totalPotentialSavingWh: Math.round(totalPotentialSaving * 100) / 100,
    savingPct: Math.round(savingPct * 10) / 10,
    energyLabel: label,
    phases,
    wasteFlags,
    referenceProfiles,
  };
}

export function generateScenario11(analyses: ScenarioAnalysis[]): ScenarioAnalysis {
  const phaseNames = ['tile_scan_acquisition', 'live_view_monitoring', 'processing', 'idle'];
  const bestPhases: PhaseStats[] = [];

  for (const phase of phaseNames) {
    let bestPhase: PhaseStats | null = null;
    let lowestEnergy = Infinity;
    for (const analysis of analyses) {
      const p = analysis.phases.find(ph => ph.phase === phase);
      if (p && p.totalEnergy < lowestEnergy) {
        lowestEnergy = p.totalEnergy;
        bestPhase = p;
      }
    }
    if (bestPhase) bestPhases.push({ ...bestPhase });
  }

  const totalEnergy = bestPhases.reduce((s, p) => s + p.totalEnergy, 0);
  const totalSaving = bestPhases.reduce((s, p) => s + p.potentialSavingWh, 0);
  const savingPct = totalEnergy > 0 ? (totalSaving / totalEnergy) * 100 : 0;

  return {
    scenarioCode: 'S11',
    scenarioName: 'AI-Generated Golden Workflow',
    totalEnergyWh: Math.round(totalEnergy * 100) / 100,
    totalPotentialSavingWh: Math.round(totalSaving * 100) / 100,
    savingPct: Math.round(savingPct * 10) / 10,
    energyLabel: 'A++',
    phases: bestPhases,
    wasteFlags: [],
  };
}