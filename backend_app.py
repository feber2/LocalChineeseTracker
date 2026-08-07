import os
import json
import urllib.request
import argparse
from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any

# Parse arguments
parser = argparse.ArgumentParser()
parser.add_argument("--userdata", default=os.path.dirname(os.path.abspath(__file__)), help="Path to user data folder")
args, unknown = parser.parse_known_args()
USER_DATA_DIR = args.userdata

# Ensure user data dir exists
os.makedirs(USER_DATA_DIR, exist_ok=True)

app = FastAPI(title="Headhunting API Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

HEADHUNTING_FILE = os.path.join(USER_DATA_DIR, "headhunting_settings.json")

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)
