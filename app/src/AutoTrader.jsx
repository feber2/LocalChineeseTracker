import { useState, useEffect } from 'react';
import { Play, Square, Activity, AlertTriangle, ShieldCheck, ShoppingCart, TrendingDown } from 'lucide-react';
const { ipcRenderer } = window.require('electron');

export default function AutoTrader() {
  const [status, setStatus] = useState('IDLE');
  const [logs, setLogs] = useState([]);
  const [config, setConfig] = useState({ minProfitC: 10, baseDivineRate: 200, maxChaosSpend: 500, maxDivineSpend: 2 });

  useEffect(() => {
    ipcRenderer.invoke('trader:status').then(({ state, logs: recentLogs }) => {
      setStatus(state);
      setLogs(recentLogs || []);
    });

    const handler = (_, { type, data }) => {
      if (type === 'trader_state') setStatus(data.state);
      if (type === 'trader_log') {
        setLogs(prev => [data, ...prev].slice(0, 100));
      }
    };

    ipcRenderer.on('trader:update', handler);
    return () => ipcRenderer.removeListener('trader:update', handler);
  }, []);

  const toggleTrader = async () => {
    if (status === 'IDLE' || status === 'STOPPED') {
      await ipcRenderer.invoke('trader:start', config);
    } else {
      await ipcRenderer.invoke('trader:stop');
    }
  };

  const getStatusColor = () => {
    switch(status) {
      case 'HUNTING': return 'var(--accent-cyan)';
      case 'EXECUTE_BUY': return 'var(--accent-gold)';
      case 'VALIDATE_SELL': return '#a6e22e';
      case 'EXECUTE_SELL': return '#a6e22e';
      case 'PANIC_DUMP': return '#ff4d4d';
      case 'STOPPED': return 'var(--text-muted)';
      default: return 'var(--text-muted)';
    }
  };

  const getStatusIcon = () => {
    switch(status) {
      case 'HUNTING': return <Activity size={18} className="spin" />;
      case 'EXECUTE_BUY': return <ShoppingCart size={18} />;
      case 'VALIDATE_SELL': return <ShieldCheck size={18} />;
      case 'EXECUTE_SELL': return <ShoppingCart size={18} />;
      case 'PANIC_DUMP': return <TrendingDown size={18} />;
      case 'STOPPED': return <Square size={18} />;
      default: return <Play size={18} />;
    }
  };

  return (
    <div className="content-area animate-fade" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Control Bar */}
      <div className="glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', marginBottom: '16px', borderRadius: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ fontWeight: 800, fontSize: '18px', color: 'var(--accent-gold)' }}>AUTO TRADER</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: getStatusColor(), border: `1px solid ${getStatusColor()}`, fontWeight: 600 }}>
            {getStatusIcon()} {status}
          </div>
        </div>
        
        
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Min Profit (C):</span>
            <input type="number" value={config.minProfitC} onChange={e => setConfig({...config, minProfitC: parseFloat(e.target.value)||0})} style={{ width: '60px', padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-panel)', color: 'white' }} />
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Base Divine (C):</span>
            <input type="number" value={config.baseDivineRate} onChange={e => setConfig({...config, baseDivineRate: parseFloat(e.target.value)||0})} style={{ width: '60px', padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-panel)', color: 'white' }} />
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Max Chaos Spend:</span>
            <input type="number" value={config.maxChaosSpend} onChange={e => setConfig({...config, maxChaosSpend: parseFloat(e.target.value)||0})} style={{ width: '60px', padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-panel)', color: 'white' }} />
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Max Div Spend:</span>
            <input type="number" value={config.maxDivineSpend} onChange={e => setConfig({...config, maxDivineSpend: parseFloat(e.target.value)||0})} style={{ width: '60px', padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-panel)', color: 'white' }} />
          </div>
          <button className={`btn-scan ${status !== 'IDLE' && status !== 'STOPPED' ? 'scanning' : ''}`} style={{ padding: '8px 24px', width: 'auto' }} onClick={toggleTrader}>
            {status !== 'IDLE' && status !== 'STOPPED' ? <><Square size={16} /> STOP</> : <><Play size={16} /> START</>}
          </button>
        </div>
      </div>

      {/* Terminal View */}
      <div className="glass" style={{ flex: 1, padding: '20px', borderRadius: '10px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <h3 style={{ margin: '0 0 15px 0', color: 'var(--accent-cyan)', fontSize: '14px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <AlertTriangle size={16} /> TRADER LOGS
        </h3>
        <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.4)', padding: '15px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '13px', display: 'flex', flexDirection: 'column-reverse' }}>
          {logs.map((l, i) => (
            <div key={i} style={{ 
              marginBottom: '6px', 
              color: l.type === 'error' ? '#ff4d4d' : l.type === 'success' ? '#a6e22e' : l.type === 'warn' ? 'var(--accent-gold)' : 'var(--text-muted)',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              paddingBottom: '4px'
            }}>
              <span style={{ color: '#666', marginRight: '10px' }}>[{l.ts}]</span> {l.msg}
            </div>
          ))}
          {logs.length === 0 && <div style={{ color: 'var(--text-muted)' }}>Waiting for initialization...</div>}
        </div>
      </div>
    </div>
  );
}
