import { useState, useEffect } from 'react';
import { Activity, Play, Square, Settings, Crosshair, List, Clock, RefreshCw, Key } from 'lucide-react';

const { ipcRenderer } = window.require('electron');

const COORD_KEYS = [
  'I_HAVE_SEARCH_BOX',
  'I_WANT_SEARCH_BOX',
  'TOP_SEARCH_RESULT',
  'I_HAVE_PRICE_BOX',
  'I_WANT_PRICE_BOX',
  'PLACE_ORDER_BTN',
  'CONFIRM_ORDER_BTN'
];

export default function Scanner({ activeTab, headhuntingKey, setHeadhuntingKey, saveHeadhuntingKey }) {
  const currentView = activeTab || 'dashboard';
  const [isScanning, setIsScanning] = useState(false);
  const [statusMessage, setStatusMessage] = useState('STATUS: IDLE');
  const [baseRate, setBaseRate] = useState(180);
  const [records, setRecords] = useState([]);

  const [coords, setCoords] = useState({});
  const [timing, setTiming] = useState({});
  const [currencies, setCurrencies] = useState([]);

  const [settingsCategory, setSettingsCategory] = useState('calibration');
  const [calibrating, setCalibrating] = useState(null);
  const [newCurrName, setNewCurrName] = useState('');
  const [newCurrSearch, setNewCurrSearch] = useState('');

  // Load settings and cached records on mount
  useEffect(() => {
    ipcRenderer.invoke('scanner:get-settings').then(({ coords, timing, currencies }) => {
      setCoords(coords);
      setTiming(timing);
      setCurrencies(currencies);
    });

    ipcRenderer.invoke('scanner:get-records').then(cachedRecords => {
      if (Array.isArray(cachedRecords) && cachedRecords.length > 0) {
        setRecords(cachedRecords);
      }
    });

    ipcRenderer.invoke('scanner:status').then(({ isScanning }) => {
      setIsScanning(isScanning);
    });

    // Live updates from main process
    const handler = (_, { type, data }) => {
      if (type === 'status') setStatusMessage(data.message);
      if (type === 'base_rate') setBaseRate(data.rate);
      if (type === 'error') setStatusMessage('ERROR: ' + data.message);
      if (type === 'scan_finished') setIsScanning(false);
      if (type === 'record') {
        setRecords(prev => {
          const existing = prev.findIndex(r => r.itemName === data.itemName);
          if (existing >= 0) {
            const next = [...prev];
            next[existing] = data;
            return next;
          }
          return [...prev, data];
        });
      }
    };

    ipcRenderer.on('scanner:update', handler);
    return () => ipcRenderer.removeListener('scanner:update', handler);
  }, []);

  const toggleScan = async () => {
    if (isScanning) {
      await ipcRenderer.invoke('scanner:stop');
      setIsScanning(false);
      setStatusMessage('STATUS: STOPPED');
    } else {
      setRecords([]);
      setIsScanning(true);
      setStatusMessage('STATUS: STARTING...');
      await ipcRenderer.invoke('scanner:start');
    }
  };

  const calibrate = async (key, delaySeconds = 3) => {
    setCalibrating(key);
    if (delaySeconds > 0) {
      setStatusMessage(`Move mouse to ${key.replace(/_/g, ' ')} (${delaySeconds}s)...`);
    } else {
      setStatusMessage(`Capturing ${key.replace(/_/g, ' ')} position...`);
    }
    const pos = await ipcRenderer.invoke('scanner:calibrate', key, delaySeconds);
    const newCoords = { ...coords, [key]: pos };
    setCoords(newCoords);
    setCalibrating(null);
    setStatusMessage(`Recorded ${key}: (${pos.x}, ${pos.y})`);
  };

  const saveTiming = async () => {
    await ipcRenderer.invoke('scanner:save-timing', timing);
    setStatusMessage('Timing saved!');
  };

  const saveCurrencies = async (list) => {
    setCurrencies(list);
    await ipcRenderer.invoke('scanner:save-currencies', list);
  };

  const addCurrency = () => {
    if (!newCurrName || !newCurrSearch) return;
    const updated = [...currencies, { name: newCurrName, search_term: newCurrSearch, enabled: true, category: 'Custom' }];
    setNewCurrName('');
    setNewCurrSearch('');
    saveCurrencies(updated);
  };

  // ---- Sub-tabs ----

  const renderDashboard = () => (
    <div className="content-area animate-fade">
      <div className="stats-grid">
        <div className="stat-card glass">
          <div className="stat-title">Items Scanned</div>
          <div className="stat-value text-cyan">{records.length} Pairs</div>
        </div>
        <div className="stat-card glass">
          <div className="stat-title">Base Divine Rate</div>
          <div className="stat-value text-gold">1 Div = {baseRate.toFixed(1)}c</div>
        </div>
        <div className="stat-card glass">
          <div className="stat-title">Best Profit Found</div>
          <div className="stat-value">
            {records.filter(r => r.isProfitable).length > 0
              ? records.filter(r => r.isProfitable).sort((a, b) => parseFloat(b.profitChaos) - parseFloat(a.profitChaos))[0].profitChaos
              : 'None'}
          </div>
        </div>
      </div>

      <div className="table-container glass">
        <div className="table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="table-title"><Activity size={20} /> LIVE MARKET RATIOS</div>
          {records.length > 0 && (
            <button
              onClick={async () => {
                setRecords([]);
                await ipcRenderer.invoke('scanner:clear-records');
              }}
              style={{
                background: 'rgba(255,77,77,0.1)', color: '#ff4d4d', border: '1px solid #ff4d4d',
                padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600
              }}
            >
              Clear Results
            </button>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th>Currency</th>
              <th>Chaos Buy (c→Item)</th>
              <th>Chaos Sell (Item→c)</th>
              <th>Divine Buy</th>
              <th>Divine Sell</th>
              <th>Best Route</th>
              <th>Profit</th>
              <th>ROI</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={i} className="animate-fade">
                <td style={{ fontWeight: 700 }}>{r.itemName}</td>
                <td style={{ color: 'var(--text-muted)' }}>{r.chaosBuyStr}</td>
                <td style={{ color: 'var(--text-muted)' }}>{r.chaosSellStr}</td>
                <td style={{ color: 'var(--text-muted)' }}>{r.divineBuyStr}</td>
                <td style={{ color: 'var(--text-muted)' }}>{r.divineSellStr}</td>
                <td style={{ color: r.isProfitable ? 'var(--accent-cyan)' : 'var(--text-muted)', fontWeight: 600 }}>{r.route || 'No Arbitrage'}</td>
                <td>
                  <span className={`profit-badge ${!r.isProfitable ? 'zero' : ''}`}>{r.profitChaos}</span>
                </td>
                <td style={{ color: r.isProfitable ? 'var(--accent-cyan)' : 'var(--text-muted)', fontWeight: 600 }}>{r.roi}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{r.updatedAt}</td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No scan data yet. Press Start Scan (or F1) to begin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const updateCoord = async (key, axis, value) => {
    const num = parseInt(value, 10) || 0;
    const newCoords = {
      ...coords,
      [key]: {
        ...(coords[key] || { x: 0, y: 0 }),
        [axis]: num
      }
    };
    setCoords(newCoords);
    await ipcRenderer.invoke('scanner:save-coords', newCoords);
  };

  const renderCalibration = () => (
    <div className="content-area animate-fade">
      <div className="glass" style={{ padding: '28px', borderRadius: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0, color: 'var(--accent-cyan)' }}>UI Coordinate Calibration</h2>
            <p style={{ color: 'var(--text-muted)', margin: '6px 0 0 0', fontSize: '13px' }}>
              Type coordinates directly into input boxes, or click <strong>Capture (Instant)</strong> / <strong>3s Timer</strong> to record your cursor position.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
          {COORD_KEYS.map(key => (
            <div key={key} className="glass" style={{ padding: '16px 20px', borderRadius: '10px', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--accent-cyan)', marginBottom: '12px', letterSpacing: '0.5px' }}>
                {key.replace(/_/g, ' ')}
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '110px' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600 }}>X:</span>
                  <input
                    type="number"
                    value={coords[key]?.x ?? 0}
                    onChange={e => updateCoord(key, 'x', e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'white', fontWeight: 600 }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '110px' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600 }}>Y:</span>
                  <input
                    type="number"
                    value={coords[key]?.y ?? 0}
                    onChange={e => updateCoord(key, 'y', e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'white', fontWeight: 600 }}
                  />
                </div>
                <button
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: calibrating === key ? 'var(--accent-cyan)' : 'rgba(0,210,255,0.1)',
                    color: calibrating === key ? '#000' : 'var(--accent-cyan)',
                    border: '1px solid var(--accent-cyan)', padding: '8px 14px',
                    borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, height: '36px', whiteSpace: 'nowrap'
                  }}
                  onClick={() => calibrate(key, 0)}
                  disabled={calibrating !== null}
                >
                  <Crosshair size={14} /> Capture
                </button>
                <button
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)',
                    border: '1px solid var(--border-color)', padding: '8px 12px',
                    borderRadius: '6px', cursor: 'pointer', fontSize: '12px', height: '36px', whiteSpace: 'nowrap'
                  }}
                  onClick={() => calibrate(key, 3)}
                  disabled={calibrating !== null}
                >
                  3s
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderTiming = () => (
    <div className="content-area animate-fade">
      <div className="glass" style={{ padding: '24px', borderRadius: '12px' }}>
        <h2 style={{ marginTop: 0, color: 'var(--accent-gold)' }}>Speed & Timing (seconds)</h2>
        <div className="settings-grid timing-grid">
          {Object.keys(timing).map(k => (
            <div className="settings-group" key={k}>
              <label>{k.replace(/_/g, ' ').toUpperCase()}</label>
              <input
                type="number" step="0.01" min="0"
                value={timing[k]}
                onChange={e => setTiming({ ...timing, [k]: parseFloat(e.target.value) || 0 })}
              />
            </div>
          ))}
        </div>
        <button className="btn-scan" style={{ width: 'auto', padding: '10px 24px', marginTop: '16px' }} onClick={saveTiming}>
          Save Timing
        </button>
      </div>
    </div>
  );

  const renderCurrencies = () => (
    <div className="content-area animate-fade">
      <div className="glass" style={{ padding: '24px', borderRadius: '12px', marginBottom: '20px' }}>
        <h2 style={{ marginTop: 0, color: 'var(--accent-cyan)' }}>Add Currency</h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input type="text" placeholder="Display Name" value={newCurrName} onChange={e => setNewCurrName(e.target.value)} style={{ flex: 1, minWidth: '150px' }} />
          <input type="text" placeholder="Search Term (in PoE)" value={newCurrSearch} onChange={e => setNewCurrSearch(e.target.value)} style={{ flex: 1, minWidth: '150px' }} />
          <button className="btn-scan" style={{ width: 'auto', padding: '10px 20px' }} onClick={addCurrency}>Add</button>
        </div>
      </div>
      <div className="table-container glass">
        <table>
          <thead>
            <tr>
              <th>Enabled</th><th>Name</th><th>Search Term</th><th>Category</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {currencies.map((c, i) => (
              <tr key={i} className="animate-fade">
                <td>{c.enabled ? '✔ Yes' : '❌ No'}</td>
                <td>{c.name}</td>
                <td style={{ color: 'var(--text-muted)' }}>{c.search_term}</td>
                <td style={{ color: 'var(--text-muted)' }}>{c.category || 'General'}</td>
                <td>
                  <button style={{ marginRight: '6px', padding: '5px 10px', cursor: 'pointer', background: 'var(--bg-panel)', color: 'var(--text-white)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                    onClick={() => { const l = [...currencies]; l[i].enabled = !l[i].enabled; saveCurrencies(l); }}>
                    Toggle
                  </button>
                  <button style={{ padding: '5px 10px', cursor: 'pointer', background: '#2a1b24', color: '#ff4d4d', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                    onClick={() => {
                      if (c.name === 'Divine Orb' || c.name === 'Chaos Orb') return alert('Cannot delete core currency.');
                      saveCurrencies(currencies.filter((_, idx) => idx !== i));
                    }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );



  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Scanner Control Bar */}
      <div className="glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', marginBottom: '16px', borderRadius: '10px' }}>
        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--accent-cyan)' }}>
          AUTOMATED RATIO SCANNER
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            fontSize: '12px', fontWeight: 600, padding: '6px 12px', borderRadius: '6px',
            background: isScanning ? 'rgba(0,210,255,0.1)' : 'rgba(255,255,255,0.05)',
            color: isScanning ? 'var(--accent-cyan)' : 'var(--text-muted)',
            border: '1px solid ' + (isScanning ? 'var(--accent-cyan)' : 'var(--border-color)')
          }}>
            {isScanning && <RefreshCw size={12} style={{ display: 'inline', marginRight: 5, animation: 'spin 2s linear infinite' }} />}
            {statusMessage}
          </span>
          <button className={`btn-scan ${isScanning ? 'scanning' : ''}`} style={{ width: 'auto', padding: '8px 20px' }} onClick={toggleScan}>
            {isScanning ? <><Square size={16} fill="currentColor" /> STOP (F2)</> : <><Play size={16} fill="currentColor" /> START (F1)</>}
          </button>
        </div>
      </div>

      {/* Main View Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {currentView === 'dashboard' && renderDashboard()}
        {currentView === 'calibration' && renderCalibration()}
        {currentView === 'timing' && renderTiming()}
        {currentView === 'currencies' && renderCurrencies()}
        {currentView === 'apiconfig' && (
          <div className="glass" style={{ padding: '28px', borderRadius: '12px' }}>
            <h2 style={{ marginTop: 0, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Key size={22} /> Headhunting API Key
            </h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '13px' }}>
              Configure your API key to fetch live market opportunities from the Headhunting backend.
            </p>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', maxWidth: '600px' }}>
              <input
                type="text"
                value={headhuntingKey || ''}
                onChange={e => setHeadhuntingKey(e.target.value)}
                placeholder="Enter your Headhunting API Key (or 'demo')..."
                style={{ flex: 1, padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'white', fontWeight: 600 }}
              />
              <button className="btn-scan" style={{ width: 'auto', padding: '10px 24px' }} onClick={saveHeadhuntingKey}>
                Save API Key
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
