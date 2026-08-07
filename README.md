# ⚡ *** - *** Suite

A high-performance, modular desktop GUI application and OCR/Clipboard data extraction engine for ******* Exchange UI.

## 🚀 Key Features

- **Sleek Dark Gaming GUI**: Built with an obsidian/indigo layout matching modern * craft tools.
- **Instant Line-by-Line Live Updates**: Dashboard table, statistics, and reports update in real-time as each currency is copied.
- **Dual-Currency Scan Engine**: Evaluates item ratios against both **** and **** to compute net profit loops.
- **Actionable Step-by-Step Trade Recipes**: Generates exact 3-step trade execution routes (e.g. `Buy with * ➔ Sell for *`).
- **Dynamic High-Precision Parsing**: Displays 4–6 decimal places (`0.008333 / *`) and raw copied ratios (`[15:86]`).
- **Global Hotkeys**:
  - **`F1`**: Trigger 1 Scan Loop.
  - **`F2`**: Emergency Stop / Abort active scanning.
- **Customizable Timing Controls**: Adjust typing speeds, click focus delays, and post-swap pauses dynamically.

## 🛠️ File Structure

- `gui_app.py`: Main desktop interface with sidebar navigation and live event worker.
- `arbitrage_engine.py`: Math engine for */* triangulation and ROI calculations.
- `rate_parser.py`: Parser for raw clipboard text, fractional ratios, and dynamic decimal precision.
- `reporter.py`: Auto-generates `market_report.md` snapshots after every scan pass.
- `currency_registry.json`: JSON configuration for managed currencies and * search terms.
- `timing_settings.json`: User-configured mouse and keyboard delay settings.

## 📦 How to Run

```bash
pip install pyautogui pyperclip keyboard pynput
python gui_app.py
```
