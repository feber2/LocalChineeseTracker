import { useState, useEffect, useRef } from 'react';
import { Activity, Play, Square, Settings, RefreshCw, Crosshair, Zap } from 'lucide-react';

const API_URL = 'http://127.0.0.1:8000/api';
const WS_URL = 'ws://127.0.0.1:8000/ws/live';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isScanning, setIsScanning] = useState(false);
  const [statusMessage, setStatusMessage] = useState('STATUS: IDLE');
  const [baseRate, setBaseRate] = useState(180);
  const [records, setRecords] = useState([]);
  const wsRef = useRef(null);
  
  // Settings State
  const [coords, setCoords] = useState({});
  const [timing, setTiming] = useState({});

  useEffect(() => {
    fetchStatus();
    connectWebSocket();
    fetchSettings();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/status`);
      const data = await res.json();
      setIsScanning(data.is_scanning);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSettings = async () => {
    try {
      const resC = await fetch(`${API_URL}/coords`);
      setCoords(await resC.json());
      const resT = await fetch(`${API_URL}/timing`);
      setTiming(await resT.json());
    } catch (e) {}
  };

  const connectWebSocket = () => {
    wsRef.current = new WebSocket(WS_URL);
    wsRef.current.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'status') {
        setStatusMessage(msg.message);
      } else if (msg.type === 'base_rate') {
        setBaseRate(msg.rate);
      } else if (msg.type === 'record') {
        setRecords(prev => {
          // Check if exists
          const existingIdx = prev.findIndex(r => r.item_name === msg.data.item_name);
          if (existingIdx >= 0) {
            const newArr = [...prev];
            newArr[existingIdx] = msg.data;
            return newArr;
          }
          return [msg.data, ...prev];
        });
      } else if (msg.type === 'error') {
        setStatusMessage(`ERROR: ${msg.message}`);
        setIsScanning(false);
      } else if (msg.type === 'scan_finished') {
        setIsScanning(false);
      }
    };
    
    wsRef.current.onclose = () => {
      setTimeout(connectWebSocket, 2000);
    };
  };

  const toggleScan = async () => {
    if (isScanning) {
      await fetch(`${API_URL}/stop`, { method: 'POST' });
      setIsScanning(false);
      setStatusMessage('STATUS: STOPPED');
    } else {
      setRecords([]);
      await fetch(`${API_URL}/start`, { method: 'POST' });
      setIsScanning(true);
    }
  };

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
          <div className="stat-title">Last Profit Found</div>
          <div className="stat-value">
            {records.length > 0 ? records[0].profit_chaos : 'None'}
          </div>
        </div>
      </div>

      <div className="table-container glass">
        <div className="table-header">
          <div className="table-title">
            <Activity size={20} /> LIVE MARKET RATIOS MATRIX
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Currency Item</th>
              <th>Chaos Buy (c -&gt; Item)</th>
              <th>Divine Buy (div -&gt; Item)</th>
              <th>Best Route</th>
              <th>Net Profit</th>
              <th>ROI %</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => {
              const isProfitable = r.arb_res?.is_profitable;
              return (
                <tr key={i} className="animate-fade">
                  <td style={{fontWeight: 700}}>{r.item_name}</td>
                  <td style={{color: 'var(--text-muted)'}}>{r.chaos_buy_str}</td>
                  <td style={{color: 'var(--text-muted)'}}>{r.divine_buy_str}</td>
                  <td className="route-text">{r.route}</td>
                  <td>
                    <span className={`profit-badge ${!isProfitable ? 'zero' : ''}`}>
                      {r.profit_chaos}
                    </span>
                  </td>
                  <td style={{color: isProfitable ? 'var(--accent-cyan)' : 'var(--text-muted)', fontWeight: 600}}>
                    {r.roi}
                  </td>
                </tr>
              );
            })}
            {records.length === 0 && (
              <tr>
                <td colSpan="6" style={{textAlign: 'center', padding: '40px', color: 'var(--text-muted)'}}>
                  No scan data recorded yet. Press Start Scan to begin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="content-area animate-fade">
      <div className="glass" style={{padding: '30px', borderRadius: '12px'}}>
        <h2 style={{marginTop: 0, color: 'var(--accent-gold)'}}>Speed & Timing Delays</h2>
        <div className="settings-grid timing-grid">
          {Object.keys(timing).map(k => (
            <div className="settings-group" key={k}>
              <label>{k.replace(/_/g, ' ').toUpperCase()}</label>
              <input type="number" step="0.01" value={timing[k]} onChange={(e) => setTiming({...timing, [k]: parseFloat(e.target.value) || 0})} />
            </div>
          ))}
        </div>
        <button className="btn-scan" style={{width: 'auto', padding: '10px 20px', marginTop: '10px'}} onClick={async () => {
          await fetch(`${API_URL}/timing`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(timing)
          });
          alert('Timing saved!');
        }}>
          Save Timing
        </button>
      </div>

      <div className="glass" style={{padding: '30px', borderRadius: '12px'}}>
        <h2 style={{marginTop: 0, color: 'var(--accent-cyan)'}}>UI Coordinates (Calibration)</h2>
        <div className="settings-grid">
          {Object.keys(coords).map(k => (
            <div className="settings-group" key={k}>
              <label>{k.replace(/_/g, ' ')}</label>
              <div style={{display: 'flex', gap: '10px'}}>
                <input type="text" value={`X: ${coords[k].x}, Y: ${coords[k].y}`} readOnly />
                <button style={{display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', color: 'white', padding: '0 15px', borderRadius: '8px', cursor: 'pointer'}}
                  onClick={async () => {
                    setStatusMessage(`Hover over ${k} (3 seconds)...`);
                    const res = await fetch(`${API_URL}/calibrate?key=${k}`, { method: 'POST' });
                    const newPos = await res.json();
                    setCoords({...coords, [k]: newPos});
                    setStatusMessage(`Recorded ${k}`);
                  }}
                >
                  <Crosshair size={18}/>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      <div className="glow-blob"></div>
      
      <div className="sidebar glass">
        <div className="sidebar-header">
          <Zap className="logo-icon" size={24} />
          <span className="logo-text">MAGIC POE</span>
        </div>
        
        <div className="nav-menu">
          <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <Activity size={18} /> Dashboard
          </div>
          <div className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
            <Settings size={18} /> Configuration
          </div>
        </div>

        <div className="sidebar-footer">
          <div className={`status-badge ${isScanning ? 'status-active' : 'status-idle'}`} style={{marginBottom: '12px', justifyContent: 'center', padding: '10px'}}>
            {isScanning && <RefreshCw size={14} className="spin" style={{animation: 'spin 2s linear infinite'}}/>}
            <span style={{textAlign: 'center', width: '100%', display: 'inline-block'}}>{statusMessage}</span>
          </div>
          <button className={`btn-scan ${isScanning ? 'scanning' : ''}`} onClick={toggleScan}>
            {isScanning ? <Square size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}
            {isScanning ? 'STOP SCAN' : 'START SCAN'}
          </button>
        </div>
      </div>

      <div className="main-content">
        <div className="topbar glass">
          <div className="page-title">
            {activeTab === 'dashboard' ? 'Market Overview' : 'System Configuration'}
          </div>
        </div>
        
        {activeTab === 'dashboard' ? renderDashboard() : renderSettings()}
      </div>
      
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default App;
