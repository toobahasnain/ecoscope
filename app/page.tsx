'use client';

import { useState, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import { ScenarioAnalysis, getEnergyLabel } from './lib/analyze';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend
} from 'recharts';

const ZEISS_BLUE = '#003764';
const ZEISS_LIGHT = '#009FE3';
const PHASE_COLORS: Record<string, string> = {
  tile_scan_acquisition: '#009FE3',
  live_view_monitoring: '#F26522',
  processing: '#8DC63F',
  idle: '#ED1C24',
};

export default function Home() {
  const [scenarios, setScenarios] = useState<{ name: string; rows: Record<string, string>[] }[]>([]);
  const [trainingScenarios, setTrainingScenarios] = useState<Set<number>>(new Set());
  const [analyses, setAnalyses] = useState<ScenarioAnalysis[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [geminiInsights, setGeminiInsights] = useState<string>('');
  const [scenario11, setScenario11] = useState<ScenarioAnalysis | null>(null);
  const [referenceProfiles, setReferenceProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
 const [activeTab, setActiveTab] = useState<'overview' | 'phases' | 'waste' | 'ai' | 'scenario11' | 'compare' | 'accuracy'>('overview');
  const [whatIfOverlap, setWhatIfOverlap] = useState(20);
  const [whatIfIdle, setWhatIfIdle] = useState(25);
  const [chatOpen, setChatOpen] = useState(false);
const [chatMessages, setChatMessages] = useState<{role:'user'|'ai', text:string}[]>([]);
const [chatInput, setChatInput] = useState('');
const [chatLoading, setChatLoading] = useState(false);
useEffect(() => {
  const loadDefaultScenarios = async () => {
    const files = [
      { name: 'S13_low_priority_screening_mode_v4', url: '/data/S13_low_priority_screening_mode_v4.csv' },
      { name: 'S15_percentage_case_with_phase_assigned', url: '/data/S15_percentage_case_with_phase_assigned.csv' },
    ];

    const newScenarios: { name: string; rows: Record<string, string>[] }[] = [];

    for (const file of files) {
      try {
        const res = await fetch(file.url);
        const text = await res.text();
        const Papa = (await import('papaparse')).default;
        const result = Papa.parse(text, { header: true, skipEmptyLines: true });
        newScenarios.push({
          name: file.name,
          rows: result.data as Record<string, string>[]
        });
      } catch (e) {
        console.log('Could not load:', file.name);
      }
    }

    if (newScenarios.length > 0) {
      setScenarios(newScenarios);
      setTrainingScenarios(new Set());
    }
  };

  loadDefaultScenarios();
}, []);
const sendChatMessage = async (text: string) => {
  if (!text.trim() || chatLoading || !currentAnalysis) return;
  setChatMessages(prev => [...prev, {role:'user', text}]);
  setChatInput('');
  setChatLoading(true);

  try {
    const context = `
You are EcoScope AI assistant for ZEISS microscopes. You have been trained on 10 scenarios (S1-S10) and are now analyzing a test scenario.

TRAINING KNOWLEDGE (learned from S1-S10):
- tile_scan_acquisition efficient reference: 211.51W avg power, 491.41 Wh energy
- live_view_monitoring efficient reference: 181.97W avg power, 239.52 Wh energy  
- processing efficient reference: 194.34W avg power, 200.0 Wh energy
- idle efficient reference: 159.85W avg power, 271.14 Wh energy
- Most common waste: unattended live view, high idle power, excessive tile overlap
- Best scenario from training: S2 (low energy deferred batch) was most efficient overall

CURRENT TEST SCENARIO: ${currentAnalysis.scenarioName}
Total Energy: ${currentAnalysis.totalEnergyWh} Wh
Potential Saving: ${currentAnalysis.totalPotentialSavingWh} Wh (${currentAnalysis.savingPct}%)
Energy Label: ${currentAnalysis.energyLabel}
Phases: ${currentAnalysis.phases.map(p => `${p.phase}: ${p.totalEnergy} Wh, ${p.avgPower}W avg, saving ${p.potentialSavingWh} Wh`).join(' | ')}
Waste: ${currentAnalysis.wasteFlags.map(w => `${w.type}: ${w.description} (${w.rStrategy})`).join(' | ')}
Answer in 2-3 sentences. Be specific with numbers.`;
   const res = await fetch('/api/chat-eco', {
  method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({ message: text, context })
});
const data = await res.json();
const reply = data.response || 'Sorry, try again.';
    setChatMessages(prev => [...prev, {role:'ai', text: reply}]);
  } catch {
    setChatMessages(prev => [...prev, {role:'ai', text:'Something went wrong.'}]);
  }
  setChatLoading(false);
};
 
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList) => {
  setLoading(true);
  const newScenarios: { name: string; rows: Record<string, string>[] }[] = [];
  const newTrainingIndices = new Set<number>();

    for (const file of Array.from(files)) {
      await new Promise<void>(resolve => {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            newScenarios.push({
              name: file.name.replace('.csv', ''),
              rows: results.data as Record<string, string>[]
            });
            resolve();
          }
        });
      });
    }

  setScenarios(prev => {
  const startIdx = prev.length;
  newScenarios.forEach((_, i) => {
    const filename = Array.from(files)[i]?.name || '';
    const trainingPattern = /^s([1-9]|10)_/i;
const isTraining = false; // All uploads are test scenarios now
if (isTraining) {
      newTrainingIndices.add(startIdx + i);
    }
  });
  setTrainingScenarios(prevT => new Set([...prevT, ...newTrainingIndices]));
  return [...prev, ...newScenarios];
});
setLoading(false);
  };

  const analyzeScenario = async (idx: number) => {
  setLoading(true);
  setSelectedIdx(idx);
  setActiveTab('overview');
  setGeminiInsights('');

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
    rows: scenarios[idx].rows,

  allTrainingRows: scenarios
    .filter((_, i) => trainingScenarios.has(i))
    .map(s => s.rows.filter((_, ri) => ri % 15 === 0)),
  allAnalyses: [],
})
    });

    const data = await res.json();
    console.log('Full response:', data);
    setGeminiInsights(data.geminiInsights || '');
    setScenario11(data.scenario11);
if (data.referenceProfiles) setReferenceProfiles(data.referenceProfiles);
    setAnalyses(prev => {
      const updated = [...prev];
      const existing = updated.findIndex(a => a?.scenarioCode === data.analysis?.scenarioCode);
      if (existing >= 0) updated[existing] = data.analysis;
      else updated.push(data.analysis);
      return updated;
    });

} catch (e) {
  console.error('Analysis failed:', e);
  alert('Analysis failed: ' + String(e));
}
finally {
setLoading(false);}
};

const currentAnalysis = selectedIdx !== null
  ? analyses[analyses.length - 1]
  : null;

  const energyInfo = currentAnalysis ? getEnergyLabel(currentAnalysis.savingPct) : null;

  const whatIfSaving = currentAnalysis ? (() => {
    const base = currentAnalysis.totalEnergyWh;
    const overlapSaving = ((whatIfOverlap - 10) / 20) * base * 0.15;
    const idleSaving = (whatIfIdle / 100) * base * 0.20;
    return Math.round((overlapSaving + idleSaving) * 100) / 100;
  })() : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8', fontFamily: 'Inter, sans-serif' }}>

      {/* HEADER */}
      <header style={{ background: ZEISS_BLUE, padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ background: 'white', borderRadius: '6px', padding: '4px 12px', fontWeight: 900, fontSize: '18px', color: ZEISS_BLUE, letterSpacing: '2px' }}>ZEISS</div>
          <span style={{ color: 'white', fontSize: '18px', fontWeight: 600 }}>EcoScope Assistant</span>
          <span style={{ background: ZEISS_LIGHT, color: 'white', fontSize: '10px', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>Re_Make Hackathon 2026</span>
        </div>
        <div style={{ color: '#9FB8D0', fontSize: '12px' }}>Energy Smart AI — Usage-Phase Optimization</div>
      </header>

      <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>

        {/* SIDEBAR */}
        <aside style={{ width: '280px', background: 'white', borderRight: '1px solid #e2e8f0', padding: '20px', overflowY: 'auto', flexShrink: 0 }}>
          <div style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px' }}>Load Scenarios</p>
           <div style={{background:'#EFF6FF', borderRadius:'8px', padding:'10px 12px', marginBottom:'10px', border:`1px solid ${ZEISS_LIGHT}`}}>
  <p style={{fontSize:'11px', fontWeight:700, color:ZEISS_BLUE, margin:'0 0 2px'}}>✅ Pre-trained on S1–S10</p>
  <p style={{fontSize:'10px', color:'#64748b', margin:0}}>Reference profiles loaded. Just upload your test scenario.</p>
</div>
<button
  onClick={() => { setScenarios([]); setAnalyses([]); setSelectedIdx(null); setTrainingScenarios(new Set()); fileRef.current?.click(); }}
  style={{ width: '100%', padding: '10px', background: ZEISS_BLUE, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
  + Upload Test Scenario
</button>
<input ref={fileRef} type="file" multiple accept=".csv" style={{ display: 'none' }}
  onChange={e => e.target.files && handleFiles(e.target.files)} />
          </div>

          {scenarios.length > 0 && (
            <div>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px' }}>
                Scenarios ({scenarios.length})
              </p>
            {/* Training scenarios */}
{scenarios.some((_, i) => trainingScenarios.has(i)) && (
  <div style={{ marginBottom: '8px' }}>
    <p style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: ZEISS_BLUE, display: 'inline-block' }}></span>
      Training ({scenarios.filter((_, i) => trainingScenarios.has(i)).length})
    </p>
    {scenarios.map((s, i) => {
      if (!trainingScenarios.has(i)) return null;
      const sessionId = s.rows[0]?.session_id || '';
      const sCode = s.rows[0]?.scenario_code || sessionId.split('_')[1] || '';
      const analysis = analyses.find(a => a && a.scenarioCode === sCode || (a && a.scenarioName && a.scenarioName.includes(sCode)));
      const label = analysis ? getEnergyLabel(analysis.savingPct) : null;
      return (
        <div key={i} style={{ marginBottom: '6px' }}>
  <div style={{ padding: '10px 12px', borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FFF5F5', border: `1px solid #FECACA`, borderBottom: 'none' }}>
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <p style={{ fontSize: '12px', fontWeight: 700, color: '#DC2626', margin: 0 }}>{sCode}</p>
        <span style={{ fontSize: '9px', background: '#DC2626', color: 'white', padding: '1px 5px', borderRadius: '3px', fontWeight: 700 }}>TEST</span>
      </div>
      <p style={{ fontSize: '10px', color: '#64748b', margin: '2px 0 0' }}>{s.rows.length} rows</p>
    </div>
    {label && <span style={{ background: label.color, color: 'white', fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px' }}>{label.label}</span>}
  </div>
  <button
    onClick={() => analyzeScenario(i)}
    disabled={loading}
    style={{ width: '100%', padding: '8px', background: selectedIdx === i ? '#DC2626' : ZEISS_BLUE, color: 'white', border: 'none', borderRadius: '0 0 8px 8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
    {loading && selectedIdx === i ? '⚡ Analyzing...' : '▶ Analyze'}
  </button>
</div>
      );
    })}
  </div>
)}

{/* Test scenarios */}
{scenarios.some((_, i) => !trainingScenarios.has(i)) && (
  <div>
    <p style={{ fontSize: '10px', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#DC2626', display: 'inline-block' }}></span>
      Test Scenario ({scenarios.filter((_, i) => !trainingScenarios.has(i)).length})
    </p>
    {scenarios.map((s, i) => {
      if (trainingScenarios.has(i)) return null;
      const sessionId = s.rows[0]?.session_id || '';
      const sCode = s.rows[0]?.scenario_code || sessionId.split('_')[1] || '';
      const analysis = analyses.filter(Boolean).find(a => a?.scenarioCode === sCode || a?.scenarioName?.includes(sCode));
      const label = analysis ? getEnergyLabel(analysis.savingPct) : null;
      return (
        <div key={i} onClick={() => analyzeScenario(i)}
          style={{ padding: '10px 12px', borderRadius: '8px', marginBottom: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: selectedIdx === i ? '#FFF5F5' : '#FFF5F5', border: selectedIdx === i ? `2px solid #DC2626` : `1px solid #FECACA`, transition: 'all 0.2s' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <p style={{ fontSize: '12px', fontWeight: 700, color: '#DC2626', margin: 0 }}>{sCode}</p>
              <span style={{ fontSize: '9px', background: '#DC2626', color: 'white', padding: '1px 5px', borderRadius: '3px', fontWeight: 700 }}>TEST</span>
            </div>
            <p style={{ fontSize: '10px', color: '#64748b', margin: '2px 0 0' }}>{s.rows.length} rows</p>
          </div>
          {label && <span style={{ background: label.color, color: 'white', fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px' }}>{label.label}</span>}
        </div>
      );
    })}
  </div>
)}
            </div>
          )}
          {/* Show learned reference profiles */}
{referenceProfiles.length > 0 && (
  <div style={{marginTop:'16px', borderTop:'1px solid #e2e8f0', paddingTop:'16px'}}>
    <p style={{fontSize:'10px', fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'1px', margin:'0 0 8px'}}>
      Learned Reference Profiles
    </p>
    <p style={{fontSize:'10px', color:'#94a3b8', margin:'0 0 8px', lineHeight:1.5}}>
      Learned from {scenarios.filter((_,i) => trainingScenarios.has(i)).length} training scenarios
    </p>
    {referenceProfiles.map(ref => (
      <div key={ref.phase} style={{background:'#f8fafc', borderRadius:'6px', padding:'8px 10px', marginBottom:'6px', borderLeft:`3px solid ${PHASE_COLORS[ref.phase] || '#64748b'}`}}>
        <p style={{fontSize:'10px', fontWeight:700, color:ZEISS_BLUE, margin:'0 0 4px'}}>
          {ref.phase.split('_')[0].toUpperCase()}
        </p>
        <p style={{fontSize:'10px', color:'#64748b', margin:'0 0 2px'}}>Avg Power: {ref.avgPower}W</p>
        <p style={{fontSize:'10px', color:'#64748b', margin:'0 0 2px'}}>Avg Energy: {ref.avgEnergy} Wh</p>
        <p style={{fontSize:'10px', color:'#64748b', margin:0}}>From {ref.scenarioCount} scenarios</p>
      </div>
    ))}
  </div>
)}

          {scenario11 && (
            <div style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
              <div onClick={() => { setSelectedIdx(null); setActiveTab('scenario11'); }}
                style={{ padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', background: 'linear-gradient(135deg, #003764, #009FE3)', color: 'white' }}>
                <p style={{ fontSize: '12px', fontWeight: 700, margin: 0 }}>⚡ Scenario 11</p>
                <p style={{ fontSize: '10px', margin: '2px 0 0', opacity: 0.8 }}>AI-Generated Golden Workflow</p>
              </div>
            </div>
          )}
        </aside>

        {/* MAIN */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

          {!currentAnalysis && activeTab !== 'scenario11' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔬</div>
              <h2 style={{ fontSize: '24px', fontWeight: 700, color: ZEISS_BLUE, margin: '0 0 8px' }}>EcoScope Assistant</h2>
              <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '400px' }}>Upload your scenario CSV files and click a scenario to analyze energy waste and get AI-powered recommendations.</p>
              {loading && <p style={{ color: ZEISS_LIGHT, marginTop: '16px', fontWeight: 600 }}>Analyzing...</p>}
            </div>
          )}

          {currentAnalysis && activeTab !== 'scenario11' && (
            <div>
              {/* Scenario header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h1 style={{ fontSize: '22px', fontWeight: 700, color: ZEISS_BLUE, margin: 0 }}>{currentAnalysis.scenarioCode} — {currentAnalysis.scenarioName.replace(/_/g, ' ')}</h1>
                  <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>{currentAnalysis.phases.reduce((s, p) => s + p.rowCount, 0)} data points across {currentAnalysis.phases.length} phases</p>
                </div>
                {energyInfo && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: energyInfo.color, color: 'white', padding: '8px 20px', borderRadius: '8px', textAlign: 'center' }}>
                      <p style={{ fontSize: '28px', fontWeight: 900, margin: 0, lineHeight: 1 }}>{energyInfo.label}</p>
                      <p style={{ fontSize: '10px', margin: '2px 0 0', opacity: 0.9 }}>{energyInfo.description}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Metric cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                {[
                  { label: 'Total Energy', value: `${currentAnalysis.totalEnergyWh} Wh`, color: ZEISS_BLUE },
                  { label: 'Potential Saving', value: `${currentAnalysis.totalPotentialSavingWh} Wh`, color: '#8DC63F' },
                  { label: 'Saving %', value: `${currentAnalysis.savingPct}%`, color: '#F26522' },
                  { label: 'Waste Flags', value: `${currentAnalysis.wasteFlags.length}`, color: '#ED1C24' },
                ].map(card => (
                  <div key={card.label} style={{ background: 'white', borderRadius: '10px', padding: '16px', borderTop: `3px solid ${card.color}` }}>
                    <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 4px', fontWeight: 600 }}>{card.label}</p>
                    <p style={{ fontSize: '22px', fontWeight: 700, color: card.color, margin: 0 }}>{card.value}</p>
                  </div>
                ))}
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'white', padding: '4px', borderRadius: '10px', width: 'fit-content' }}>
                {(['overview', 'phases', 'waste', 'ai', 'compare', 'accuracy'] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, background: activeTab === tab ? ZEISS_BLUE : 'transparent', color: activeTab === tab ? 'white' : '#64748b', transition: 'all 0.2s', textTransform: 'capitalize' }}>
                    {tab === 'ai' ? '🤖 AI Insights' : tab === 'compare' ? '📊 Baseline vs Improved' : tab === 'accuracy' ? '🎯 Accuracy' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              {/* Overview tab */}
              {activeTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div style={{ background: 'white', borderRadius: '12px', padding: '20px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, color: ZEISS_BLUE, margin: '0 0 16px' }}>Energy by Phase (Wh)</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={currentAnalysis.phases.map(p => ({ name: p.phase.replace('_', ' '), energy: p.totalEnergy, saving: p.potentialSavingWh }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="energy" fill={ZEISS_BLUE} name="Energy (Wh)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="saving" fill="#8DC63F" name="Potential Saving (Wh)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ background: 'white', borderRadius: '12px', padding: '20px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, color: ZEISS_BLUE, margin: '0 0 16px' }}>Phase Performance Radar</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <RadarChart data={currentAnalysis.phases.map(p => ({ phase: p.phase.split('_')[0], cpu: p.avgCpuPct, gpu: p.avgGpuPower, power: p.avgPower / 3 }))}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="phase" tick={{ fontSize: 10 }} />
                        <PolarRadiusAxis tick={{ fontSize: 9 }} />
                        <Radar name="CPU %" dataKey="cpu" stroke={ZEISS_BLUE} fill={ZEISS_BLUE} fillOpacity={0.2} />
                        <Radar name="GPU Power" dataKey="gpu" stroke={ZEISS_LIGHT} fill={ZEISS_LIGHT} fillOpacity={0.2} />
                        <Legend />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* What-if simulator */}
                  <div style={{ background: 'white', borderRadius: '12px', padding: '20px', gridColumn: '1 / -1' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 700, color: ZEISS_BLUE, margin: '0 0 4px' }}>⚡ What-If Simulator</h3>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 16px' }}>Adjust parameters and see estimated energy savings instantly</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>Tile Overlap: {whatIfOverlap}%</label>
                        <input type="range" min={5} max={30} value={whatIfOverlap} onChange={e => setWhatIfOverlap(Number(e.target.value))}
                          style={{ width: '100%', marginTop: '8px' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>Idle Reduction Target: {whatIfIdle}%</label>
                        <input type="range" min={0} max={60} value={whatIfIdle} onChange={e => setWhatIfIdle(Number(e.target.value))}
                          style={{ width: '100%', marginTop: '8px' }} />
                      </div>
                    </div>
                    <div style={{ marginTop: '16px', background: '#f0f9ff', borderRadius: '8px', padding: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '24px' }}>💡</span>
                      <div>
                        <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: ZEISS_BLUE }}>Estimated saving: {whatIfSaving} Wh</p>
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>Based on current scenario parameters</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

{activeTab === 'phases' && (
  <div style={{ display: 'grid', gap: '16px' }}>
    <div style={{ background: 'white', borderRadius: '12px', padding: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '13px', color: '#64748b' }}>📊 Each phase is compared against the most efficient phase in training data. </span>
      <span style={{ background: '#F0FDF4', color: '#059669', fontSize: '12px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>✅ Efficient</span>
      <span style={{ background: '#FEF3C7', color: '#D97706', fontSize: '12px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>⚠️ Above Average</span>
      <span style={{ background: '#FEE2E2', color: '#DC2626', fontSize: '12px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>🔴 High Waste</span>
    </div>

    {currentAnalysis.phases.map(phase => {
      const maxEnergy = Math.max(...currentAnalysis.phases.map(p => p.totalEnergy));
      const energyPct = Math.round((phase.totalEnergy / maxEnergy) * 100);
      const isHighWaste = phase.potentialSavingWh > phase.totalEnergy * 0.2;
      const isAboveAvg = phase.potentialSavingWh > phase.totalEnergy * 0.1;
      const statusColor = isHighWaste ? '#DC2626' : isAboveAvg ? '#D97706' : '#059669';
      const statusBg = isHighWaste ? '#FEE2E2' : isAboveAvg ? '#FEF3C7' : '#F0FDF4';
      const statusLabel = isHighWaste ? '🔴 High Waste' : isAboveAvg ? '⚠️ Above Average' : '✅ Efficient';

      return (
        <div key={phase.phase} style={{ background: 'white', borderRadius: '12px', padding: '20px', borderLeft: `4px solid ${PHASE_COLORS[phase.phase] || '#64748b'}` }}>
          
          {/* Phase header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: ZEISS_BLUE, margin: 0 }}>
                {phase.phase === 'tile_scan_acquisition' ? '🔬 Tile Scan Acquisition' :
                 phase.phase === 'live_view_monitoring' ? '📺 Live View Monitoring' :
                 phase.phase === 'processing' ? '⚙️ Processing' : '💤 Idle'}
              </h3>
              <span style={{ background: statusBg, color: statusColor, fontSize: '11px', padding: '2px 10px', borderRadius: '20px', fontWeight: 600 }}>{statusLabel}</span>
            </div>
            <span style={{ background: PHASE_COLORS[phase.phase] || '#64748b', color: 'white', fontSize: '11px', padding: '3px 10px', borderRadius: '20px' }}>
              {phase.recommendedAction === 'no_action' ? '✅ No Action Needed' : phase.recommendedAction.replace(/_/g, ' ')}
            </span>
          </div>

          {/* Energy bar */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Energy consumption</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: statusColor }}>{phase.totalEnergy} Wh</span>
            </div>
            <div style={{ background: '#f0f4f8', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
              <div style={{ width: `${energyPct}%`, height: '100%', background: statusColor, borderRadius: '4px', transition: 'width 0.5s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
              <span style={{ fontSize: '10px', color: '#64748b' }}>0 Wh</span>
              <span style={{ fontSize: '10px', color: '#64748b' }}>{maxEnergy} Wh (max)</span>
            </div>
          </div>

          {/* Key metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '12px' }}>
            {[
              { label: '⚡ Avg Power', value: `${phase.avgPower}W`, highlight: phase.avgPower > 200 },
              { label: '💾 Potential Saving', value: `${phase.potentialSavingWh} Wh`, highlight: true, positive: true },
              { label: '🖥️ GPU Power', value: `${phase.avgGpuPower}W`, highlight: phase.avgGpuPower > 50 },
              { label: '⏱️ Duration', value: `${Math.round(phase.durationSec / 60)} min`, highlight: false },
              { label: '👤 User Active', value: `${Math.round(phase.userInteractingShare * 100)}%`, highlight: phase.userInteractingShare < 0.2 },
              { label: '📹 Live View', value: `${Math.round(phase.liveViewShare * 100)}%`, highlight: phase.liveViewShare > 0.7 && phase.userInteractingShare < 0.3 },
            ].map(m => (
              <div key={m.label} style={{ background: m.highlight ? (m.positive ? '#F0FDF4' : '#FEF3C7') : '#f8fafc', borderRadius: '8px', padding: '10px 12px', border: m.highlight ? `1px solid ${m.positive ? '#BBF7D0' : '#FDE68A'}` : '1px solid transparent' }}>
                <p style={{ fontSize: '10px', color: '#64748b', margin: '0 0 2px' }}>{m.label}</p>
                <p style={{ fontSize: '15px', fontWeight: 700, color: m.highlight ? (m.positive ? '#059669' : '#D97706') : '#1e293b', margin: 0 }}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* What this means */}
          <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px 14px' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', margin: '0 0 4px', textTransform: 'uppercase' }}>What this means</p>
            <p style={{ fontSize: '13px', color: '#374151', margin: 0, lineHeight: 1.5 }}>
              {phase.phase === 'idle' && phase.avgPower > 100
                ? `⚠️ Machine is consuming ${phase.avgPower}W while doing nothing. Auto-standby could save ${phase.potentialSavingWh} Wh.`
                : phase.phase === 'live_view_monitoring' && phase.userInteractingShare < 0.3
                ? `⚠️ Live view was active but user was only interacting ${Math.round(phase.userInteractingShare * 100)}% of the time. Disabling unattended live view saves ${phase.potentialSavingWh} Wh.`
                : phase.phase === 'tile_scan_acquisition' && phase.avgTileOverlap > 18
                ? `⚠️ Tile overlap at ${phase.avgTileOverlap}% is higher than needed. Reducing to 10% saves scan time and ${phase.potentialSavingWh} Wh.`
                : `✅ This phase is operating within efficient parameters. Potential saving of ${phase.potentialSavingWh} Wh still available through minor optimizations.`
              }
            </p>
          </div>
        </div>
      );
    })}
  </div>
)}

              {/* Waste tab */}
              {activeTab === 'waste' && (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {currentAnalysis.wasteFlags.length === 0 && (
                    <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center' }}>
                      <p style={{ fontSize: '40px', margin: '0 0 12px' }}>✅</p>
                      <p style={{ fontSize: '16px', fontWeight: 600, color: '#059669' }}>No significant waste detected!</p>
                    </div>
                  )}
                  {currentAnalysis.wasteFlags.map((flag, i) => (
                    <div key={i} style={{ background: 'white', borderRadius: '12px', padding: '20px', borderLeft: `4px solid ${flag.severity === 'high' ? '#ED1C24' : flag.severity === 'medium' ? '#F26522' : '#FFED00'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '18px' }}>{flag.severity === 'high' ? '🔴' : flag.severity === 'medium' ? '🟠' : '🟡'}</span>
                        <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', margin: 0 }}>{flag.type}</h3>
                        <span style={{ background: '#EFF6FF', color: ZEISS_BLUE, fontSize: '10px', padding: '2px 8px', borderRadius: '20px', fontWeight: 600 }}>{flag.rStrategy}</span>
                        <span style={{ marginLeft: 'auto', background: '#F0FDF4', color: '#059669', fontSize: '11px', padding: '2px 8px', borderRadius: '20px', fontWeight: 600 }}>Saving: {flag.saving}</span>
                      </div>
                      <p style={{ fontSize: '13px', color: '#374151', margin: '0 0 4px' }}>{flag.description}</p>
                      <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>Phase: {flag.phase.replace(/_/g, ' ')}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* AI Insights tab */}
              {activeTab === 'ai' && (
  <div style={{ background: 'white', borderRadius: '12px', padding: '24px' }}>
    <h3 style={{ fontSize: '15px', fontWeight: 700, color: ZEISS_BLUE, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
      🤖 AI Phase Optimization Recommendations
    </h3>
    {loading ? (
      <p style={{ color: ZEISS_LIGHT }}>Generating AI insights...</p>
    ) : (
      <div style={{ display: 'grid', gap: '16px' }}>
        {geminiInsights.split('---').filter(block => block.trim()).map((block, i) => {
          const lines = block.trim().split('\n').filter(l => l.trim());
          const phase = lines.find(l => l.startsWith('PHASE:'))?.replace('PHASE:', '').trim() || '';
          const problem = lines.find(l => l.startsWith('PROBLEM:'))?.replace('PROBLEM:', '').trim() || '';
          const action = lines.find(l => l.startsWith('ACTION:'))?.replace('ACTION:', '').trim() || '';
          const how = lines.find(l => l.startsWith('HOW:'))?.replace('HOW:', '').trim() || '';
          const saving = lines.find(l => l.startsWith('SAVING:'))?.replace('SAVING:', '').trim() || '';
          const rStrategy = lines.find(l => l.startsWith('R-STRATEGY:'))?.replace('R-STRATEGY:', '').trim() || '';

          if (!phase) return null;

          const isSkip = action === 'SKIP';
          const actionColor = isSkip ? '#DC2626' : '#D97706';

          return (
            <div key={i} style={{ background: '#f8fafc', borderRadius: '12px', padding: '20px', border: `1px solid ${isSkip ? '#FEE2E2' : '#FEF3C7'}`, borderTop: `4px solid ${actionColor}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <span style={{ background: PHASE_COLORS[phase] || '#64748b', color: 'white', fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: 700 }}>
                  {phase.replace(/_/g, ' ').toUpperCase()}
                </span>
                <span style={{ background: isSkip ? '#FEE2E2' : '#FEF3C7', color: actionColor, fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: 700, border: `1px solid ${actionColor}` }}>
                  {isSkip ? '⏭ SKIP THIS PHASE' : '⚡ OPTIMIZE THIS PHASE'}
                </span>
                {saving && (
                  <span style={{ background: '#F0FDF4', color: '#059669', fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: 700, marginLeft: 'auto' }}>
                    💚 Save {saving}
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gap: '8px' }}>
                <div style={{ background: 'white', borderRadius: '8px', padding: '10px 14px' }}>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', margin: '0 0 4px', textTransform: 'uppercase' }}>Problem</p>
                  <p style={{ fontSize: '13px', color: '#374151', margin: 0, lineHeight: 1.5 }}>⚠️ {problem}</p>
                </div>

                <div style={{ background: 'white', borderRadius: '8px', padding: '10px 14px' }}>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', margin: '0 0 4px', textTransform: 'uppercase' }}>{isSkip ? 'How to Skip' : 'How to Optimize'}</p>
                  <p style={{ fontSize: '13px', color: '#374151', margin: 0, lineHeight: 1.5 }}>✅ {how}</p>
                </div>

                {rStrategy && (
                  <div style={{ background: '#EFF6FF', borderRadius: '8px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: ZEISS_BLUE }}>🌱 {rStrategy}</span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Circular Economy Strategy</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
)}
           
         
{activeTab === 'compare' && currentAnalysis && (
  <div style={{display:'grid', gap:'20px'}}>
    <div style={{background:'white', borderRadius:'12px', padding:'20px'}}>
      <h3 style={{fontSize:'16px', fontWeight:700, color:ZEISS_BLUE, margin:'0 0 4px'}}>📊 Baseline vs Improved</h3>
      <p style={{fontSize:'12px', color:'#64748b', margin:'0 0 20px'}}>Current workflow compared against optimized scenario applying all recommendations</p>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'20px'}}>
        <div style={{background:'#FEF2F2', borderRadius:'10px', padding:'16px', border:'1px solid #FECACA'}}>
          <p style={{fontSize:'11px', fontWeight:700, color:'#DC2626', margin:'0 0 8px', textTransform:'uppercase'}}>🔴 Baseline (Current)</p>
          <p style={{fontSize:'28px', fontWeight:900, color:'#DC2626', margin:'0 0 4px'}}>{currentAnalysis.totalEnergyWh} Wh</p>
          <p style={{fontSize:'12px', color:'#64748b', margin:0}}>Total energy consumed</p>
          <p style={{fontSize:'14px', fontWeight:700, color:'#DC2626', margin:'8px 0 0'}}>Label: {currentAnalysis.energyLabel}</p>
        </div>
        <div style={{background:'#F0FDF4', borderRadius:'10px', padding:'16px', border:'1px solid #BBF7D0'}}>
          <p style={{fontSize:'11px', fontWeight:700, color:'#059669', margin:'0 0 8px', textTransform:'uppercase'}}>✅ Improved (After Optimization)</p>
          <p style={{fontSize:'28px', fontWeight:900, color:'#059669', margin:'0 0 4px'}}>{(currentAnalysis.totalEnergyWh - currentAnalysis.totalPotentialSavingWh).toFixed(2)} Wh</p>
          <p style={{fontSize:'12px', color:'#64748b', margin:0}}>After applying all recommendations</p>
          <p style={{fontSize:'14px', fontWeight:700, color:'#059669', margin:'8px 0 0'}}>Label: A+</p>
        </div>
      </div>

      <div style={{background:'#EFF6FF', borderRadius:'10px', padding:'16px', marginBottom:'20px', textAlign:'center'}}>
        <p style={{fontSize:'14px', color:'#64748b', margin:'0 0 4px'}}>Total Energy Saving</p>
        <p style={{fontSize:'36px', fontWeight:900, color:ZEISS_BLUE, margin:'0 0 4px'}}>{currentAnalysis.totalPotentialSavingWh} Wh</p>
        <p style={{fontSize:'14px', color:'#059669', fontWeight:700, margin:0}}>↓ {currentAnalysis.savingPct}% reduction — equivalent to {Math.round(currentAnalysis.totalPotentialSavingWh / 100)} hours of laptop usage</p>
      </div>

      <div style={{display:'grid', gap:'10px'}}>
        <p style={{fontSize:'13px', fontWeight:700, color:'#374151', margin:0}}>Phase-by-phase comparison:</p>
        {currentAnalysis.phases.map(phase => {
          const improved = phase.totalEnergy - phase.potentialSavingWh;
          const pct = Math.round((phase.potentialSavingWh / phase.totalEnergy) * 100);
          return (
            <div key={phase.phase} style={{background:'#f8fafc', borderRadius:'8px', padding:'12px 16px'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px'}}>
                <span style={{fontSize:'13px', fontWeight:600, color:'#1e293b'}}>{phase.phase.replace(/_/g, ' ').toUpperCase()}</span>
                <span style={{fontSize:'12px', color:'#059669', fontWeight:700}}>Save {pct}% — {phase.potentialSavingWh} Wh</span>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px'}}>
                <div>
                  <p style={{fontSize:'10px', color:'#DC2626', margin:'0 0 2px', fontWeight:600}}>BASELINE</p>
                  <div style={{background:'#FEE2E2', borderRadius:'4px', height:'8px'}}>
                    <div style={{width:'100%', height:'100%', background:'#DC2626', borderRadius:'4px'}}/>
                  </div>
                  <p style={{fontSize:'11px', color:'#DC2626', margin:'2px 0 0', fontWeight:600}}>{phase.totalEnergy} Wh</p>
                </div>
                <div>
                  <p style={{fontSize:'10px', color:'#059669', margin:'0 0 2px', fontWeight:600}}>IMPROVED</p>
                  <div style={{background:'#DCFCE7', borderRadius:'4px', height:'8px'}}>
                    <div style={{width:`${Math.max(10, 100 - pct)}%`, height:'100%', background:'#059669', borderRadius:'4px'}}/>
                  </div>
                  <p style={{fontSize:'11px', color:'#059669', margin:'2px 0 0', fontWeight:600}}>{improved.toFixed(2)} Wh</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
)}

{activeTab === 'accuracy' && currentAnalysis?.accuracy && (
  <div style={{display:'grid', gap:'20px'}}>
    
    {/* Overall accuracy card */}
    {currentAnalysis.accuracy.overall === -1 ? (
  <div style={{background:'white', borderRadius:'12px', padding:'24px', textAlign:'center', border:`3px solid ${ZEISS_LIGHT}`}}>
    <p style={{fontSize:'13px', color:'#64748b', margin:'0 0 8px', fontWeight:600, textTransform:'uppercase'}}>Prediction Mode</p>
    <p style={{fontSize:'48px', margin:'0 0 8px'}}>🎯</p>
    <p style={{fontSize:'20px', fontWeight:700, color:ZEISS_BLUE, margin:'0 0 8px'}}>Unlabeled Test Scenario</p>
    <p style={{fontSize:'14px', color:'#64748b', margin:'0 0 8px'}}>This scenario has no ground truth labels — our system is generating predictions from scratch based on patterns learned from S1-S10 training data.</p>
    <div style={{background:'#EFF6FF', borderRadius:'8px', padding:'12px', marginTop:'12px'}}>
      <p style={{fontSize:'13px', color:ZEISS_BLUE, fontWeight:600, margin:0}}>✅ This is real-world mode — exactly how EcoScope works in production</p>
    </div>
    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'10px', marginTop:'16px'}}>
      {currentAnalysis.phases.map(p => (
        <div key={p.phase} style={{background:'#f8fafc', borderRadius:'8px', padding:'12px', borderLeft:`3px solid ${PHASE_COLORS[p.phase] || '#64748b'}`}}>
          <p style={{fontSize:'10px', color:'#64748b', margin:'0 0 4px'}}>{p.phase.replace(/_/g, ' ')}</p>
          <p style={{fontSize:'13px', fontWeight:700, color:ZEISS_BLUE, margin:0}}>{p.recommendedAction.replace(/_/g, ' ')}</p>
        </div>
      ))}
    </div>
  </div>
) : (
  <div style={{background:'white', borderRadius:'12px', padding:'24px', textAlign:'center', border:`3px solid ${currentAnalysis.accuracy.overall >= 80 ? '#059669' : currentAnalysis.accuracy.overall >= 60 ? '#D97706' : '#DC2626'}`}}>
    <p style={{fontSize:'13px', color:'#64748b', margin:'0 0 8px', fontWeight:600, textTransform:'uppercase'}}>Overall System Accuracy</p>
    <p style={{fontSize:'72px', fontWeight:900, color: currentAnalysis.accuracy.overall >= 80 ? '#059669' : currentAnalysis.accuracy.overall >= 60 ? '#D97706' : '#DC2626', margin:'0 0 8px', lineHeight:1}}>
      {currentAnalysis.accuracy.overall}%
    </p>
    <p style={{fontSize:'14px', color:'#64748b', margin:0}}>
      {currentAnalysis.accuracy.correct} correct predictions out of {currentAnalysis.accuracy.total} rows
    </p>
    <p style={{fontSize:'12px', color:'#94a3b8', margin:'8px 0 0'}}>
      {currentAnalysis.accuracy.overall >= 80 ? '✅ High reliability — model learned well from training data' :
       currentAnalysis.accuracy.overall >= 60 ? '⚠️ Moderate reliability — some phases need improvement' :
       '❌ Low reliability — consider adjusting thresholds'}
    </p>
  </div>
  )}


    {/* Per phase accuracy */}
    <div style={{background:'white', borderRadius:'12px', padding:'20px'}}>
      <h3 style={{fontSize:'15px', fontWeight:700, color:ZEISS_BLUE, margin:'0 0 16px'}}>Accuracy by Phase</h3>
      <div style={{display:'grid', gap:'12px'}}>
        {currentAnalysis.accuracy.byPhase.map(p => (
          <div key={p.phase} style={{background:'#f8fafc', borderRadius:'8px', padding:'14px 16px'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px'}}>
              <span style={{fontSize:'13px', fontWeight:600, color:'#1e293b'}}>
                {p.phase === 'tile_scan_acquisition' ? '🔬 Tile Scan Acquisition' :
                 p.phase === 'live_view_monitoring' ? '📺 Live View Monitoring' :
                 p.phase === 'processing' ? '⚙️ Processing' : '💤 Idle'}
              </span>
              <span style={{fontSize:'16px', fontWeight:900, color: p.accuracy >= 80 ? '#059669' : p.accuracy >= 60 ? '#D97706' : '#DC2626'}}>
                {p.accuracy}%
              </span>
            </div>
            <div style={{background:'#e2e8f0', borderRadius:'4px', height:'8px', overflow:'hidden'}}>
              <div style={{width:`${p.accuracy}%`, height:'100%', background: p.accuracy >= 80 ? '#059669' : p.accuracy >= 60 ? '#D97706' : '#DC2626', borderRadius:'4px', transition:'width 0.5s'}}/>
            </div>
            <p style={{fontSize:'11px', color:'#64748b', margin:'4px 0 0'}}>{p.correct} / {p.total} rows correct</p>
          </div>
        ))}
      </div>
    </div>
</div>
)}
            
    {/* Confusion summary */}
    <div style={{background:'white', borderRadius:'12px', padding:'20px'}}>
      <h3 style={{fontSize:'15px', fontWeight:700, color:ZEISS_BLUE, margin:'0 0 8px'}}>Prediction Analysis</h3>
      <p style={{fontSize:'12px', color:'#64748b', margin:'0 0 16px'}}>What the system predicted vs what the data says</p>
      <div style={{display:'grid', gap:'8px'}}>
        {currentAnalysis.accuracy.confusionSummary.map((item, i) => (
          <div key={i} style={{display:'flex', alignItems:'center', gap:'12px', background:'#f8fafc', borderRadius:'8px', padding:'10px 14px'}}>
            <span style={{fontSize:'18px'}}>{item.predicted === item.actual ? '✅' : '❌'}</span>
            <div style={{flex:1}}>
              <p style={{fontSize:'12px', margin:0, color:'#374151'}}>
                <span style={{fontWeight:700}}>Predicted:</span> {item.predicted.replace(/_/g, ' ')}
                {' → '}
                <span style={{fontWeight:700}}>Actual:</span> {item.actual.replace(/_/g, ' ')}
              </p>
            </div>
            <span style={{background: item.predicted === item.actual ? '#F0FDF4' : '#FEF2F2', color: item.predicted === item.actual ? '#059669' : '#DC2626', fontSize:'12px', fontWeight:700, padding:'2px 10px', borderRadius:'20px'}}>
              {item.count} rows
            </span>
          </div>
        ))}
      </div>
    </div>

    {/* Explanation for judges */}
    <div style={{background:'#EFF6FF', borderRadius:'12px', padding:'20px', border:`1px solid ${ZEISS_LIGHT}`}}>
      <h3 style={{fontSize:'14px', fontWeight:700, color:ZEISS_BLUE, margin:'0 0 8px'}}>📊 How to interpret this</h3>
      <p style={{fontSize:'13px', color:'#374151', margin:'0 0 8px', lineHeight:1.6}}>
        Our system learned action rules from S1-S10 training scenarios. For each phase, it predicts what action should be taken. This accuracy score shows how well those learned rules match the ground truth labels in the CSV data.
      </p>
      <p style={{fontSize:'13px', color:'#374151', margin:0, lineHeight:1.6}}>
        <strong>High accuracy</strong> means the training data successfully taught the system what efficient vs wasteful behavior looks like — and the system can reliably detect it in new scenarios.
      </p>
    </div>
  </div>)}

      {/* Scenario 11 */}
          {activeTab === 'scenario11' && scenario11 && (
            <div>
              <div style={{ background: `linear-gradient(135deg, ${ZEISS_BLUE}, ${ZEISS_LIGHT})`, borderRadius: '16px', padding: '28px', color: 'white', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '32px' }}>⚡</span>
                  <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 900, margin: 0 }}>Scenario 11 — AI-Generated Golden Workflow</h1>
                    <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: '13px' }}>The most efficient possible workflow — assembled by AI from the best phases across all analyzed scenarios</p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '20px' }}>
                  <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                    <p style={{ fontSize: '24px', fontWeight: 900, margin: 0 }}>{scenario11.totalEnergyWh} Wh</p>
                    <p style={{ fontSize: '11px', margin: '4px 0 0', opacity: 0.8 }}>Total Energy</p>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                    <p style={{ fontSize: '24px', fontWeight: 900, margin: 0 }}>{scenario11.savingPct}%</p>
                    <p style={{ fontSize: '11px', margin: '4px 0 0', opacity: 0.8 }}>Waste Reduction</p>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                    <p style={{ fontSize: '24px', fontWeight: 900, margin: 0 }}>A++</p>
                    <p style={{ fontSize: '11px', margin: '4px 0 0', opacity: 0.8 }}>Energy Label</p>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '12px' }}>
                {scenario11.phases.map(phase => (
                  <div key={phase.phase} style={{ background: 'white', borderRadius: '12px', padding: '20px', borderLeft: `4px solid ${PHASE_COLORS[phase.phase] || '#64748b'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: 700, color: ZEISS_BLUE, margin: 0 }}>{phase.phase.replace(/_/g, ' ').toUpperCase()}</h3>
                      <span style={{ background: '#F0FDF4', color: '#059669', fontSize: '11px', padding: '2px 10px', borderRadius: '20px', fontWeight: 600 }}>Best from training data</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                      {[
                        { label: 'Avg Power', value: `${phase.avgPower}W` },
                        { label: 'Total Energy', value: `${phase.totalEnergy} Wh` },
                        { label: 'GPU Power', value: `${phase.avgGpuPower}W` },
                        { label: 'CPU %', value: `${phase.avgCpuPct}%` },
                      ].map(m => (
                        <div key={m.label} style={{ background: '#f8fafc', borderRadius: '6px', padding: '8px 10px' }}>
                          <p style={{ fontSize: '10px', color: '#64748b', margin: '0 0 2px' }}>{m.label}</p>
                          <p style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', margin: 0 }}>{m.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
       
{/* CHATBOT */}
<div style={{position:'fixed', bottom:'24px', right:'24px', zIndex:100}}>
  {chatOpen && (
    <div style={{width:'340px', height:'460px', background:'white', borderRadius:'16px', boxShadow:'0 20px 60px rgba(0,0,0,0.15)', display:'flex', flexDirection:'column', marginBottom:'12px', border:`1px solid #e2e8f0`}}>
      <div style={{background:ZEISS_BLUE, padding:'14px 16px', borderRadius:'16px 16px 0 0', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
          <span style={{fontSize:'18px'}}>🔬</span>
          <div>
            <p style={{color:'white', fontWeight:700, fontSize:'13px', margin:0}}>EcoScope Assistant</p>
            <p style={{color:'#9FB8D0', fontSize:'10px', margin:0}}>Ask about energy data</p>
          </div>
        </div>
        <button onClick={() => setChatOpen(false)} style={{background:'transparent', border:'none', color:'white', cursor:'pointer', fontSize:'18px'}}>✕</button>
      </div>

      <div style={{flex:1, overflowY:'auto', padding:'12px', display:'flex', flexDirection:'column', gap:'8px'}}>
        {chatMessages.length === 0 && (
          <div style={{textAlign:'center', padding:'20px 0'}}>
            <p style={{fontSize:'12px', color:'#64748b', margin:'0 0 12px'}}>Ask me about the workflow energy data</p>
            <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
              {['Which phase wastes most energy?', 'How can I reduce idle consumption?', 'What is the R-strategy for live view?'].map(q => (
                <button key={q} onClick={() => sendChatMessage(q)}
                  style={{background:'#f0f4f8', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'7px 10px', fontSize:'11px', cursor:'pointer', color:'#374151', textAlign:'left'}}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {chatMessages.map((msg, i) => (
          <div key={i} style={{display:'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'}}>
            <div style={{maxWidth:'85%', padding:'8px 12px', borderRadius: msg.role === 'user' ? '12px 0 12px 12px' : '0 12px 12px 12px', background: msg.role === 'user' ? ZEISS_BLUE : '#f0f4f8', color: msg.role === 'user' ? 'white' : '#374151', fontSize:'12px', lineHeight:1.5}}>
              {msg.text}
            </div>
          </div>
        ))}
        {chatLoading && (
          <div style={{display:'flex', gap:'4px', padding:'8px'}}>
            {[0,1,2].map(i => <span key={i} style={{width:'6px', height:'6px', borderRadius:'50%', background:ZEISS_BLUE, display:'inline-block', animation:`bounce 1s ${i*150}ms infinite`}}></span>)}
          </div>
        )}
      </div>

      <div style={{padding:'10px', borderTop:'1px solid #e2e8f0', display:'flex', gap:'6px'}}>
        <input value={chatInput} onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => { if(e.key === 'Enter') { e.preventDefault(); sendChatMessage(chatInput); }}}
          placeholder="Ask about energy data..."
          style={{flex:1, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'8px 12px', fontSize:'12px', outline:'none', color:'#1e293b'}} />
        <button onClick={() => sendChatMessage(chatInput)} disabled={chatLoading || !chatInput.trim()}
          style={{background:ZEISS_BLUE, border:'none', borderRadius:'8px', padding:'8px 14px', color:'white', fontSize:'12px', fontWeight:600, cursor:'pointer'}}>
          Send
        </button>
      </div>
    </div>
  )}

  <button onClick={() => { setChatOpen(!chatOpen); }}
    style={{width:'56px', height:'56px', borderRadius:'50%', background:ZEISS_BLUE, border:'none', cursor:'pointer', boxShadow:'0 4px 20px rgba(0,55,100,0.4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'24px'}}>
    {chatOpen ? '✕' : '🔬'}
  </button>
</div>

      {loading && (
  <div style={{ position: 'fixed', bottom: '100px', left: '60%', transform: 'translateX(-50%)', background: ZEISS_BLUE, color: 'white', padding: '12px 24px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, zIndex: 200, boxShadow: '0 4px 20px rgba(0,55,100,0.3)' }}>
    ⚡ Analyzing scenario...
  </div>
)}
    </div>
  );
}