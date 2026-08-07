import datetime
import os

REPORT_FILE = "market_report.md"


def generate_market_report(records, base_divine_rate=180.0, report_file_path=REPORT_FILE):
    """
    Takes a list of scanned record dicts and generates a formatted Markdown report
    including step-by-step trade execution recipes for profitable loops.
    """
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    md_lines = [
        "# ⚡ PATH OF EXILE - LIVE ARBITRAGE & TRADE RECIPE REPORT",
        f"*Last Updated: {now_str}* | **Base Rate: 1 Divine = {base_divine_rate:.1f} Chaos**\n",
        "## 💰 TOP PROFITABLE TRADE RECIPES\n"
    ]

    profitable_records = [r for r in records if r.get("arb_res", {}).get("is_profitable", False)]

    if not profitable_records:
        md_lines.append("*No profitable arbitrage loops detected in current scan.*")
    else:
        for r in profitable_records:
            arb = r["arb_res"]
            item = r["item_name"]
            profit = arb["net_profit_chaos"]
            roi = arb["roi_percent"]
            route = arb["route_summary"]
            steps = arb.get("execution_steps", [])

            md_lines.append(f"### 🚀 [{item}] — Net Profit: +{profit:.1f} Chaos (+{roi:.1f}% ROI)")
            md_lines.append(f"**Route**: `{route}`")
            md_lines.append("**Execution Steps**:")
            for s in steps:
                md_lines.append(f"- {s}")
            md_lines.append("")

    md_lines.append("\n---\n")
    md_lines.append("## 📊 FULL MARKET RATIOS MATRIX\n")
    md_lines.append("| Currency Item | Chaos Buy (c -> Item) | Chaos Sell (Item -> c) | Divine Buy (div -> Item) | Divine Sell (Item -> div) | Best Route | Net Profit |")
    md_lines.append("| :--- | :--- | :--- | :--- | :--- | :--- | :--- |")

    if not records:
        md_lines.append("| *No scan data recorded yet* | -- | -- | -- | -- | -- | -- |")
    else:
        for r in records:
            item_name = r.get("item_name", "Unknown")
            c_buy = r.get("chaos_buy_str", "N/A")
            c_sell = r.get("chaos_sell_str", "N/A")
            d_buy = r.get("divine_buy_str", "N/A")
            d_sell = r.get("divine_sell_str", "N/A")
            profit = r.get("profit_chaos", "0.0 C")
            route = r.get("route", "None")

            md_lines.append(f"| **{item_name}** | `{c_buy}` | `{c_sell}` | `{d_buy}` | `{d_sell}` | `{route}` | **{profit}** |")

    report_content = "\n".join(md_lines)

    try:
        with open(report_file_path, "w", encoding="utf-8") as f:
            f.write(report_content)
    except Exception as e:
        print(f"[!] Error writing {report_file_path}: {e}")

    return report_content
