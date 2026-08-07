'use strict';

const { spawn } = require('child_process');
const { createInterface } = require('readline');
const path = require('path');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const TRADER_STATES = {
  IDLE: 'IDLE',
  HUNTING: 'HUNTING',
  EXECUTE_BUY: 'EXECUTE_BUY',
  VALIDATE_SELL: 'VALIDATE_SELL',
  EXECUTE_SELL: 'EXECUTE_SELL',
  PANIC_DUMP: 'PANIC_DUMP',
  STOPPED: 'STOPPED'
};

function parseRate(haveStr, wantStr) {
  if (!haveStr || !wantStr) return null;
  const cleanHave = haveStr.toString().replace(/,/g, '').trim();
  const cleanWant = wantStr.toString().replace(/,/g, '').trim();
  let have = parseFloat(cleanHave);
  let want = parseFloat(cleanWant);
  if (cleanHave.includes('/')) {
    const parts = cleanHave.split('/');
    have = parseFloat(parts[0]) / parseFloat(parts[1]);
  }
  if (cleanWant.includes('/')) {
    const parts = cleanWant.split('/');
    want = parseFloat(parts[0]) / parseFloat(parts[1]);
  }
  if (isNaN(have) || isNaN(want) || want === 0 || have === 0) return null;
  return { haveAmount: have, wantAmount: want, ratePerUnit: have / want };
}

class AutoTraderEngine {
  constructor() {
    this.state = TRADER_STATES.IDLE;
    this.stopRequested = false;
    this.onUpdate = null;
    this.automationProcess = null;
    this.pendingCallbacks = [];
    this.automationScriptPath = path.join(__dirname, '..', '..', 'automation.py');
    this.logs = [];
  }

  setUpdateCallback(fn) {
    this.onUpdate = fn;
  }

  log(msg, type = 'info') {
    const ts = new Date().toLocaleTimeString();
    const logObj = { ts, msg, type };
    this.logs.unshift(logObj);
    if (this.logs.length > 100) this.logs.pop(); // Keep last 100 logs
    if (this.onUpdate) this.onUpdate('trader_log', logObj);
  }

  setState(newState) {
    this.state = newState;
    if (this.onUpdate) this.onUpdate('trader_state', { state: this.state });
  }

  startAutomation() {
    if (this.automationProcess) return;
    this.automationProcess = spawn('python', [this.automationScriptPath]);
    this.pendingCallbacks = [];
    this.automationProcess.on('error', (err) => {
      this.log('Automation process failed: ' + err.message, 'error');
      this._drainCallbacks('Automation process failed');
    });
    this.automationProcess.on('close', () => {
      this._drainCallbacks('Automation process closed');
      this.automationProcess = null;
    });
    const rl = createInterface({ input: this.automationProcess.stdout });
    rl.on('line', (line) => {
      try {
        const response = JSON.parse(line.trim());
        const cb = this.pendingCallbacks.shift();
        if (cb) cb(response);
      } catch (e) {}
    });
  }

  stopAutomation() {
    if (this.automationProcess) {
      this.automationProcess.kill();
      this.automationProcess = null;
    }
    this._drainCallbacks('Stopped');
  }

  _drainCallbacks(msg) {
    const cbs = [...this.pendingCallbacks];
    this.pendingCallbacks = [];
    cbs.forEach(cb => cb({ status: 'error', message: msg }));
  }

  sendCommand(cmd) {
    return new Promise((resolve, reject) => {
      if (!this.automationProcess) return reject(new Error('Process not running'));
      this.pendingCallbacks.push((response) => {
        if (response.status === 'ok') resolve(response.result);
        else reject(new Error(response.message));
      });
      this.automationProcess.stdin.write(JSON.stringify(cmd) + '\n');
    });
  }

  async clickPoint(coord, delayMs = 50) {
    if (!coord || typeof coord.x !== 'number') return;
    await this.sendCommand({ action: 'click', x: coord.x, y: coord.y });
    await sleep(delayMs);
  }

  async readClipboardWait() {
    await this.sendCommand({ action: 'clear_clipboard' });
    await sleep(30);
    await this.sendCommand({ action: 'hotkey', keys: ['ctrl', 'c'] });
    for (let i = 0; i < 20; i++) {
      await sleep(50);
      const val = await this.sendCommand({ action: 'get_clipboard' });
      if (val && val.trim().length > 0) return val.trim();
    }
    return '';
  }

  async readBoxValue(boxCoord, delayMs) {
    if (!boxCoord || typeof boxCoord.x !== 'number') return '';
    await this.clickPoint(boxCoord, delayMs);
    let value = await this.readClipboardWait();
    if (!value) {
      await sleep(100);
      value = await this.readClipboardWait();
    }
    return value || '';
  }

  async setCurrencySlot(searchBox, topResult, keyword, timing) {
    if (!searchBox || typeof searchBox.x !== 'number') return;
    await this.clickPoint(searchBox, timing.click_delay * 1000);
    await this.sendCommand({ action: 'type', text: keyword, interval: timing.write_interval });
    await sleep(timing.post_search_delay * 1000);
    await this.clickPoint(topResult, timing.click_delay * 1000);
  }

  stop() {
    this.stopRequested = true;
    this.setState(TRADER_STATES.STOPPED);
    this.stopAutomation();
    this.log('Trader stopped by user.', 'warn');
  }

  // --- STATE MACHINE LOOP ---

  async startLoop(targetItems, coords, timing, config) {
    if (this.state !== TRADER_STATES.IDLE && this.state !== TRADER_STATES.STOPPED) {
      return; // Already running
    }
    this.stopRequested = false;
    this.logs = [];
    this.startAutomation();
    
    try {
      await this.sendCommand({ action: 'ping' });
    } catch (e) {
      this.log('Failed to start Python automation.', 'error');
      this.setState(TRADER_STATES.STOPPED);
      return;
    }

    if (!coords.PLACE_ORDER_BTN || coords.PLACE_ORDER_BTN.x === 0) {
      this.log('Place Order / Confirm buttons not calibrated!', 'error');
      this.stop();
      return;
    }

    this.log('Auto-Trader Started.', 'success');
    let itemIndex = 0;
    
    const minProfitC = config?.minProfitC || 10; 
    let divineValC = config?.baseDivineRate || 200; 

    // Live Benchmark: Check Divine Orb <-> Chaos Orb rate first
    this.log('Benchmarking Divine Orb <-> Chaos Orb live price...');
    await this.setCurrencySlot(coords.I_HAVE_SEARCH_BOX, coords.TOP_SEARCH_RESULT, 'Divine Orb', timing);
    if (!this.stopRequested) {
      await this.setCurrencySlot(coords.I_WANT_SEARCH_BOX, coords.TOP_SEARCH_RESULT, 'Chaos Orb', timing);
    }
    if (!this.stopRequested) {
      await sleep(timing.ratio_load_delay * 1000);
      const bHaveStr = await this.readBoxValue(coords.I_HAVE_PRICE_BOX, timing.click_delay * 1000);
      const bWantStr = await this.readBoxValue(coords.I_WANT_PRICE_BOX, timing.click_delay * 1000);
      const benchRate = parseRate(bHaveStr, bWantStr);
      if (benchRate) {
        if (benchRate.ratePerUnit > 1) divineValC = benchRate.ratePerUnit;
        else if (benchRate.wantAmount > 1) divineValC = benchRate.wantAmount / (benchRate.haveAmount || 1);
        this.log(`Live Divine Price: 1 Div = ${divineValC.toFixed(1)}c`, 'success');
      }
    }
    
    while (!this.stopRequested) {
      this.setState(TRADER_STATES.HUNTING);
      if (targetItems.length === 0) {
        this.log('No target items configured.', 'error');
        break;
      }
      
      const currentItem = targetItems[itemIndex % targetItems.length];
      this.log(`Hunting for ${currentItem.name}...`);
      
      // Select Chaos <-> Item
      await this.setCurrencySlot(coords.I_HAVE_SEARCH_BOX, coords.TOP_SEARCH_RESULT, 'Chaos Orb', timing);
      if (this.stopRequested) break;
      await this.setCurrencySlot(coords.I_WANT_SEARCH_BOX, coords.TOP_SEARCH_RESULT, currentItem.search_term, timing);
      if (this.stopRequested) break;
      await sleep(timing.ratio_load_delay * 1000);
      
      const cHaveStr = await this.readBoxValue(coords.I_HAVE_PRICE_BOX, timing.click_delay * 1000);
      const cWantStr = await this.readBoxValue(coords.I_WANT_PRICE_BOX, timing.click_delay * 1000);
      const chaosRate = parseRate(cHaveStr, cWantStr); 
      
      if (!chaosRate || this.stopRequested) {
        itemIndex++;
        continue;
      }

      await this.setCurrencySlot(coords.I_HAVE_SEARCH_BOX, coords.TOP_SEARCH_RESULT, 'Divine Orb', timing);
      if (this.stopRequested) break;
      await sleep(timing.ratio_load_delay * 1000);
      
      const dHaveStr = await this.readBoxValue(coords.I_HAVE_PRICE_BOX, timing.click_delay * 1000);
      const dWantStr = await this.readBoxValue(coords.I_WANT_PRICE_BOX, timing.click_delay * 1000);
      const divineRate = parseRate(dHaveStr, dWantStr);
      
      if (!divineRate || this.stopRequested) {
        itemIndex++;
        continue;
      }

      const itemLotSize = divineRate.wantAmount; 
      const divLotSize = divineRate.haveAmount;  
      
      const costInChaos = itemLotSize * (chaosRate.haveAmount / chaosRate.wantAmount); 
      const revenueInChaos = divLotSize * divineValC; 
      const profit = revenueInChaos - costInChaos; 
      
      if (profit >= minProfitC) {
        this.log(`🔥 Arbitrage Found on ${currentItem.name}! Profit: +${profit.toFixed(1)}c`, 'success');
        
        this.setState(TRADER_STATES.EXECUTE_BUY);
        await this.setCurrencySlot(coords.I_HAVE_SEARCH_BOX, coords.TOP_SEARCH_RESULT, 'Chaos Orb', timing);
        await sleep(500);
        
        this.log(`Executing Buy: ${itemLotSize} ${currentItem.name} for ${costInChaos.toFixed(1)}c`);
        await this.clickPoint(coords.PLACE_ORDER_BTN, timing.click_delay * 1000); 
        await sleep(300);
        await this.clickPoint(coords.CONFIRM_ORDER_BTN, timing.click_delay * 1000); 
        await sleep(800); 
        
        if (this.stopRequested) break;
        
        this.setState(TRADER_STATES.VALIDATE_SELL);
        this.log(`Validating Sell Market...`);
        await this.sendCommand({ action: 'ctrl_click', x: coords.I_HAVE_SEARCH_BOX.x, y: coords.I_HAVE_SEARCH_BOX.y }); 
        await sleep(300);
        await this.setCurrencySlot(coords.I_WANT_SEARCH_BOX, coords.TOP_SEARCH_RESULT, 'Divine Orb', timing);
        await sleep(timing.ratio_load_delay * 1000);
        
        const vHaveStr = await this.readBoxValue(coords.I_HAVE_PRICE_BOX, timing.click_delay * 1000);
        const vWantStr = await this.readBoxValue(coords.I_WANT_PRICE_BOX, timing.click_delay * 1000);
        const valRate = parseRate(vHaveStr, vWantStr);
        
        let safeToSell = false;
        if (valRate) {
          const newRevenue = (valRate.wantAmount / valRate.haveAmount) * itemLotSize * divineValC;
          if ((newRevenue - costInChaos) >= 0) {
            safeToSell = true;
          }
        }
        
        if (safeToSell) {
          this.setState(TRADER_STATES.EXECUTE_SELL);
          this.log(`Market Safe. Executing Sell for Divine. Locking profit!`, 'success');
          await this.clickPoint(coords.PLACE_ORDER_BTN, timing.click_delay * 1000);
          await sleep(300);
          await this.clickPoint(coords.CONFIRM_ORDER_BTN, timing.click_delay * 1000);
          await sleep(1000);
        } else {
          this.setState(TRADER_STATES.PANIC_DUMP);
          this.log(`🚨 Market shifted! Panic Dumping to Chaos!`, 'error');
          await this.setCurrencySlot(coords.I_WANT_SEARCH_BOX, coords.TOP_SEARCH_RESULT, 'Chaos Orb', timing);
          await sleep(500);
          await this.clickPoint(coords.PLACE_ORDER_BTN, timing.click_delay * 1000);
          await sleep(300);
          await this.clickPoint(coords.CONFIRM_ORDER_BTN, timing.click_delay * 1000);
          await sleep(1000);
        }
      } else {
        itemIndex++;
      }
      
      await sleep(timing.pair_interval_delay * 1000);
    }
    
    this.stopAutomation();
    this.setState(TRADER_STATES.IDLE);
    this.log('Trader offline.');
  }
}

module.exports = { AutoTraderEngine, TRADER_STATES };
