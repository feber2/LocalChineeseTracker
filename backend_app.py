import asyncio
import json
import os
import sys
import time
import urllib.request
import argparse
import pyautogui
import pyperclip
import rate_parser
import arbitrage_engine
import reporter
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any

# Parse arguments
parser = argparse.ArgumentParser()
parser.add_argument("--userdata", default=os.path.dirname(os.path.abspath(__file__)), help="Path to user data folder")
args, unknown = parser.parse_known_args()
USER_DATA_DIR = args.userdata

# Ensure user data dir exists
os.makedirs(USER_DATA_DIR, exist_ok=True)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Safety settings
pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.05

COORDS_FILE = os.path.join(USER_DATA_DIR, "ui_coordinates.json")
CURRENCY_FILE = os.path.join(USER_DATA_DIR, "currency_registry.json")
TIMING_FILE = os.path.join(USER_DATA_DIR, "timing_settings.json")
HEADHUNTING_FILE = os.path.join(USER_DATA_DIR, "headhunting_settings.json")

DEFAULT_TIMING = {
    "write_interval": 0.02,
    "post_search_delay": 0.15,
    "click_delay": 0.05,
    "swap_clear_delay": 0.15,
    "pair_interval_delay": 0.20
}

DEFAULT_COORDINATES = {
    "I_HAVE_SEARCH_BOX": {"x": 0, "y": 0},
    "I_HAVE_TOP_RESULT": {"x": 0, "y": 0},
    "I_WANT_SEARCH_BOX": {"x": 0, "y": 0},
    "I_WANT_TOP_RESULT": {"x": 0, "y": 0},
    "I_HAVE_PRICE_BOX": {"x": 0, "y": 0},
    "I_WANT_PRICE_BOX": {"x": 0, "y": 0}
}


def load_json(filepath, fallback):
    if os.path.exists(filepath):
        try:
            with open(filepath, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading {filepath}: {e}")
    return fallback


def save_json(filepath, data):
    try:
        with open(filepath, "w") as f:
            json.dump(data, f, indent=4)
    except Exception as e:
        print(f"Failed to save {filepath}: {e}")


def click_point(coord, delay=0.05, clicks=1):
    pyautogui.moveTo(coord["x"], coord["y"])
    time.sleep(0.04)
    pyautogui.click(clicks=clicks)
    time.sleep(delay)


def select_currency_in_slot(search_box_coord, top_result_coord, keyword, timing):
    click_point(search_box_coord, delay=timing.get("click_delay", 0.05))
    pyautogui.hotkey('ctrl', 'a')
    pyautogui.press('backspace')
    pyautogui.write(keyword, interval=timing.get("write_interval", 0.02))
    time.sleep(timing.get("post_search_delay", 0.15))
    click_point(top_result_coord, delay=timing.get("click_delay", 0.05))


def read_box_value(box_coord, timing):
    pyperclip.copy("")
    click_point(box_coord, delay=timing.get("click_delay", 0.05))
    pyautogui.hotkey('ctrl', 'a')
    time.sleep(0.03)
    pyautogui.hotkey('ctrl', 'c')
    time.sleep(0.04)
    return pyperclip.paste().strip()


def clear_box_value(box_coord, timing):
    click_point(box_coord, delay=timing.get("click_delay", 0.05))
    pyautogui.hotkey('ctrl', 'a')
    time.sleep(0.03)
    pyautogui.press('backspace')
    time.sleep(timing.get("swap_clear_delay", 0.15))


class ScannerEngine:
    def __init__(self):
        self.is_scanning = False
        self.stop_requested = False
        self.scanned_records = []
        self.connected_websockets = []
        
    async def broadcast(self, message: dict):
        for ws in self.connected_websockets:
            try:
                await ws.send_json(message)
            except Exception:
                pass

    def scan_single_pair_bid_ask(self, have_search, want_search, coords, timing, unit_name="Chaos"):
        select_currency_in_slot(coords["I_HAVE_SEARCH_BOX"], coords["I_HAVE_TOP_RESULT"], have_search, timing)
        if self.stop_requested: return None, None

        select_currency_in_slot(coords["I_WANT_SEARCH_BOX"], coords["I_WANT_TOP_RESULT"], want_search, timing)
        if self.stop_requested: return None, None

        clear_box_value(coords["I_HAVE_PRICE_BOX"], timing)
        clear_box_value(coords["I_WANT_PRICE_BOX"], timing)
        time.sleep(timing.get("swap_clear_delay", 0.15))

        raw_have_1 = read_box_value(coords["I_HAVE_PRICE_BOX"], timing)
        raw_want_1 = read_box_value(coords["I_WANT_PRICE_BOX"], timing)
        parsed_dir1 = rate_parser.calculate_buying_rate(raw_have_1, raw_want_1, unit_name=unit_name)

        pyautogui.moveTo(coords["I_HAVE_SEARCH_BOX"]["x"], coords["I_HAVE_SEARCH_BOX"]["y"])
        time.sleep(0.04)
        pyautogui.keyDown('ctrl')
        pyautogui.click()
        pyautogui.keyUp('ctrl')
        time.sleep(timing.get("click_delay", 0.05))

        clear_box_value(coords["I_HAVE_PRICE_BOX"], timing)
        clear_box_value(coords["I_WANT_PRICE_BOX"], timing)
        time.sleep(timing.get("swap_clear_delay", 0.15))

        raw_have_2 = read_box_value(coords["I_HAVE_PRICE_BOX"], timing)
        raw_want_2 = read_box_value(coords["I_WANT_PRICE_BOX"], timing)
        parsed_dir2 = rate_parser.calculate_selling_rate(raw_have_2, raw_want_2, unit_name=unit_name)

        return parsed_dir1, parsed_dir2

    async def scan_loop(self):
        coords = load_json(COORDS_FILE, DEFAULT_COORDINATES)
        timing = load_json(TIMING_FILE, DEFAULT_TIMING)
        currencies = load_json(CURRENCY_FILE, [])
        
        if coords.get("I_HAVE_SEARCH_BOX", {}).get("x", 0) == 0:
            await self.broadcast({"type": "error", "message": "Calibrate UI coordinates first!"})
            self.is_scanning = False
            return

        enabled_currencies = [c for c in currencies if c.get("enabled", True) and c["name"] not in ["Divine Orb", "Chaos Orb"]]
        
        if not enabled_currencies:
            await self.broadcast({"type": "error", "message": "No currencies enabled!"})
            self.is_scanning = False
            return

        self.scanned_records.clear()

        await self.broadcast({"type": "status", "message": "BENCHMARK SCAN: Divine Orb <-> Chaos Orb..."})
        div_chaos_dir1, div_chaos_dir2 = self.scan_single_pair_bid_ask("Divine Orb", "Chaos Orb", coords, timing)

        base_divine_rate = 180.0
        if div_chaos_dir1 and div_chaos_dir1.get("items_per_chaos"):
            base_divine_rate = div_chaos_dir1["items_per_chaos"]

        await self.broadcast({"type": "base_rate", "rate": base_divine_rate})

        for idx, item in enumerate(enabled_currencies, start=1):
            if self.stop_requested or not self.is_scanning:
                break

            item_name = item["name"]
            search_term = item["search_term"]
            await self.broadcast({"type": "status", "message": f"SCANNING ({idx}/{len(enabled_currencies)}): {item_name} (Chaos & Divine)"})
            await asyncio.sleep(0.01) # Yield to event loop

            try:
                chaos_dir1, chaos_dir2 = self.scan_single_pair_bid_ask("Chaos Orb", search_term, coords, timing, unit_name="Chaos")
                if self.stop_requested: break

                divine_dir1, divine_dir2 = self.scan_single_pair_bid_ask("Divine Orb", search_term, coords, timing, unit_name="Divine")
                if self.stop_requested: break

                chaos_rates = {"parsed_dir1": chaos_dir1, "parsed_dir2": chaos_dir2}
                divine_rates = {"parsed_dir1": divine_dir1, "parsed_dir2": divine_dir2}

                arb_res = arbitrage_engine.calculate_arbitrage_opportunities(item_name, chaos_rates, divine_rates, base_divine_rate)

                chaos_buy_str = chaos_dir1['formatted_str'] if chaos_dir1 else "N/A"
                chaos_sell_str = chaos_dir2['formatted_str'] if chaos_dir2 else "N/A"
                divine_buy_str = divine_dir1['formatted_str'] if divine_dir1 else "N/A"
                divine_sell_str = divine_dir2['formatted_str'] if divine_dir2 else "N/A"
                now_time = time.strftime("%H:%M:%S")

                route_summary = arb_res.get("route_summary", "No Arbitrage")
                profit_str = f"+{arb_res['net_profit_chaos']:.1f} C" if arb_res.get("is_profitable") else "0.0 C"
                roi_str = f"+{arb_res['roi_percent']:.1f}%" if arb_res.get("is_profitable") else "0.0%"

                record = {
                    "item_name": item_name,
                    "chaos_buy_str": chaos_buy_str,
                    "chaos_sell_str": chaos_sell_str,
                    "divine_buy_str": divine_buy_str,
                    "divine_sell_str": divine_sell_str,
                    "route": route_summary,
                    "profit_chaos": profit_str,
                    "roi": roi_str,
                    "arb_res": arb_res,
                    "updated_at": now_time,
                    "note": f"Best: {arb_res['best_loop_name']}" if arb_res.get("is_profitable") else "Scanned"
                }

                self.scanned_records.append(record)
                await self.broadcast({"type": "record", "data": record})
                
                # Generate report md
                reporter.generate_market_report(self.scanned_records, base_divine_rate)

                await asyncio.sleep(timing.get("pair_interval_delay", 0.20))

            except Exception as e:
                print(f"[!] Error scanning {item_name}: {e}")

        if not self.stop_requested:
            await self.broadcast({"type": "status", "message": "STATUS: ARBITRAGE SCAN COMPLETE!"})
        
        self.is_scanning = False
        await self.broadcast({"type": "scan_finished"})


engine = ScannerEngine()

@app.get("/api/status")
def get_status():
    return {"is_scanning": engine.is_scanning}

@app.post("/api/start")
async def start_scan():
    if engine.is_scanning:
        return {"status": "already running"}
    engine.is_scanning = True
    engine.stop_requested = False
    asyncio.create_task(engine.scan_loop())
    return {"status": "started"}

@app.post("/api/stop")
def stop_scan():
    engine.stop_requested = True
    engine.is_scanning = False
    return {"status": "stopped"}

@app.get("/api/currencies")
def get_currencies():
    return load_json(CURRENCY_FILE, [])

@app.post("/api/currencies")
def save_currencies(currencies: List[Dict[str, Any]] = Body(...)):
    save_json(CURRENCY_FILE, currencies)
    return {"status": "saved"}

@app.get("/api/timing")
def get_timing():
    return load_json(TIMING_FILE, DEFAULT_TIMING)

@app.post("/api/timing")
def save_timing(timing: Dict[str, Any] = Body(...)):
    save_json(TIMING_FILE, timing)
    return {"status": "saved"}

@app.get("/api/coords")
def get_coords():
    return load_json(COORDS_FILE, DEFAULT_COORDINATES)

@app.post("/api/coords")
def save_coords_endpoint(coords: Dict[str, Any] = Body(...)):
    save_json(COORDS_FILE, coords)
    return {"status": "saved"}
    
@app.post("/api/calibrate")
def calibrate_point(key: str):
    # This is a bit tricky since calibration needs time to switch windows.
    # In the web app, we can wait 3 seconds and then grab the position.
    time.sleep(3)
    pos = pyautogui.position()
    coords = load_json(COORDS_FILE, DEFAULT_COORDINATES)
    coords[key] = {"x": pos.x, "y": pos.y}
    save_json(COORDS_FILE, coords)
    return {"x": pos.x, "y": pos.y}

@app.get("/api/headhunting_key")
def get_headhunting_key():
    return load_json(HEADHUNTING_FILE, {"api_key": ""})

@app.post("/api/headhunting_key")
def save_headhunting_key(data: Dict[str, Any] = Body(...)):
    save_json(HEADHUNTING_FILE, data)
    return {"status": "saved"}

@app.get("/api/headhunting_data")
def get_headhunting_data():
    settings = load_json(HEADHUNTING_FILE, {"api_key": ""})
    api_key = settings.get("api_key", "")
    if not api_key:
        return {"status": "error", "message": "API key is missing. Please configure it in settings."}
    
    url = f"http://localchinesedealer.wuaze.com/arbitrage/backend/api_headhunting.php?api_key={api_key}&preset=best"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as response:
            data = json.loads(response.read().decode('utf-8'))
            return data
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    engine.connected_websockets.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        engine.connected_websockets.remove(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend_app:app", host="127.0.0.1", port=8000, reload=True)
