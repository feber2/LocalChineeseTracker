import time
import json
import os
import pyautogui
import pyperclip

# Safety Failsafe: Slam mouse into top-left corner of screen to abort script instantly
pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.08  # Default pause between actions (in seconds)

CONFIG_FILE = "ui_coordinates.json"

DEFAULT_COORDINATES = {
    "I_HAVE_SEARCH_BOX": {"x": 0, "y": 0},
    "I_HAVE_TOP_RESULT": {"x": 0, "y": 0},
    "I_WANT_SEARCH_BOX": {"x": 0, "y": 0},
    "I_WANT_TOP_RESULT": {"x": 0, "y": 0},
    "I_HAVE_PRICE_BOX": {"x": 0, "y": 0},
    "I_WANT_PRICE_BOX": {"x": 0, "y": 0},
    "SWAP_BUTTON": {"x": 0, "y": 0}
}


def load_coordinates():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading {CONFIG_FILE}: {e}")
    return DEFAULT_COORDINATES


def save_coordinates(coords):
    with open(CONFIG_FILE, "w") as f:
        json.dump(coords, f, indent=4)
    print(f"\n[+] Saved coordinates to '{CONFIG_FILE}' successfully!")


def calibrate_coordinates():
    """Interactive tool to easily get mouse coordinates for Faustus UI"""
    print("\n" + "="*50)
    print("      FAUSTUS UI COORDINATE CALIBRATION TOOL")
    print("="*50)
    print("Instructions:")
    print("1. Open Path of Exile and open Faustus Currency Exchange window.")
    print("2. Hover your mouse over each requested UI element.")
    print("3. Switch back to this terminal and press Enter to lock in the position.")
    print("="*50 + "\n")

    coords = {}
    elements = [
        ("I_HAVE_SEARCH_BOX", "1. 'I Have' Search Input Field / Slot"),
        ("I_HAVE_TOP_RESULT", "2. 'I Have' Top Search Result Slot"),
        ("I_WANT_SEARCH_BOX", "3. 'I Want' Search Input Field / Slot"),
        ("I_WANT_TOP_RESULT", "4. 'I Want' Top Search Result Slot"),
        ("I_HAVE_PRICE_BOX", "5. 'I Have' Price Box (Number field)"),
        ("I_WANT_PRICE_BOX", "6. 'I Want' Price Box (Number field)")
    ]

    for key, description in elements:
        input(f"-> {description} and press ENTER...")
        pos = pyautogui.position()
        coords[key] = {"x": pos.x, "y": pos.y}
        print(f"   [LOCKED] {key}: ({pos.x}, {pos.y})")

    save_coordinates(coords)
    return coords


def click_point(coord, clicks=1):
    pyautogui.click(coord["x"], coord["y"], clicks=clicks)


def select_currency_in_slot(search_box_coord, top_result_coord, keyword):
    """Click search box, type keyword, click top result"""
    # 1. Click search box
    click_point(search_box_coord)
    time.sleep(0.05)
    
    # 2. Clear search box & type keyword
    pyautogui.hotkey('ctrl', 'a')
    pyautogui.press('backspace')
    pyautogui.write(keyword, interval=0.02)
    time.sleep(0.15)  # Wait for search dropdown to populate
    
    # 3. Click top search result
    click_point(top_result_coord)
    time.sleep(0.1)


def read_box_value(box_coord):
    """Click box, select all, copy, read clipboard"""
    pyperclip.copy("")  # Clear clipboard first
    click_point(box_coord)
    time.sleep(0.05)
    pyautogui.hotkey('ctrl', 'a')
    time.sleep(0.05)
    pyautogui.hotkey('ctrl', 'c')
    time.sleep(0.05)
    return pyperclip.paste().strip()


def clear_box_value(box_coord):
    """Click box, select all, backspace to reset default market rate"""
    click_point(box_coord)
    time.sleep(0.05)
    pyautogui.hotkey('ctrl', 'a')
    time.sleep(0.05)
    pyautogui.press('backspace')
    time.sleep(0.05)


def run_extraction_test(item_a_search="Chaos Orb", item_b_search="Orb of Alteration"):
    coords = load_coordinates()
    
    # Check if calibrated
    if coords["I_HAVE_SEARCH_BOX"]["x"] == 0:
        print("\n[!] Coordinates not set yet. Running calibration first...")
        coords = calibrate_coordinates()

    print("\n" + "="*50)
    print(f" TESTING DATA EXTRACTION: {item_a_search} <-> {item_b_search}")
    print("="*50)
    print("[!] Switch to Path of Exile now! Test starting in 4 seconds...")
    for i in range(4, 0, -1):
        print(f"    Starting in {i}...", end="\r")
        time.sleep(1)
    print("\n[+] Running extraction sequence...\n")

    # Step 1: Select Item A in 'I Have'
    select_currency_in_slot(coords["I_HAVE_SEARCH_BOX"], coords["I_HAVE_TOP_RESULT"], item_a_search)

    # Step 2: Select Item B in 'I Want'
    select_currency_in_slot(coords["I_WANT_SEARCH_BOX"], coords["I_WANT_TOP_RESULT"], item_b_search)
    time.sleep(0.2)

    # Step 3: Read Direction 1 (A -> B)
    raw_have_1 = read_box_value(coords["I_HAVE_PRICE_BOX"])
    raw_want_1 = read_box_value(coords["I_WANT_PRICE_BOX"])
    print(f"--- Direction 1 ({item_a_search} -> {item_b_search}) ---")
    print(f"    I Have Value: '{raw_have_1}'")
    print(f"    I Want Value: '{raw_want_1}'")

    # Step 4: Swap Sides using Ctrl + Left Click on 'I Have' slot
    print("\n[+] Swapping sides via Ctrl + Left Click on 'I Have' slot...")
    pyautogui.keyDown('ctrl')
    click_point(coords["I_HAVE_SEARCH_BOX"])
    pyautogui.keyUp('ctrl')
    time.sleep(0.15)

    # Step 5: Clear Price Boxes to Unlock Market Rate
    print("[+] Clearing price boxes to restore default market rate...")
    clear_box_value(coords["I_HAVE_PRICE_BOX"])
    clear_box_value(coords["I_WANT_PRICE_BOX"])
    time.sleep(0.2)  # Give client time to populate default market rate

    # Step 6: Read Direction 2 (B -> A)
    raw_have_2 = read_box_value(coords["I_HAVE_PRICE_BOX"])
    raw_want_2 = read_box_value(coords["I_WANT_PRICE_BOX"])
    print(f"--- Direction 2 ({item_b_search} -> {item_a_search}) ---")
    print(f"    I Have Value: '{raw_have_2}'")
    print(f"    I Want Value: '{raw_want_2}'")
    print("="*50)
    print("[+] Extraction test completed!")


if __name__ == "__main__":
    print("\n1. Run Calibration (Record screen coordinates)")
    print("2. Run Extraction Test (Test reading prices)")
    choice = input("\nChoose an option (1 or 2): ").strip()
    
    if choice == "1":
        calibrate_coordinates()
    else:
        run_extraction_test()
