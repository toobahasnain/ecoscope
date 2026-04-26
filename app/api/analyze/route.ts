import { NextRequest, NextResponse } from 'next/server';
import { PRETRAINED_PROFILES } from '@/app/lib/trainingProfiles';
import { analyzeScenario, buildReferenceProfiles, generateScenario11, calculateAccuracy, ScenarioAnalysis } from '@/app/lib/analyze';
export const runtime = 'edge';
export const runtime = 'nodejs';
console.log('=== ANALYZE ROUTE CALLED ===');
console.log('Request received');
export async function POST(request: NextRequest) {
  try {
    const { rows, allTrainingRows, allAnalyses } = await request.json();

    // Build reference profiles from ALL training data
    const referenceProfiles = allTrainingRows && allTrainingRows.length > 0
  ? buildReferenceProfiles(allTrainingRows)
  : PRETRAINED_PROFILES;

    // Analyze current scenario against reference profiles
    const analysis = analyzeScenario(rows, referenceProfiles);

    let geminiInsights = '';
    try {
      console.log('Starting Gemini call...');
      const refSummary = referenceProfiles
        ? referenceProfiles.map(r =>
            `${r.phase}: efficient reference = ${r.avgPower}W avg power, ${r.avgEnergy} Wh energy (learned from ${r.scenarioCount} training scenarios)`
          ).join('\n')
        : 'No reference profiles available';

      const deviations = analysis.phases
        .map(p => `${p.phase}: current=${p.avgPower}W, deviation=${p.powerDeviation}%, deviant=${p.isDeviant}, reason="${p.deviationReason}"`)
        .join('\n');

      const prompt = `You are EcoScope, an AI energy optimization assistant for ZEISS microscopes.

We analyzed scenario: ${analysis.scenarioName}
Total Energy: ${analysis.totalEnergyWh} Wh
Potential Saving: ${analysis.totalPotentialSavingWh} Wh (${analysis.savingPct}%)

LEARNED REFERENCE PROFILES (from S1-S12 training data):
${refSummary}

PHASE DEVIATIONS DETECTED (compared against learned reference):
${deviations}

PHASE DETAILS:
${analysis.phases.map(p => `
${p.phase}:
- Current avg power: ${p.avgPower}W
- Total energy: ${p.totalEnergy} Wh  
- Duration: ${Math.round(p.durationSec / 60)} minutes
- GPU Power: ${p.avgGpuPower}W
- Live View: ${Math.round(p.liveViewShare * 100)}% of time
- User Active: ${Math.round(p.userInteractingShare * 100)}% of time
- Inactivity: ${p.avgSecondsInactive} seconds
- Power deviation from reference: ${p.powerDeviation}%
`).join('')}

For ALL 4 phases, provide optimization recommendations. Use the reference profile deviations to justify each recommendation.

Format EXACTLY like this for each phase:
PHASE: [phase name]
PROBLEM: [specific deviation from reference - mention actual numbers]
ACTION: [SKIP or OPTIMIZE]
HOW: [concrete steps - 2 sentences max]
SAVING: [estimated Wh]
R-STRATEGY: [R1 Rethink / R2 Reduce / R3 Reuse / R4 Repair / R5 Refurbish]
---`;
const apiKey = process.env.GEMINI_API_KEY;
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      );
      const data = await response.json();
console.log('Full Gemini data:', JSON.stringify(data).slice(0, 500));
      
      geminiInsights = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      console.log('Gemini response length:', geminiInsights.length);
console.log('Gemini first 100 chars:', geminiInsights.slice(0, 100));
    } catch (e) {
     console.error('Gemini failed:', e);
  geminiInsights = 'AI recommendations unavailable: ' + String(e);
    }

    let scenario11 = null;
try {
  scenario11 = generateScenario11([analysis]);
} catch(e) {
  console.error('S11 error:', e);
}
try {
  analysis.accuracy = calculateAccuracy(rows, analysis.phases);
} catch (e) {
  console.error('Accuracy error:', e);
}
return NextResponse.json({ analysis, geminiInsights, scenario11, referenceProfiles });

  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}