def calculate_arbitrage_opportunities(item_name, chaos_rates, divine_rates, divine_chaos_benchmark):
    """
    Calculates high-precision arbitrage loops for an item across Chaos and Divine trading pairs.
    """
    results = {
        "item_name": item_name,
        "best_loop_name": "No Arbitrage",
        "route_summary": "No Arbitrage",
        "net_profit_chaos": 0.0,
        "roi_percent": 0.0,
        "is_profitable": False,
        "execution_steps": [],
        "details": []
    }

    if not divine_chaos_benchmark or divine_chaos_benchmark <= 0:
        return results

    chaos_buy_items = chaos_rates.get("parsed_dir1", {}).get("items_per_chaos")
    chaos_sell_items = chaos_rates.get("parsed_dir2", {}).get("items_per_chaos")

    divine_buy_items = divine_rates.get("parsed_dir1", {}).get("items_per_chaos")
    divine_sell_items = divine_rates.get("parsed_dir2", {}).get("items_per_chaos")

    if not all([chaos_buy_items, chaos_sell_items, divine_buy_items, divine_sell_items]):
        return results

    start_investment_chaos = divine_chaos_benchmark  # 1 Divine equivalent in Chaos

    # --- LOOP 1: Buy with CHAOS -> Sell for DIVINE -> Convert Div to Chaos ---
    # Step 1: Buy Item X with 180 Chaos
    items_bought_l1 = start_investment_chaos * chaos_buy_items
    # Step 2: Sell Item X for Divines
    divines_obtained_l1 = items_bought_l1 / divine_sell_items
    # Step 3: Convert Divines to Chaos
    final_chaos_l1 = divines_obtained_l1 * divine_chaos_benchmark
    profit_l1 = final_chaos_l1 - start_investment_chaos
    roi_l1 = (profit_l1 / start_investment_chaos) * 100.0

    steps_l1 = [
        f"1. Spend {start_investment_chaos:.1f} Chaos -> Buy {items_bought_l1:.4f} {item_name} (Rate: {chaos_buy_items:.4f}/c)",
        f"2. Sell {items_bought_l1:.4f} {item_name} -> Receive {divines_obtained_l1:.4f} Divines (Rate: {divine_sell_items:.4f}/div)",
        f"3. Convert Divines to Chaos at {divine_chaos_benchmark:.1f}c/div -> Final: {final_chaos_l1:.2f} Chaos"
    ]

    loop1_detail = {
        "loop_name": f"Buy with CHAOS ➔ Sell for DIVINE",
        "net_profit": profit_l1,
        "roi": roi_l1,
        "steps": steps_l1
    }

    # --- LOOP 2: Buy with DIVINE -> Sell for CHAOS -> Convert Chaos to Div ---
    # Step 1: Buy Item X with 1 Divine
    items_bought_l2 = 1.0 * divine_buy_items
    # Step 2: Sell Item X for Chaos
    chaos_obtained_l2 = items_bought_l2 / chaos_sell_items
    # Step 3: Convert Chaos back to Divines
    divines_obtained_l2 = chaos_obtained_l2 / divine_chaos_benchmark
    profit_l2_chaos = (divines_obtained_l2 - 1.0) * divine_chaos_benchmark
    roi_l2 = (profit_l2_chaos / start_investment_chaos) * 100.0

    steps_l2 = [
        f"1. Spend 1 Divine -> Buy {items_bought_l2:.4f} {item_name} (Rate: {divine_buy_items:.4f}/div)",
        f"2. Sell {items_bought_l2:.4f} {item_name} -> Receive {chaos_obtained_l2:.2f} Chaos (Rate: {chaos_sell_items:.4f}/c)",
        f"3. Convert {divine_chaos_benchmark:.1f} Chaos back to 1 Divine -> Keep +{profit_l2_chaos:.2f} Chaos Profit!"
    ]

    loop2_detail = {
        "loop_name": f"Buy with DIVINE ➔ Sell for CHAOS",
        "net_profit": profit_l2_chaos,
        "roi": roi_l2,
        "steps": steps_l2
    }

    # Pick best loop
    best_loop = max([loop1_detail, loop2_detail], key=lambda x: x["net_profit"])

    if best_loop["net_profit"] > 0:
        results["is_profitable"] = True
        results["best_loop_name"] = best_loop["loop_name"]
        results["route_summary"] = best_loop["loop_name"]
        results["net_profit_chaos"] = round(best_loop["net_profit"], 2)
        results["roi_percent"] = round(best_loop["roi"], 2)
        results["execution_steps"] = best_loop["steps"]

    return results
