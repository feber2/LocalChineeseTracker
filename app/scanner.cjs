'use strict';

const { spawn } = require('child_process');
const { createInterface } = require('readline');
const path = require('path');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const DEFAULT_TIMING = {
  write_interval: 0.02,
  post_search_delay: 0.15,
  ratio_load_delay: 0.25,
  click_delay: 0.05,
  swap_clear_delay: 0.15,
  pair_interval_delay: 0.20
};

const DEFAULT_COORDS = {
  I_HAVE_SEARCH_BOX: { x: 0, y: 0 },
  I_WANT_SEARCH_BOX: { x: 0, y: 0 },
  TOP_SEARCH_RESULT: { x: 0, y: 0 },
  I_HAVE_PRICE_BOX: { x: 0, y: 0 },
  I_WANT_PRICE_BOX: { x: 0, y: 0 }
};

function parseRate(haveStr, wantStr) {
  if (!haveStr || !wantStr) return null;

  // Clean strings (remove commas, newlines, extra spaces)
  const cleanHave = haveStr.toString().replace(/,/g, '').trim();
  const cleanWant = wantStr.toString().replace(/,/g, '').trim();

  let have = parseFloat(cleanHave);
  let want = parseFloat(cleanWant);

  // Handle fractional inputs if copied as '1/150'
  if (cleanHave.includes('/')) {
    const parts = cleanHave.split('/');
    have = parseFloat(parts[0]) / parseFloat(parts[1]);
  }
  if (cleanWant.includes('/')) {
    const parts = cleanWant.split('/');
    want = parseFloat(parts[0]) / parseFloat(parts[1]);
  }

  if (isNaN(have) || isNaN(want) || want === 0 || have === 0) return null;
  return {
    haveAmount: have,
    wantAmount: want,
    ratePerUnit: have / want,
    formattedStr: `${cleanHave} : ${cleanWant}`
  };
}

class ScannerEngine {
  constructor() {
    this.stopRequested = false;
    this.isScanning = false;
    this.onUpdate = null;
    this.automationProcess = null;
    this.pendingCallbacks = [];
    this.rl = null;
    this.automationScriptPath = path.join(__dirname, '..', 'automation.py');
  }

  setUpdateCallback(fn) {
    this.onUpdate = fn;
  }

  broadcast(type, data) {
    if (this.onUpdate) this.onUpdate(type, data);
  }

  // ---- Automation process lifecycle ----

  startAutomation() {
    if (this.automationProcess) return; // already running

    this.automationProcess = spawn('python', [this.automationScriptPath]);
    this.pendingCallbacks = [];

    this.automationProcess.on('error', (err) => {
      console.error('[Scanner] automation.py spawn error:', err.message);
      this._drainCallbacks('Automation process failed to start: ' + err.message);
    });

    this.automationProcess.on('close', (code) => {
      console.log('[Scanner] automation.py closed, code:', code);
      this._drainCallbacks('Automation process terminated');
      this.automationProcess = null;
      this.rl = null;
    });

    this.rl = createInterface({ input: this.automationProcess.stdout });
    this.rl.on('line', (line) => {
      try {
        const response = JSON.parse(line.trim());
        const cb = this.pendingCallbacks.shift();
        if (cb) cb(response);
      } catch (e) {
        console.error('[Scanner] Unparseable response:', line);
      }
    });

    this.automationProcess.stderr.on('data', (d) => {
      console.error('[Scanner] Python:', d.toString().trim());
    });
  }

  stopAutomation() {
    if (this.automationProcess) {
      this.automationProcess.kill();
      this.automationProcess = null;
    }
    this._drainCallbacks('Scanner stopped');
  }

  _drainCallbacks(msg) {
    const cbs = [...this.pendingCallbacks];
    this.pendingCallbacks = [];
    cbs.forEach(cb => cb({ status: 'error', message: msg }));
  }

  sendCommand(cmd) {
    return new Promise((resolve, reject) => {
      if (!this.automationProcess) {
        return reject(new Error('Automation process not running'));
      }
      this.pendingCallbacks.push((response) => {
        if (response.status === 'ok') resolve(response.result);
        else reject(new Error(response.message));
      });
      this.automationProcess.stdin.write(JSON.stringify(cmd) + '\n');
    });
  }

  // ---- Stop ----

  stop() {
    this.stopRequested = true;
    this.isScanning = false;
    this.stopAutomation();
  }

  // ---- Low-level actions ----

  async clickPoint(coord, delayMs = 50) {
    await this.sendCommand({ action: 'click', x: coord.x, y: coord.y });
    await sleep(delayMs);
  }

  async selectCurrencyInSlot(searchBox, topResult, keyword, timing) {
    await this.clickPoint(searchBox, timing.click_delay * 1000);
    if (this.stopRequested) return;
    await this.sendCommand({ action: 'type', text: keyword, interval: timing.write_interval });
    await sleep(timing.post_search_delay * 1000);
    if (this.stopRequested) return;
    await this.clickPoint(topResult, timing.click_delay * 1000);
  }

  async readBoxValue(boxCoord, timing) {
    const fetchClipboardWithWait = async () => {
      await this.sendCommand({ action: 'clear_clipboard' });
      await this.clickPoint(boxCoord, timing.click_delay * 1000);
      await sleep(30);
      await this.sendCommand({ action: 'hotkey', keys: ['ctrl', 'c'] });

      // Poll clipboard up to 1 second (20 steps x 50ms)
      for (let i = 0; i < 20; i++) {
        await sleep(50);
        if (this.stopRequested) return '';
        const val = await this.sendCommand({ action: 'get_clipboard' });
        if (val && val.trim().length > 0) {
          return val.trim();
        }
      }
      return '';
    };

    // First Attempt
    let value = await fetchClipboardWithWait();
    if (value) return value;

    // Retry once if empty
    if (!this.stopRequested) {
      await sleep(100);
      value = await fetchClipboardWithWait();
    }

    return value || '';
  }

  async clearBoxValue(boxCoord, timing) {
    await this.clickPoint(boxCoord, timing.click_delay * 1000);
    await sleep(30);
    await this.sendCommand({ action: 'press', key: 'backspace' });
    await sleep(timing.swap_clear_delay * 1000);
  }

  // ---- Pair scanning ----

  async scanSinglePairBidAsk(haveSearch, wantSearch, coords, timing) {
    try {
      const topResultCoord = coords.TOP_SEARCH_RESULT || coords.I_HAVE_TOP_RESULT || { x: 0, y: 0 };
      await this.selectCurrencyInSlot(coords.I_HAVE_SEARCH_BOX, topResultCoord, haveSearch, timing);
      if (this.stopRequested) return [null, null];

      await this.selectCurrencyInSlot(coords.I_WANT_SEARCH_BOX, topResultCoord, wantSearch, timing);
      if (this.stopRequested) return [null, null];

      // Delay for PoE UI to fetch & populate ratio values into price boxes
      const ratioDelay = (timing.ratio_load_delay ?? 0.25) * 1000;
      await sleep(ratioDelay);
      if (this.stopRequested) return [null, null];

      // Direction 1
      const rawHave1 = await this.readBoxValue(coords.I_HAVE_PRICE_BOX, timing);
      if (this.stopRequested) return [null, null];
      const rawWant1 = await this.readBoxValue(coords.I_WANT_PRICE_BOX, timing);
      if (this.stopRequested) return [null, null];
      const dir1 = parseRate(rawHave1, rawWant1);

      // Ctrl+Click to swap sides in PoE UI
      await this.sendCommand({ action: 'ctrl_click', x: coords.I_HAVE_SEARCH_BOX.x, y: coords.I_HAVE_SEARCH_BOX.y });
      await sleep(timing.click_delay * 1000);
      if (this.stopRequested) return [dir1, null];

      // Clear price boxes after swap
      await this.clearBoxValue(coords.I_HAVE_PRICE_BOX, timing);
      if (this.stopRequested) return [dir1, null];
      await this.clearBoxValue(coords.I_WANT_PRICE_BOX, timing);
      if (this.stopRequested) return [dir1, null];

      // Direction 2
      const rawHave2 = await this.readBoxValue(coords.I_HAVE_PRICE_BOX, timing);
      if (this.stopRequested) return [null, null];
      const rawWant2 = await this.readBoxValue(coords.I_WANT_PRICE_BOX, timing);
      if (this.stopRequested) return [null, null];
      const dir2 = parseRate(rawHave2, rawWant2);

      return [dir1, dir2];
    } catch (e) {
      // Thrown if automation process was killed (stop requested)
      return [null, null];
    }
  }

  // ---- Main scan loop ----

  async scanLoop(currencies, coords, timing) {
    if (coords.I_HAVE_SEARCH_BOX.x === 0) {
      this.broadcast('error', { message: 'Calibrate UI coordinates first!' });
      return;
    }

    this.stopRequested = false;
    this.isScanning = true;
    this.startAutomation();

    // Verify Python is running
    try {
      await this.sendCommand({ action: 'ping' });
    } catch (e) {
      this.broadcast('error', { message: 'Failed to start automation.py. Is Python/pyautogui installed?' });
      this.isScanning = false;
      return;
    }

    const enabled = currencies.filter(c => c.enabled !== false && c.name !== 'Divine Orb' && c.name !== 'Chaos Orb');
    if (enabled.length === 0) {
      this.broadcast('error', { message: 'No currencies enabled!' });
      this.isScanning = false;
      this.stopAutomation();
      return;
    }

    // Benchmark: Divine <-> Chaos
    this.broadcast('status', { message: 'BENCHMARK: Divine Orb <-> Chaos Orb...' });
    const [divDir1, divDir2] = await this.scanSinglePairBidAsk('Divine Orb', 'Chaos Orb', coords, timing);

    let baseDivineRate = 180;
    if (divDir1 && divDir1.ratePerUnit > 1) {
      baseDivineRate = divDir1.ratePerUnit;
    } else if (divDir1 && divDir1.wantAmount > 1) {
      baseDivineRate = divDir1.wantAmount / (divDir1.haveAmount || 1);
    } else if (divDir2 && divDir2.haveAmount > 1) {
      baseDivineRate = divDir2.haveAmount / (divDir2.wantAmount || 1);
    }

    this.broadcast('base_rate', { rate: baseDivineRate });

    if (this.stopRequested) {
      this._finish(true);
      return;
    }

    // Scan each enabled currency
    for (let i = 0; i < enabled.length; i++) {
      if (this.stopRequested) break;
      const item = enabled[i];
      this.broadcast('status', { message: `SCANNING (${i + 1}/${enabled.length}): ${item.name}` });

      const [chaosDir1, chaosDir2] = await this.scanSinglePairBidAsk('Chaos Orb', item.search_term, coords, timing);
      if (this.stopRequested) break;

      const [divineDir1, divineDir2] = await this.scanSinglePairBidAsk('Divine Orb', item.search_term, coords, timing);
      if (this.stopRequested) break;

      // Calculate rates and simple arbitrage
      const chaosBuyRate = chaosDir1 ? chaosDir1.ratePerUnit : null;
      const chaosSellRate = chaosDir2 ? (1 / chaosDir2.ratePerUnit) : null;
      const divineBuyRateInChaos = divineDir1 ? (divineDir1.ratePerUnit * baseDivineRate) : null;
      const divineSellRateInChaos = divineDir2 ? ((1 / divineDir2.ratePerUnit) * baseDivineRate) : null;

      const buyOptions = [chaosBuyRate, divineBuyRateInChaos].filter(v => v !== null);
      const sellOptions = [chaosSellRate, divineSellRateInChaos].filter(v => v !== null);
      const bestBuy = buyOptions.length ? Math.min(...buyOptions) : null;
      const bestSell = sellOptions.length ? Math.max(...sellOptions) : null;
      const profitChaos = (bestBuy !== null && bestSell !== null) ? (bestSell - bestBuy) : 0;
      const roi = (bestBuy && profitChaos > 0) ? ((profitChaos / bestBuy) * 100) : 0;

      // Determine trade route
      let route = "No Arbitrage";
      if (profitChaos > 0 && bestBuy !== null && bestSell !== null) {
        const buyCurrency = (bestBuy === chaosBuyRate) ? "Chaos" : "Divine";
        const sellCurrency = (bestSell === chaosSellRate) ? "Chaos" : "Divine";
        route = `Buy w/ ${buyCurrency} ➔ Sell for ${sellCurrency}`;
      }

      const record = {
        itemName: item.name,
        chaosBuyStr: chaosDir1 ? chaosDir1.formattedStr : (chaosBuyRate ? chaosBuyRate.toFixed(2) : 'N/A'),
        chaosSellStr: chaosDir2 ? chaosDir2.formattedStr : (chaosSellRate ? (1/chaosSellRate).toFixed(2) : 'N/A'),
        divineBuyStr: divineDir1 ? divineDir1.formattedStr : 'N/A',
        divineSellStr: divineDir2 ? divineDir2.formattedStr : 'N/A',
        route: route,
        profitChaos: profitChaos > 0 ? `+${profitChaos.toFixed(1)} C` : '0.0 C',
        roi: roi > 0 ? `+${roi.toFixed(1)}%` : '0.0%',
        isProfitable: profitChaos > 0,
        updatedAt: new Date().toLocaleTimeString()
      };

      this.broadcast('record', record);
      await sleep(timing.pair_interval_delay * 1000);
    }

    this._finish(this.stopRequested);
  }

  _finish(wasStopped) {
    this.stopAutomation();
    this.isScanning = false;
    if (wasStopped) {
      this.broadcast('status', { message: 'STATUS: 🛑 STOPPED' });
    } else {
      this.broadcast('status', { message: 'STATUS: SCAN COMPLETE! ✅' });
    }
    this.broadcast('scan_finished', {});
  }

  // ---- Calibration ----

  async captureMousePosition(delaySeconds = 3) {
    this.startAutomation();
    if (delaySeconds > 0) {
      await sleep(delaySeconds * 1000);
    }
    try {
      const pos = await this.sendCommand({ action: 'get_mouse_pos' });
      this.stopAutomation();
      return pos;
    } catch (e) {
      this.stopAutomation();
      return { x: 0, y: 0 };
    }
  }
}

module.exports = { ScannerEngine, DEFAULT_TIMING, DEFAULT_COORDS };
