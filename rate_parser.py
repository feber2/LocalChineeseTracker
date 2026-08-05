import re


def parse_raw_value(val_str):
    """Clean raw text string from clipboard into float. Returns None if invalid."""
    if not val_str:
        return None
    cleaned = re.sub(r"[^\d.]", "", val_str.strip())
    try:
        val = float(cleaned)
        return val if val > 0 else None
    except ValueError:
        return None


def format_high_precision(val, unit_label="c"):
    """
    Formats a float rate with high precision:
    - If val < 0.1: 5-6 decimal places (e.g. 0.008333 / c)
    - If val >= 0.1: 4 decimal places (e.g. 0.5523 / c)
    """
    if val is None:
        return "N/A"
    
    if val < 0.01:
        return f"{val:.6f} / {unit_label}"
    elif val < 0.1:
        return f"{val:.5f} / {unit_label}"
    elif val < 10.0:
        return f"{val:.4f} / {unit_label}"
    else:
        return f"{val:.2f} / {unit_label}"


def calculate_buying_rate(have_str, want_str, unit_name="Chaos"):
    """
    Direction 1: Buying Item with Currency (I Have = Currency, I Want = Item).
    e.g. 15 Chaos -> 86 Items
    Returns high-precision unit rate and raw ratio.
    """
    curr_val = parse_raw_value(have_str)
    item_val = parse_raw_value(want_str)

    if curr_val is None or item_val is None:
        return {"items_per_chaos": None, "formatted_str": "N/A", "raw_ratio": "N/A"}

    items_per_unit = item_val / curr_val
    unit_label = "c" if unit_name.lower().startswith("chaos") else "div"
    prec_str = format_high_precision(items_per_unit, unit_label)
    
    # Include raw ratio: e.g. "Buy: 0.5523 / c (15:86)"
    formatted = f"Buy: {prec_str} [{have_str}:{want_str}]"

    return {
        "items_per_chaos": items_per_unit,
        "formatted_str": formatted,
        "raw_ratio": f"{have_str}:{want_str}"
    }


def calculate_selling_rate(have_str, want_str, unit_name="Chaos"):
    """
    Direction 2: Selling Item for Currency (I Have = Item, I Want = Currency).
    e.g. 86 Items -> 15 Chaos
    Returns high-precision unit rate and raw ratio.
    """
    item_val = parse_raw_value(have_str)
    curr_val = parse_raw_value(want_str)

    if item_val is None or curr_val is None:
        return {"items_per_chaos": None, "formatted_str": "N/A", "raw_ratio": "N/A"}

    items_per_unit = item_val / curr_val
    unit_label = "c" if unit_name.lower().startswith("chaos") else "div"
    prec_str = format_high_precision(items_per_unit, unit_label)
    
    # Include raw ratio: e.g. "Sell: 0.5612 / c (86:15)"
    formatted = f"Sell: {prec_str} [{have_str}:{want_str}]"

    return {
        "items_per_chaos": items_per_unit,
        "formatted_str": formatted,
        "raw_ratio": f"{have_str}:{want_str}"
    }
