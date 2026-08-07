import tkinter as tk
from tkinter import ttk, messagebox
import threading
import time
import json
import os
import pyautogui
import pyperclip
import keyboard
import rate_parser
import reporter
import arbitrage_engine

# Safety settings
pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.05

COORDS_FILE = "ui_coordinates.json"
CURRENCY_FILE = "currency_registry.json"
TIMING_FILE = "timing_settings.json"

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


def click_point(coord, delay=0.05, clicks=1):
    pyautogui.moveTo(coord["x"], coord["y"])
    time.sleep(0.04)  # Hover settle delay
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


class SleekPoEArbitrageGUI(tk.Tk):
    def __init__(self):
        super().__init__()

        self.title("⚡ MAGIC POE - CURRENCY ARBITRAGE ENGINE")
        self.geometry("980x660")
        self.minsize(920, 600)
        
        # Color Palette - Sleek Dark PoE Crafting UI
        self.BG_MAIN = "#0b0d14"
        self.BG_PANEL = "#131622"
        self.BG_CARD = "#191c2b"
        self.ACCENT_CYAN = "#00d2ff"
        self.ACCENT_GOLD = "#ffb400"
        self.TEXT_WHITE = "#e2e8f0"
        self.TEXT_MUTED = "#94a3b8"
        self.BORDER_COLOR = "#232738"

        self.configure(bg=self.BG_MAIN)

        # State variables
        self.is_scanning = False
        self.stop_requested = False
        self.scanned_records = []
        
        self.coords = self.load_json(COORDS_FILE, DEFAULT_COORDINATES)
        self.currencies = self.load_json(CURRENCY_FILE, [])
        self.timing = self.load_json(TIMING_FILE, DEFAULT_TIMING)

        self.setup_styles()
        self.build_sidebar_layout()
        self.setup_hotkeys()

    def load_json(self, filepath, fallback):
        if os.path.exists(filepath):
            try:
                with open(filepath, "r") as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error loading {filepath}: {e}")
        return fallback

    def save_json(self, filepath, data):
        try:
            with open(filepath, "w") as f:
                json.dump(data, f, indent=4)
        except Exception as e:
            messagebox.showerror("Error", f"Failed to save {filepath}: {e}")

    def setup_styles(self):
        self.style = ttk.Style(self)
        self.style.theme_use("clam")

        self.style.configure(".", background=self.BG_MAIN, foreground=self.TEXT_WHITE, font=("Segoe UI", 10))
        self.style.configure("Treeview", background=self.BG_CARD, foreground=self.TEXT_WHITE,
                             fieldbackground=self.BG_CARD, rowheight=28, borderwidth=0)
        self.style.configure("Treeview.Heading", background="#1e2235", foreground=self.ACCENT_CYAN,
                             font=("Segoe UI", 10, "bold"))
        self.style.map("Treeview", background=[("selected", "#2a3047")])

    def setup_hotkeys(self):
        try:
            keyboard.add_hotkey('f1', self.on_f1_pressed)
            keyboard.add_hotkey('f2', self.emergency_stop)
        except Exception as e:
            print(f"[!] Warning: Could not register global hotkeys: {e}")

    def on_f1_pressed(self):
        self.after(0, self.trigger_one_loop)

    def emergency_stop(self):
        self.stop_requested = True
        self.is_scanning = False
        self.after(0, lambda: self.lbl_status.config(text="STATUS: 🛑 STOPPED (F2)", fg="#ff4d4d"))
        self.after(0, lambda: self.btn_f1_start.config(bg=self.ACCENT_GOLD, text="▶ START SCAN (F1)"))

    # --- SIDEBAR & MAIN CONTAINER LAYOUT ---
    def build_sidebar_layout(self):
        # Top Header Bar
        top_bar = tk.Frame(self, bg=self.BG_PANEL, height=45, highlightthickness=1, highlightbackground=self.BORDER_COLOR)
        top_bar.pack(side="top", fill="x")

        lbl_logo = tk.Label(top_bar, text="⚡ MAGIC POE", font=("Segoe UI", 12, "bold"), fg=self.ACCENT_GOLD, bg=self.BG_PANEL)
        lbl_logo.pack(side="left", padx=15, pady=8)

        lbl_sub = tk.Label(top_bar, text="FAUSTUS CURRENCY ARBITRAGE ENGINE", font=("Segoe UI", 9, "bold"), fg=self.ACCENT_CYAN, bg=self.BG_PANEL)
        lbl_sub.pack(side="left", padx=5)

        self.lbl_status = tk.Label(top_bar, text="STATUS: IDLE", font=("Segoe UI", 9, "bold"), fg=self.TEXT_MUTED, bg=self.BG_PANEL)
        self.lbl_status.pack(side="right", padx=15)

        # Main Workspace Container
        workspace = tk.Frame(self, bg=self.BG_MAIN)
        workspace.pack(fill="both", expand=True)

        # Left Navigation Sidebar
        sidebar = tk.Frame(workspace, bg=self.BG_PANEL, width=200, highlightthickness=1, highlightbackground=self.BORDER_COLOR)
        sidebar.pack(side="left", fill="y", padx=0, pady=0)
        sidebar.pack_propagate(False)

        # Navigation Buttons
        self.nav_buttons = {}
        nav_items = [
            ("dashboard", "📊 Dashboard"),
            ("report", "📋 Live Ratios Report"),
            ("calibration", "🎯 UI Calibration"),
            ("currencies", "🪙 Currency List"),
            ("timing", "⚙️ Speed & Delays")
        ]

        tk.Label(sidebar, text="NAVIGATION", font=("Segoe UI", 8, "bold"), fg=self.TEXT_MUTED, bg=self.BG_PANEL).pack(anchor="w", padx=15, pady=(15, 5))

        for key, text in nav_items:
            btn = tk.Button(sidebar, text=text, font=("Segoe UI", 10, "bold"), fg=self.TEXT_WHITE, bg=self.BG_PANEL,
                            activebackground=self.BG_CARD, activeforeground=self.ACCENT_CYAN, bd=0, anchor="w", padx=15, pady=8,
                            command=lambda k=key: self.switch_tab(k))
            btn.pack(fill="x")
            self.nav_buttons[key] = btn

        # Bottom Action Section inside Sidebar
        bottom_action_frame = tk.Frame(sidebar, bg=self.BG_PANEL)
        bottom_action_frame.pack(side="bottom", fill="x", padx=10, pady=15)

        self.btn_f1_start = tk.Button(bottom_action_frame, text="▶ START SCAN (F1)", font=("Segoe UI", 11, "bold"),
                                       fg="#000000", bg=self.ACCENT_GOLD, activebackground="#e6a300", bd=0, pady=10,
                                       command=self.trigger_one_loop, cursor="hand2")
        self.btn_f1_start.pack(fill="x", pady=4)

        btn_stop = tk.Button(bottom_action_frame, text="🛑 STOP (F2)", font=("Segoe UI", 9, "bold"),
                             fg=self.TEXT_WHITE, bg="#2a1b24", activebackground="#3d2030", bd=0, pady=6,
                             command=self.emergency_stop, cursor="hand2")
        btn_stop.pack(fill="x")

        # Right Content View Area
        self.content_area = tk.Frame(workspace, bg=self.BG_MAIN)
        self.content_area.pack(side="right", fill="both", expand=True, padx=15, pady=15)

        # Content Pages
        self.pages = {}
        self.pages["dashboard"] = self.build_dashboard_page()
        self.pages["report"] = self.build_report_page()
        self.pages["calibration"] = self.build_calibration_page()
        self.pages["currencies"] = self.build_currencies_page()
        self.pages["timing"] = self.build_timing_page()

        self.switch_tab("dashboard")

    def switch_tab(self, key):
        for name, page in self.pages.items():
            page.pack_forget()
            self.nav_buttons[name].config(bg=self.BG_PANEL, fg=self.TEXT_WHITE)

        self.pages[key].pack(fill="both", expand=True)
        self.nav_buttons[key].config(bg=self.BG_CARD, fg=self.ACCENT_CYAN)

    # --- PAGE 1: DASHBOARD ---
    def build_dashboard_page(self):
        page = tk.Frame(self.content_area, bg=self.BG_MAIN)

        # Quick Stats Header Cards
        stats_frame = tk.Frame(page, bg=self.BG_MAIN)
        stats_frame.pack(fill="x", pady=(0, 10))

        self.card_total = self.create_stat_card(stats_frame, "ITEMS SCANNED", "0 Pairs", self.ACCENT_CYAN)
        self.card_total.pack(side="left", fill="x", expand=True, padx=(0, 5))

        self.card_base = self.create_stat_card(stats_frame, "BASE DIVINE RATE", "1 Divine = 180c", self.ACCENT_GOLD)
        self.card_base.pack(side="left", fill="x", expand=True, padx=5)

        self.card_last = self.create_stat_card(stats_frame, "LAST EXTRACTED", "None", self.TEXT_WHITE)
        self.card_last.pack(side="left", fill="x", expand=True, padx=(5, 0))

        # Main Live Data Table
        table_container = tk.Frame(page, bg=self.BG_CARD, highlightthickness=1, highlightbackground=self.BORDER_COLOR)
        table_container.pack(fill="both", expand=True)

        lbl_tbl_title = tk.Label(table_container, text="LIVE MARKET RATIOS MATRIX", font=("Segoe UI", 10, "bold"),
                                 fg=self.ACCENT_CYAN, bg=self.BG_CARD)
        lbl_tbl_title.pack(anchor="w", padx=12, pady=10)

        columns = ("pair", "chaos_buy", "chaos_sell", "divine_buy", "divine_sell", "route", "profit_chaos", "roi")
        self.tree = ttk.Treeview(table_container, columns=columns, show="headings", selectmode="browse")

        self.tree.heading("pair", text="Currency Item")
        self.tree.heading("chaos_buy", text="Chaos Buy (c -> Item)")
        self.tree.heading("chaos_sell", text="Chaos Sell (Item -> c)")
        self.tree.heading("divine_buy", text="Divine Buy (div -> Item)")
        self.tree.heading("divine_sell", text="Divine Sell (Item -> div)")
        self.tree.heading("route", text="Best Trade Route")
        self.tree.heading("profit_chaos", text="Net Profit")
        self.tree.heading("roi", text="ROI %")

        self.tree.column("pair", width=140)
        self.tree.column("chaos_buy", width=180)
        self.tree.column("chaos_sell", width=180)
        self.tree.column("divine_buy", width=180)
        self.tree.column("divine_sell", width=180)
        self.tree.column("route", width=200)
        self.tree.column("profit_chaos", width=90)
        self.tree.column("roi", width=80)

        scrollbar = ttk.Scrollbar(table_container, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)

        self.tree.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        return page

    def create_stat_card(self, parent, title, initial_value, color):
        card = tk.Frame(parent, bg=self.BG_PANEL, highlightthickness=1, highlightbackground=self.BORDER_COLOR, padx=12, pady=10)
        lbl_title = tk.Label(card, text=title, font=("Segoe UI", 8, "bold"), fg=self.TEXT_MUTED, bg=self.BG_PANEL)
        lbl_title.pack(anchor="w")
        lbl_val = tk.Label(card, text=initial_value, font=("Segoe UI", 12, "bold"), fg=color, bg=self.BG_PANEL)
        lbl_val.pack(anchor="w", pady=(2, 0))
        card.val_label = lbl_val
        return card

    # --- PAGE 2: LIVE REPORT ---
    def build_report_page(self):
        page = tk.Frame(self.content_area, bg=self.BG_MAIN)
        
        lbl_info = tk.Label(page, text="INSTANT LIVE REPORT VIEW", font=("Segoe UI", 11, "bold"), fg=self.ACCENT_CYAN, bg=self.BG_MAIN)
        lbl_info.pack(anchor="w", pady=(0, 8))

        report_frame = tk.Frame(page, bg=self.BG_CARD, highlightthickness=1, highlightbackground=self.BORDER_COLOR)
        report_frame.pack(fill="both", expand=True)

        self.txt_report = tk.Text(report_frame, bg=self.BG_CARD, fg=self.TEXT_WHITE, font=("Consolas", 10), bd=0, padx=10, pady=10)
        scrollbar = ttk.Scrollbar(report_frame, orient="vertical", command=self.txt_report.yview)
        self.txt_report.configure(yscrollcommand=scrollbar.set)

        self.txt_report.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        self.txt_report.insert("1.0", "Press F1 or START SCAN to begin live data extraction...")
        return page

    # --- PAGE 3: CALIBRATION ---
    def build_calibration_page(self):
        page = tk.Frame(self.content_area, bg=self.BG_MAIN)

        lbl_info = tk.Label(page, text="UI COORDINATES CALIBRATION", font=("Segoe UI", 11, "bold"), fg=self.ACCENT_GOLD, bg=self.BG_MAIN)
        lbl_info.pack(anchor="w", pady=(0, 5))

        lbl_desc = tk.Label(page, text="Click 'Record Position', switch to PoE within 3 seconds, and hover mouse over the requested element.", font=("Segoe UI", 9), fg=self.TEXT_MUTED, bg=self.BG_MAIN)
        lbl_desc.pack(anchor="w", pady=(0, 10))

        calib_container = tk.Frame(page, bg=self.BG_PANEL, highlightthickness=1, highlightbackground=self.BORDER_COLOR, padx=15, pady=15)
        calib_container.pack(fill="both", expand=True)

        self.coord_labels = {}
        elements = [
            ("I_HAVE_SEARCH_BOX", "1. 'I Have' Search Input Field / Slot"),
            ("I_HAVE_TOP_RESULT", "2. 'I Have' Top Search Result Slot"),
            ("I_WANT_SEARCH_BOX", "3. 'I Want' Search Input Field / Slot"),
            ("I_WANT_TOP_RESULT", "4. 'I Want' Top Search Result Slot"),
            ("I_HAVE_PRICE_BOX", "5. 'I Have' Price Box (Number Field)"),
            ("I_WANT_PRICE_BOX", "6. 'I Want' Price Box (Number Field)")
        ]

        for key, title in elements:
            row = tk.Frame(calib_container, bg=self.BG_PANEL)
            row.pack(fill="x", pady=6)

            lbl_title = tk.Label(row, text=title, width=38, anchor="w", font=("Segoe UI", 10, "bold"), fg=self.TEXT_WHITE, bg=self.BG_PANEL)
            lbl_title.pack(side="left")

            coord_val = self.coords.get(key, {"x": 0, "y": 0})
            lbl_val = tk.Label(row, text=f"({coord_val['x']}, {coord_val['y']})", width=18, fg=self.ACCENT_CYAN, bg=self.BG_PANEL, font=("Segoe UI", 10, "bold"))
            lbl_val.pack(side="left")
            self.coord_labels[key] = lbl_val

            btn_set = tk.Button(row, text="🎯 Record Position", font=("Segoe UI", 9, "bold"), fg=self.TEXT_WHITE, bg="#262b3e",
                                activebackground="#353b54", bd=0, padx=10, pady=4, cursor="hand2",
                                command=lambda k=key: self.calibrate_element(k))
            btn_set.pack(side="right")

        return page

    def calibrate_element(self, key):
        def worker():
            for i in range(3, 0, -1):
                self.lbl_status.config(text=f"Hover over element! Recording in {i}s...", fg=self.ACCENT_GOLD)
                time.sleep(1)
            pos = pyautogui.position()
            self.coords[key] = {"x": pos.x, "y": pos.y}
            self.save_json(COORDS_FILE, self.coords)
            self.coord_labels[key].config(text=f"({pos.x}, {pos.y})")
            self.lbl_status.config(text=f"STATUS: Recorded {key} at ({pos.x}, {pos.y})", fg=self.ACCENT_CYAN)

        threading.Thread(target=worker, daemon=True).start()

    # --- PAGE 4: CURRENCY LIST ---
    def build_currencies_page(self):
        page = tk.Frame(self.content_area, bg=self.BG_MAIN)

        top_frame = tk.Frame(page, bg=self.BG_MAIN)
        top_frame.pack(fill="x", pady=(0, 10))

        tk.Label(top_frame, text="Name:", bg=self.BG_MAIN, fg=self.TEXT_WHITE).pack(side="left", padx=5)
        self.ent_name = ttk.Entry(top_frame, width=18)
        self.ent_name.pack(side="left", padx=5)

        tk.Label(top_frame, text="Search Term:", bg=self.BG_MAIN, fg=self.TEXT_WHITE).pack(side="left", padx=5)
        self.ent_search = ttk.Entry(top_frame, width=22)
        self.ent_search.pack(side="left", padx=5)

        btn_add = tk.Button(top_frame, text="+ Add Currency", font=("Segoe UI", 9, "bold"), fg="#000000", bg=self.ACCENT_CYAN,
                            activebackground="#66e0ff", bd=0, padx=10, pady=3, command=self.add_currency, cursor="hand2")
        btn_add.pack(side="left", padx=5)

        btn_toggle = tk.Button(top_frame, text="🔄 Toggle Enabled", font=("Segoe UI", 9, "bold"), fg=self.TEXT_WHITE, bg="#2a3047",
                               activebackground="#3d4666", bd=0, padx=10, pady=3, command=self.toggle_currency_enabled, cursor="hand2")
        btn_toggle.pack(side="left", padx=5)

        btn_del = tk.Button(top_frame, text="🗑️ Delete", font=("Segoe UI", 9, "bold"), fg="#ff4d4d", bg="#2a1b24",
                            activebackground="#3d2030", bd=0, padx=10, pady=3, command=self.delete_currency, cursor="hand2")
        btn_del.pack(side="left", padx=5)

        curr_frame = tk.Frame(page, bg=self.BG_CARD, highlightthickness=1, highlightbackground=self.BORDER_COLOR)
        curr_frame.pack(fill="both", expand=True)

        self.curr_tree = ttk.Treeview(curr_frame, columns=("enabled", "name", "search_term", "category"), show="headings", selectmode="browse")
        self.curr_tree.heading("enabled", text="Enabled")
        self.curr_tree.heading("name", text="Currency Name")
        self.curr_tree.heading("search_term", text="Search Term")
        self.curr_tree.heading("category", text="Category")

        self.curr_tree.column("enabled", width=90, anchor="center")
        self.curr_tree.column("name", width=220)
        self.curr_tree.column("search_term", width=250)
        self.curr_tree.column("category", width=120)

        # Double-click to toggle enabled status
        self.curr_tree.bind("<Double-1>", lambda e: self.toggle_currency_enabled())

        self.curr_tree.pack(side="left", fill="both", expand=True)
        self.refresh_currency_list()

        return page

    def refresh_currency_list(self):
        for item in self.curr_tree.get_children():
            self.curr_tree.delete(item)
        for c in self.currencies:
            enabled_str = "✔ Yes" if c.get("enabled", True) else "❌ No"
            self.curr_tree.insert("", "end", values=(enabled_str, c["name"], c["search_term"], c.get("category", "General")))

    def add_currency(self):
        name = self.ent_name.get().strip()
        search = self.ent_search.get().strip()
        if not name or not search:
            messagebox.showwarning("Warning", "Please enter both Currency Name and Search Term.")
            return

        self.currencies.append({"name": name, "search_term": search, "enabled": True, "category": "Custom"})
        self.save_json(CURRENCY_FILE, self.currencies)
        self.refresh_currency_list()
        self.ent_name.delete(0, "end")
        self.ent_search.delete(0, "end")

    def toggle_currency_enabled(self):
        selected = self.curr_tree.selection()
        if not selected:
            messagebox.showinfo("Select Item", "Click a row in the table first to toggle its enabled status.")
            return

        item_values = self.curr_tree.item(selected[0])["values"]
        target_name = item_values[1]

        for c in self.currencies:
            if c["name"] == target_name:
                c["enabled"] = not c.get("enabled", True)
                break

        self.save_json(CURRENCY_FILE, self.currencies)
        self.refresh_currency_list()

    def delete_currency(self):
        selected = self.curr_tree.selection()
        if not selected:
            messagebox.showinfo("Select Item", "Click a row in the table first to delete it.")
            return

        item_values = self.curr_tree.item(selected[0])["values"]
        target_name = item_values[1]

        if target_name in ["Divine Orb", "Chaos Orb"]:
            messagebox.showwarning("Core Currency", "Core anchor currencies cannot be deleted.")
            return

        self.currencies = [c for c in self.currencies if c["name"] != target_name]
        self.save_json(CURRENCY_FILE, self.currencies)
        self.refresh_currency_list()

    # --- PAGE 5: SPEED & DELAYS ---
    def build_timing_page(self):
        page = tk.Frame(self.content_area, bg=self.BG_MAIN)

        lbl_info = tk.Label(page, text="AUTOMATION SPEED & TIMING DELAYS", font=("Segoe UI", 11, "bold"), fg=self.ACCENT_CYAN, bg=self.BG_MAIN)
        lbl_info.pack(anchor="w", pady=(0, 5))

        panel = tk.Frame(page, bg=self.BG_PANEL, highlightthickness=1, highlightbackground=self.BORDER_COLOR, padx=15, pady=15)
        panel.pack(fill="both", expand=True)

        self.timing_entries = {}
        fields = [
            ("write_interval", "Typing Speed (delay per key press):", "Seconds (e.g. 0.02)"),
            ("post_search_delay", "Post-Search Delay (wait for dropdown list):", "Seconds (e.g. 0.15)"),
            ("click_delay", "Click & Focus Delay:", "Seconds (e.g. 0.05)"),
            ("swap_clear_delay", "Post-Swap & Clear Delay (wait for rate reset):", "Seconds (e.g. 0.15)"),
            ("pair_interval_delay", "Delay Between Currency Pairs:", "Seconds (e.g. 0.20)")
        ]

        for key, title, hint in fields:
            row = tk.Frame(panel, bg=self.BG_PANEL)
            row.pack(fill="x", pady=8)

            lbl_title = tk.Label(row, text=title, width=42, anchor="w", font=("Segoe UI", 10, "bold"), fg=self.TEXT_WHITE, bg=self.BG_PANEL)
            lbl_title.pack(side="left")

            val = str(self.timing.get(key, DEFAULT_TIMING.get(key, 0.05)))
            ent = ttk.Entry(row, width=12)
            ent.insert(0, val)
            ent.pack(side="left", padx=10)
            self.timing_entries[key] = ent

            lbl_hint = tk.Label(row, text=hint, fg=self.ACCENT_CYAN, bg=self.BG_PANEL, font=("Segoe UI", 9, "italic"))
            lbl_hint.pack(side="left")

        btn_save = tk.Button(page, text="💾 Save Timing Settings", font=("Segoe UI", 10, "bold"), fg="#000000", bg=self.ACCENT_CYAN,
                             activebackground="#66e0ff", bd=0, padx=15, pady=8, command=self.save_timing_settings, cursor="hand2")
        btn_save.pack(pady=15)

        return page

    def save_timing_settings(self):
        try:
            for key, ent in self.timing_entries.items():
                self.timing[key] = float(ent.get().strip())
            self.save_json(TIMING_FILE, self.timing)
            messagebox.showinfo("Saved", "Timing settings saved successfully!")
            self.lbl_status.config(text="STATUS: Updated timing settings!", fg=self.ACCENT_CYAN)
        except ValueError:
            messagebox.showerror("Error", "Invalid number format! Please enter valid numbers (e.g. 0.05).")

    # --- INSTANT LIVE EXTRACTION WORKER ---
    def trigger_one_loop(self):
        if self.is_scanning:
            return
        self.stop_requested = False
        self.is_scanning = True
        self.lbl_status.config(text="STATUS: SCANNING MARKET (F1)...", fg=self.ACCENT_GOLD)
        self.btn_f1_start.config(bg="#996c00", text="⌛ SCANNING...")
        threading.Thread(target=self.one_loop_worker, daemon=True).start()

    def scan_single_pair_bid_ask(self, have_search, want_search, coords, timing, unit_name="Chaos"):
        """Helper to scan a pair in both directions and return parsed rates."""
        # 1. Select Have in I Have slot
        select_currency_in_slot(coords["I_HAVE_SEARCH_BOX"], coords["I_HAVE_TOP_RESULT"], have_search, timing)
        if self.stop_requested: return None, None

        # 2. Select Want in I Want slot
        select_currency_in_slot(coords["I_WANT_SEARCH_BOX"], coords["I_WANT_TOP_RESULT"], want_search, timing)
        if self.stop_requested: return None, None

        # 3. Read Direction 1
        raw_have_1 = read_box_value(coords["I_HAVE_PRICE_BOX"], timing)
        raw_want_1 = read_box_value(coords["I_WANT_PRICE_BOX"], timing)
        parsed_dir1 = rate_parser.calculate_buying_rate(raw_have_1, raw_want_1, unit_name=unit_name)

        # 4. Swap Sides via Ctrl + Left Click on I Have slot
        pyautogui.moveTo(coords["I_HAVE_SEARCH_BOX"]["x"], coords["I_HAVE_SEARCH_BOX"]["y"])
        time.sleep(0.04)
        pyautogui.keyDown('ctrl')
        pyautogui.click()
        pyautogui.keyUp('ctrl')
        time.sleep(timing.get("click_delay", 0.05))

        # Proactive clean before Direction 2
        clear_box_value(coords["I_HAVE_PRICE_BOX"], timing)
        clear_box_value(coords["I_WANT_PRICE_BOX"], timing)
        time.sleep(timing.get("swap_clear_delay", 0.15))

        # 5. Read Direction 2
        raw_have_2 = read_box_value(coords["I_HAVE_PRICE_BOX"], timing)
        raw_want_2 = read_box_value(coords["I_WANT_PRICE_BOX"], timing)
        parsed_dir2 = rate_parser.calculate_selling_rate(raw_have_2, raw_want_2, unit_name=unit_name)

        return parsed_dir1, parsed_dir2

    def one_loop_worker(self):
        coords = self.coords
        timing = self.timing
        
        # Check calibration
        if coords.get("I_HAVE_SEARCH_BOX", {}).get("x", 0) == 0:
            self.after(0, lambda: self.lbl_status.config(text="[!] Calibrate UI coordinates first!", fg="#ff4d4d"))
            self.is_scanning = False
            self.after(0, lambda: self.btn_f1_start.config(bg=self.ACCENT_GOLD, text="▶ START SCAN (F1)"))
            return

        enabled_currencies = [c for c in self.currencies if c.get("enabled", True) and c["name"] not in ["Divine Orb", "Chaos Orb"]]
        
        if not enabled_currencies:
            self.after(0, lambda: self.lbl_status.config(text="[!] No currencies enabled!", fg="#ff4d4d"))
            self.is_scanning = False
            self.after(0, lambda: self.btn_f1_start.config(bg=self.ACCENT_GOLD, text="▶ START SCAN (F1)"))
            return

        self.scanned_records.clear()

        # --- STEP 0: BENCHMARK SCAN (Divine Orb <-> Chaos Orb) ---
        self.after(0, lambda: self.lbl_status.config(text="BENCHMARK SCAN: Divine Orb <-> Chaos Orb...", fg=self.ACCENT_GOLD))
        div_chaos_dir1, div_chaos_dir2 = self.scan_single_pair_bid_ask("Divine Orb", "Chaos Orb", coords, timing)

        base_divine_rate = 180.0  # Default fallback
        if div_chaos_dir1 and div_chaos_dir1.get("items_per_chaos"):
            base_divine_rate = div_chaos_dir1["items_per_chaos"]
            self.after(0, lambda r=base_divine_rate: self.card_base.val_label.config(text=f"1 Divine = {r:.1f}c"))

        print(f"[+] Base Divine Benchmark: 1 Divine = {base_divine_rate:.1f} Chaos")

        # --- STEP 1 & 2: SCAN ITEM AGAINST CHAOS AND DIVINE ---
        for idx, item in enumerate(enabled_currencies, start=1):
            if self.stop_requested or not self.is_scanning:
                break

            item_name = item["name"]
            search_term = item["search_term"]
            self.after(0, lambda i=idx, total=len(enabled_currencies), name=item_name: 
                       self.lbl_status.config(text=f"SCANNING ({i}/{total}): {name} (Chaos & Divine)", fg=self.ACCENT_GOLD))

            try:
                # 1. Chaos Scan (Chaos <-> Item)
                chaos_dir1, chaos_dir2 = self.scan_single_pair_bid_ask("Chaos Orb", search_term, coords, timing, unit_name="Chaos")
                if self.stop_requested: break

                # 2. Divine Scan (Divine <-> Item)
                divine_dir1, divine_dir2 = self.scan_single_pair_bid_ask("Divine Orb", search_term, coords, timing, unit_name="Divine")
                if self.stop_requested: break

                chaos_rates = {"parsed_dir1": chaos_dir1, "parsed_dir2": chaos_dir2}
                divine_rates = {"parsed_dir1": divine_dir1, "parsed_dir2": divine_dir2}

                # Calculate Arbitrage Opportunities
                arb_res = arbitrage_engine.calculate_arbitrage_opportunities(item_name, chaos_rates, divine_rates, base_divine_rate)

                chaos_buy_str = chaos_dir1['formatted_str'] if chaos_dir1 else "N/A"
                chaos_sell_str = chaos_dir2['formatted_str'] if chaos_dir2 else "N/A"
                divine_buy_str = divine_dir1['formatted_str'] if divine_dir1 else "N/A"
                divine_sell_str = divine_dir2['formatted_str'] if divine_dir2 else "N/A"
                now_time = time.strftime("%H:%M:%S")

                route_summary = arb_res.get("route_summary", "No Arbitrage")
                profit_str = f"+{arb_res['net_profit_chaos']:.1f} C" if arb_res["is_profitable"] else "0.0 C"
                roi_str = f"+{arb_res['roi_percent']:.1f}%" if arb_res["is_profitable"] else "0.0%"

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
                    "note": f"Best: {arb_res['best_loop_name']}" if arb_res["is_profitable"] else "Scanned"
                }

                self.scanned_records.append(record)

                # --- INSTANT LIVE UPDATE ---
                self.after(0, lambda r=record: self.on_single_item_extracted(r))

                time.sleep(timing.get("pair_interval_delay", 0.20))

            except Exception as e:
                print(f"[!] Error scanning {item_name}: {e}")

        # Final loop cleanup
        if not self.stop_requested:
            self.after(0, lambda: self.lbl_status.config(text="STATUS: ARBITRAGE SCAN COMPLETE!", fg=self.ACCENT_CYAN))
        
        self.is_scanning = False
        self.after(0, lambda: self.btn_f1_start.config(bg=self.ACCENT_GOLD, text="▶ START SCAN (F1)"))

    def on_single_item_extracted(self, record):
        """INSTANTLY updates dashboard table, stats card, and live report view as soon as 1 item is copied!"""
        item_name = record["item_name"]
        c_buy = record.get("chaos_buy_str", "N/A")
        c_sell = record.get("chaos_sell_str", "N/A")
        d_buy = record.get("divine_buy_str", "N/A")
        d_sell = record.get("divine_sell_str", "N/A")
        route = record.get("route", "No Arbitrage")
        profit_chaos = record.get("profit_chaos", "0.0 C")
        roi = record.get("roi", "0.0%")
        updated_at = record["updated_at"]

        # Update or Insert Row in Dashboard Treeview
        existing_item = None
        for child in self.tree.get_children():
            if self.tree.item(child)["values"][0] == item_name:
                existing_item = child
                break

        if existing_item:
            self.tree.item(existing_item, values=(item_name, c_buy, c_sell, d_buy, d_sell, route, profit_chaos, roi))
        else:
            self.tree.insert("", 0, values=(item_name, c_buy, c_sell, d_buy, d_sell, route, profit_chaos, roi))

        # Update Stats Cards
        self.card_total.val_label.config(text=f"{len(self.scanned_records)} Items")
        self.card_last.val_label.config(text=f"{item_name} ({profit_chaos})")

        # Generate & Refresh Live Report View
        report_md = reporter.generate_market_report(self.scanned_records)
        self.txt_report.delete("1.0", "end")
        self.txt_report.insert("1.0", report_md)


if __name__ == "__main__":
    app = SleekPoEArbitrageGUI()
    app.mainloop()
