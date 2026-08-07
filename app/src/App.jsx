import { useState, useEffect } from 'react';
import { Target, Key, RefreshCw, Activity, Settings, ChevronDown, Crosshair, Clock, List, ShoppingCart } from 'lucide-react';
import Scanner from './Scanner.jsx';
import AutoTrader from './AutoTrader.jsx';

const API_URL = 'http://127.0.0.1:8000/api';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [headhuntingKey, setHeadhuntingKey] = useState('');
  const [headhuntingData, setHeadhuntingData] = useState(null);
  const [isFetchingOpportunities, setIsFetchingOpportunities] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    fetchHeadhuntingKey();

    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      const f1Handler = () => {
        if (activeTab === 'bot') {
          ipcRenderer.invoke('trader:start');
        } else {
          ipcRenderer.invoke('scanner:start');
        }
      };
      ipcRenderer.on('global:f1-pressed', f1Handler);
      return () => ipcRenderer.removeListener('global:f1-pressed', f1Handler);
    }
  }, [activeTab]);

  const fetchHeadhuntingKey = async () => {
    try {
      const res = await fetch(`${API_URL}/headhunting_key`);
      const data = await res.json();
      if (data && data.api_key) setHeadhuntingKey(data.api_key);
    } catch (e) {
      console.error(e);
    }
  };

  const saveHeadhuntingKey = async () => {
    try {
      await fetch(`${API_URL}/headhunting_key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: headhuntingKey })
      });
      setStatusMessage('API Key saved!');
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (e) {
      alert('Failed to save API Key.');
    }
  };

  const fetchOpportunities = async () => {
    if (!headhuntingKey) {
      alert("Please enter and save your Headhunting API Key first.");
      return;
    }
    if (headhuntingKey.toLowerCase() === 'demo') {
      setHeadhuntingData({
        status: 'success',
        liveDivinePrice: 221.3,
        items: [
          { name: 'Unrequited Love', category: 'DivinationCard', volume: 4909952, chaosRate: 5888, divineRate: 31.02, profitC: 976.73, netProfit100kC: 1008.11 },
          { name: 'The Apothecary', category: 'DivinationCard', volume: 4384342, chaosRate: 7138, divineRate: 38.99, profitC: 1490.49, netProfit100kC: 1267.18 },
          { name: "Valdo's Puzzle Box", category: 'Fragment', volume: 2280431, chaosRate: 212, divineRate: 0.9883, profitC: 6.71, netProfit100kC: 164.43 },
          { name: 'Horned Scarab of Pandemonium', category: 'Scarab', volume: 1552148, chaosRate: 488.2, divineRate: 2.33, profitC: 27.43, netProfit100kC: 320.27 }
        ]
      });
      return;
    }
    setIsFetchingOpportunities(true);
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        const targetUrl = `http://localchinesedealer.wuaze.com/arbitrage/backend/api_headhunting.php?api_key=${headhuntingKey}&preset=best`;
        const data = await ipcRenderer.invoke('fetch-headhunting-bypass', targetUrl);
        if (data && data.status === 'success' && data.items) {
          setHeadhuntingData(data);
        } else {
          alert('Error: ' + (data.message || 'Unknown error'));
        }
      }
    } catch (e) {
      alert('Failed to fetch opportunities.');
    }
    setIsFetchingOpportunities(false);
  };

  const renderOpportunities = () => (
    <div className="content-area animate-fade">
      <div className="table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div className="table-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Target size={20} /> PROFITABLE OPPORTUNITIES (HEADHUNTING API)
        </div>
        <button className={`btn-scan ${isFetchingOpportunities ? 'scanning' : ''}`} style={{ width: 'auto', padding: '10px 20px', minHeight: '40px' }} onClick={fetchOpportunities}>
          {isFetchingOpportunities ? <RefreshCw size={18} className="spin" /> : <Target size={18} />}
          {isFetchingOpportunities ? ' FETCHING...' : ' FETCH OPPORTUNITIES'}
        </button>
      </div>
      {headhuntingData?.liveDivinePrice && (
        <div className="glass" style={{ padding: '15px', marginBottom: '20px', borderRadius: '8px', color: 'var(--accent-gold)' }}>
          <strong>Live Divine Price (API):</strong> {headhuntingData.liveDivinePrice} c
        </div>
      )}
      <div className="table-container glass">
        <table>
          <thead>
            <tr>
              <th>Item Name</th><th>Category</th><th>Volume</th><th>Chaos Rate</th><th>Divine Rate</th><th>Profit (c)</th><th>Net Profit 100k C</th>
            </tr>
          </thead>
          <tbody>
            {headhuntingData?.items?.map((item, i) => (
              <tr key={i} className="animate-fade">
                <td style={{ fontWeight: 700 }}>{item.name}</td>
                <td style={{ color: 'var(--text-muted)' }}>{item.category}</td>
                <td style={{ color: 'var(--text-muted)' }}>{item.volume?.toLocaleString()}</td>
                <td>{item.chaosRate} c</td>
                <td>{item.divineRate} div</td>
                <td style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>+{item.profitC} c</td>
                <td style={{ color: 'var(--accent-gold)', fontWeight: 700 }}>+{item.netProfit100kC} c</td>
              </tr>
            ))}
            {(!headhuntingData?.items?.length) && (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No opportunities loaded. Configure your API Key then click Fetch.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderApiConfig = () => (
    <div className="content-area animate-fade">
      <div className="glass" style={{ padding: '30px', borderRadius: '12px', maxWidth: '600px' }}>
        <h2 style={{ marginTop: 0, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Key size={22} /> Headhunting API Key
        </h2>
        <div className="settings-grid" style={{ marginBottom: '20px' }}>
          <div className="settings-group" style={{ gridColumn: '1 / -1' }}>
            <label>API KEY</label>
            <input type="text" value={headhuntingKey} onChange={e => setHeadhuntingKey(e.target.value)} placeholder="Enter your Headhunting API Key (or 'demo')..." />
          </div>
        </div>
        <button className="btn-scan" style={{ width: 'auto', padding: '10px 24px' }} onClick={saveHeadhuntingKey}>
          Save API Key
        </button>
        {statusMessage && <span style={{ marginLeft: '15px', color: 'var(--accent-cyan)', fontWeight: 600 }}>{statusMessage}</span>}
      </div>
    </div>
  );

  const [isSettingsOpen, setIsSettingsOpen] = useState(true);

  const SETTINGS_SUBITEMS = [
    { key: 'calibration', label: 'Calibration', icon: <Crosshair size={16} /> },
    { key: 'timing', label: 'Timing', icon: <Clock size={16} /> },
    { key: 'currencies', label: 'Currencies', icon: <List size={16} /> },
    { key: 'apiconfig', label: 'API Key', icon: <Key size={16} /> }
  ];

  const PAGE_TITLES = {
    dashboard: 'Live Market Dashboard',
    calibration: 'UI Coordinate Calibration',
    timing: 'Speed & Delays Configuration',
    currencies: 'Monitored Currency List',
    apiconfig: 'Headhunting API Key Configuration',
    opportunities: 'Headhunting Opportunities',
    bot: 'Auto Trader (Bot)'
  };

  return (
    <div className="app-container">
      <div className="glow-blob"></div>

      <div className="sidebar glass">
        <div className="sidebar-header">
          <Activity className="logo-icon" size={24} />
          <span className="logo-text">MAGIC POE</span>
        </div>
        <div className="nav-menu">
          <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <Activity size={18} /> Dashboard
          </div>

          <div className={`nav-item ${activeTab === 'bot' ? 'active' : ''}`} onClick={() => setActiveTab('bot')}>
            <ShoppingCart size={18} /> Auto Trader
          </div>

          <div className={`nav-item ${activeTab === 'opportunities' ? 'active' : ''}`} onClick={() => setActiveTab('opportunities')}>
            <Target size={18} /> Opportunities
          </div>

          {/* Settings Accordion Dropdown */}
          <div>
            <div
              className={`nav-item ${['calibration', 'timing', 'currencies', 'apiconfig'].includes(activeTab) ? 'active' : ''}`}
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              style={{ justifyContent: 'space-between' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Settings size={18} /> Settings
              </div>
              <ChevronDown size={16} style={{ transform: isSettingsOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
            </div>

            {isSettingsOpen && (
              <div style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                {SETTINGS_SUBITEMS.map(sub => (
                  <div
                    key={sub.key}
                    className={`nav-item ${activeTab === sub.key ? 'active' : ''}`}
                    onClick={() => setActiveTab(sub.key)}
                    style={{ fontSize: '13px', padding: '8px 12px' }}
                  >
                    {sub.icon} {sub.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="main-content">
        <div className="topbar glass">
          <div className="page-title">{PAGE_TITLES[activeTab]}</div>
        </div>
        {['dashboard', 'calibration', 'timing', 'currencies', 'apiconfig'].includes(activeTab) && (
          <Scanner
            activeTab={activeTab}
            headhuntingKey={headhuntingKey}
            setHeadhuntingKey={setHeadhuntingKey}
            saveHeadhuntingKey={saveHeadhuntingKey}
            statusMessage={statusMessage}
          />
        )}
        {activeTab === 'opportunities' && renderOpportunities()}
        {activeTab === 'bot' && <AutoTrader />}
      </div>

      <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default App;
