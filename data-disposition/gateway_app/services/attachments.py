# gateway_app/services/attachments.py
import base64
import io
import csv
import math
from typing import List, Dict, Any, Optional, Tuple

import matplotlib
matplotlib.use("Agg")  # headless
import matplotlib.pyplot as plt        # noqa: E402
import matplotlib.patches as mpatches  # noqa: E402
from matplotlib.colors import LinearSegmentedColormap
import numpy as np

from ..config.settings import settings

# ── App-matching dark glass palette ──────────────────────────────────────────
# Mirrors the Nova AI UI: deep space bg + purple/cyan/pink gradient accents
_BG_DARK     = (0, 0, 0, 0)       # Fully transparent figure background
_BG_PANEL    = (0.07, 0.05, 0.15, 0.4) # Semi-transparent glass axes panel
_GRID_COLOR  = "#241850"      # subtle grid lines
_TEXT_MAIN   = "#e8e0ff"      # primary labels (near-white lavender)
_TEXT_DIM    = "#7b6fa0"      # secondary / tick labels
_EDGE_GLOW   = "#9b5cff"      # accent purple

# Vivid gradient palette for multi-category charts
_PALETTE = [
    "#9b5cff",  # electric purple
    "#00dca0",  # cyan-green
    "#ff4ecd",  # hot pink
    "#4e9cff",  # sky blue
    "#ffb347",  # amber
    "#ff6b6b",  # coral red
    "#36d7b7",  # teal
    "#c77dff",  # lavender
    "#ffd166",  # gold
    "#06d6a0",  # mint
    "#ef476f",  # rose
]


def _within_inline_limit(n_bytes: int) -> bool:
    return n_bytes <= int(settings.ATTACH_MAX_INLINE_BYTES)


# ── CSV export ────────────────────────────────────────────────────────────────

def build_csv_attachment(
    rows: List[Dict[str, Any]],
    filename: Optional[str] = None,
) -> Tuple[Optional[Dict[str, Any]], str]:
    rows = rows or []
    if not isinstance(rows, list):
        return None, "CSV export skipped: input is not a list of records."
    lim = int(settings.CSV_ROW_LIMIT)
    limited = rows[:lim]
    if len(limited) == 0:
        return None, "CSV export skipped: no rows."

    fieldnames = sorted({k for r in limited for k in r.keys()})
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for r in limited:
        writer.writerow({k: _stringify_cell(r.get(k)) for k in fieldnames})
    data_bytes = buf.getvalue().encode("utf-8")

    name = filename or "export.csv"
    return {
        "name": name,
        "content_type": "text/csv",
        "bytes": data_bytes,
    }, f"CSV ready: {name} ({len(limited)} rows)."


def _stringify_cell(v: Any) -> str:
    if v is None:
        return ""
    try:
        return str(v)
    except Exception:
        return ""


# ── Dark glass styling helpers ────────────────────────────────────────────────

def _apply_dark_glass_style(ax, fig) -> None:
    """Apply the dark glass aesthetic matching the Nova AI UI."""
    # Figure & axes background
    fig.patch.set_facecolor(_BG_DARK)
    ax.set_facecolor(_BG_PANEL)

    # Spines → dim purple, thinner
    for spine in ax.spines.values():
        spine.set_color("#2d1f55")
        spine.set_linewidth(0.8)

    # Tick labels
    ax.tick_params(colors=_TEXT_DIM, labelsize=9.5, length=3, width=0.7)
    ax.xaxis.label.set_color(_TEXT_MAIN)
    ax.xaxis.label.set_fontsize(10.5)
    ax.yaxis.label.set_color(_TEXT_MAIN)
    ax.yaxis.label.set_fontsize(10.5)

    # Subtle glowing grid
    ax.grid(axis="y", color=_GRID_COLOR, linewidth=0.9,
            linestyle="--", zorder=0, alpha=0.9)
    ax.set_axisbelow(True)


def _apply_dark_glass_style_horizontal(ax, fig) -> None:
    _apply_dark_glass_style(ax, fig)
    ax.grid(axis="x", color=_GRID_COLOR, linewidth=0.9,
            linestyle="--", zorder=0, alpha=0.9)
    ax.grid(axis="y", visible=False)


def _glass_legend(legend) -> None:
    """Style a matplotlib legend with glass effect."""
    frame = legend.get_frame()
    frame.set_facecolor("#1a103a")
    frame.set_edgecolor("#3d2880")
    frame.set_linewidth(0.9)
    frame.set_alpha(0.92)
    for text in legend.get_texts():
        text.set_color(_TEXT_MAIN)
        text.set_fontsize(9.5)
    title = legend.get_title()
    if title:
        title.set_color(_EDGE_GLOW)
        title.set_fontsize(10)
        title.set_fontweight("bold")


def _add_bar_labels(ax, bars, fmt: str = "{:.1f}", fontsize: int = 8.5,
                    horizontal: bool = False) -> None:
    """Annotate each bar with its value."""
    bar_list = list(bars)
    for bar in bar_list:
        if horizontal:
            val = bar.get_width()
            max_w = max((b.get_width() for b in bar_list), default=1)
            ax.text(
                val + max_w * 0.012,
                bar.get_y() + bar.get_height() / 2,
                fmt.format(val),
                va="center", ha="left",
                fontsize=fontsize, color=_TEXT_MAIN, fontweight="bold",
            )
        else:
            val = bar.get_height()
            max_h = max((b.get_height() for b in bar_list), default=1)
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                val + max_h * 0.012,
                fmt.format(val),
                ha="center", va="bottom",
                fontsize=fontsize, color=_TEXT_MAIN, fontweight="bold",
            )


def _smart_fmt(values) -> str:
    try:
        max_val = max(float(v) for v in values)
        if max_val >= 1_000_000:
            return "{:.1f}"
        if max_val >= 100:
            return "{:.0f}"
        return "{:.1f}"
    except Exception:
        return "{:.1f}"


# ── Main chart builder ────────────────────────────────────────────────────────

def build_chart_attachment(
    rows: List[Dict[str, Any]],
    x: str,
    y: str,
    kind: str = "line",
    title: Optional[str] = None,
    filename: Optional[str] = None,
    color: Optional[str] = None,
    color_map: Optional[Dict[str, str]] = None,
) -> Tuple[Optional[Dict[str, Any]], str]:
    """
    Render a dark-glass-styled chart matching the Nova AI UI aesthetic.
    color_map: optional dict mapping category label -> color
    """
    if not rows or not isinstance(rows, list):
        return None, "Chart not created: empty or invalid rows."

    xs = [r.get(x) for r in rows if x in r and y in r]
    ys = [r.get(y) for r in rows if x in r and y in r]
    if len(xs) == 0 or len(ys) == 0:
        return None, "Chart not created: missing x/y data."

    pts = [(xi, yi) for xi, yi in zip(xs, ys) if xi is not None and _is_number(yi)]
    if len(pts) == 0:
        return None, "Chart not created: y values are non-numeric or all x-values are null."
    xs_f, ys_f = zip(*pts)

    num_items = len(xs_f)
    horizontal = kind == "bar" and num_items > 12

    # Figure sizing - reduced for compactness in chat
    if horizontal:
        fig_h = max(4.2, 0.38 * num_items)
        fig, ax = plt.subplots(figsize=(8.2, fig_h), dpi=110)
    elif kind == "pie":
        fig, ax = plt.subplots(figsize=(8.2, 4.8), dpi=110)
    else:
        fig, ax = plt.subplots(figsize=(8.2, 4.5), dpi=110)

    # Color resolution
    default_color = _PALETTE[0]
    bar_color     = color or default_color
    line_color    = color or _PALETTE[0]
    scatter_color = color or _PALETTE[2]

    if color_map and kind == "bar":
        normalized_map = {str(k).lower(): v for k, v in color_map.items()}
        bar_colors = [normalized_map.get(str(xi).lower(), bar_color) for xi in xs_f]
    elif kind == "bar" and not color:
        # Auto rainbow when no single color specified
        bar_colors = [_PALETTE[i % len(_PALETTE)] for i in range(num_items)]
    else:
        bar_colors = bar_color

    val_fmt = _smart_fmt(ys_f)

    try:
        # ── BAR ──────────────────────────────────────────────────────────────
        if kind == "bar":
            if horizontal:
                bars = ax.barh(xs_f, ys_f, color=bar_colors, alpha=0.92,
                               height=0.62, zorder=3,
                               edgecolor="#1a103a", linewidth=0.6)
                ax.set_ylabel(x, labelpad=10)
                ax.set_xlabel(y, labelpad=10)
                ax.set_xlim(left=0)
                ax.invert_yaxis()
                _apply_dark_glass_style_horizontal(ax, fig)
                _add_bar_labels(ax, bars, fmt=val_fmt, horizontal=True)
            else:
                bars = ax.bar(xs_f, ys_f, color=bar_colors, alpha=0.92,
                              width=0.62, zorder=3,
                              edgecolor="#1a103a", linewidth=0.6)
                ax.set_xlabel(x, labelpad=10)
                ax.set_ylabel(y, labelpad=10)
                ax.set_ylim(bottom=0)
                plt.xticks(rotation=38, ha="right", fontsize=9.5,
                           color=_TEXT_DIM)
                _apply_dark_glass_style(ax, fig)
                _add_bar_labels(ax, bars, fmt=val_fmt)

            if color_map:
                legend_patches = [
                    mpatches.Patch(color=c, label=lbl)
                    for lbl, c in color_map.items()
                ]
                leg = ax.legend(handles=legend_patches, loc="upper right",
                                framealpha=0.9)
                _glass_legend(leg)

        # ── SCATTER ──────────────────────────────────────────────────────────
        elif kind == "scatter":
            sc = ax.scatter(xs_f, ys_f, s=70, alpha=0.85,
                            color=scatter_color,
                            edgecolors="#1a103a", linewidths=0.8, zorder=3)
            ax.set_xlabel(x, labelpad=10)
            ax.set_ylabel(y, labelpad=10)
            plt.xticks(rotation=38, ha="right", fontsize=9.5, color=_TEXT_DIM)
            _apply_dark_glass_style(ax, fig)

        # ── PIE ──────────────────────────────────────────────────────────────
        elif kind == "pie":
            combined = sorted(zip(xs_f, ys_f), key=lambda p: p[1], reverse=True)
            max_slices = 10
            if len(combined) > max_slices:
                top_items  = combined[:max_slices - 1]
                others_val = sum(p[1] for p in combined[max_slices - 1:])
                final_data = top_items + [("Others", others_val)]
            else:
                final_data = combined
            p_labels, p_vals = zip(*final_data)

            if color_map:
                norm_map = {str(k).lower(): v for k, v in color_map.items()}
                pie_colors = [
                    norm_map.get(str(lbl).lower(), _PALETTE[i % len(_PALETTE)])
                    for i, lbl in enumerate(p_labels)
                ]
            else:
                pie_colors = [_PALETTE[i % len(_PALETTE)]
                              for i in range(len(p_labels))]

            # Slight explode on the largest slice for emphasis
            explode = [0.04 if i == 0 else 0 for i in range(len(p_labels))]

            wedges, texts, autotexts = ax.pie(
                p_vals,
                explode=explode,
                autopct=lambda pct: (f"{pct:.1f}%") if pct > 3 else "",
                startangle=140,
                pctdistance=0.76,
                colors=pie_colors,
                wedgeprops={"linewidth": 1.8, "edgecolor": (0,0,0,0),
                            "antialiased": True},
                textprops={"fontsize": 10},
                shadow=False,
            )
            for at in autotexts:
                at.set_fontsize(8.5)
                at.set_color("white")
                at.set_fontweight("bold")

            # Hide default pie text labels (we use legend)
            for t in texts:
                t.set_text("")

            fig.patch.set_facecolor((0,0,0,0))
            ax.set_facecolor((0,0,0,0))

            leg = ax.legend(
                wedges, p_labels, title=x,
                loc="center left", bbox_to_anchor=(1, 0, 0.5, 1),
                fontsize=9.5, title_fontsize=10.5,
                framealpha=0.92,
            )
            _glass_legend(leg)
            ax.axis("equal")

        # ── LINE ─────────────────────────────────────────────────────────────
        else:
            # Gradient fill under line
            ax.plot(xs_f, ys_f, marker="o", linewidth=2.4, markersize=6,
                    color=line_color, markerfacecolor=(0.04, 0.02, 0.1, 0.8),
                    markeredgecolor=line_color, markeredgewidth=2, zorder=4)

            # Smooth fill with alpha gradient
            y_arr = np.array([float(v) for v in ys_f])
            ax.fill_between(range(len(xs_f)), y_arr,
                            alpha=0.15, color=line_color, zorder=2)

            ax.set_xlabel(x, labelpad=10)
            ax.set_ylabel(y, labelpad=10)
            ax.set_xticks(range(len(xs_f)))
            ax.set_xticklabels(xs_f, rotation=38, ha="right",
                               fontsize=9.5, color=_TEXT_DIM)
            _apply_dark_glass_style(ax, fig)

        # ── Title ─────────────────────────────────────────────────────────────
        if title:
            ax.set_title(
                title,
                fontsize=14, fontweight="bold",
                color=_TEXT_MAIN, pad=18,
                # Subtle glow via a bold color
            )

        fig.tight_layout(pad=1.8)

        buf = io.BytesIO()
        fig.savefig(buf, format="png", bbox_inches="tight",
                    transparent=True, facecolor=None, dpi=110)
        data = buf.getvalue()

    except Exception as e:
        import traceback
        print(f"ERROR: Chart generation failed: {e}")
        traceback.print_exc()
        return None, f"Chart generation failed: {str(e)}"
    finally:
        plt.close(fig)

    name = filename or "chart.png"
    payload: Dict[str, Any] = {"name": name, "content_type": "image/png"}
    payload["bytes"] = data
    return payload, f"Chart attached: {name}."


def _is_number(v: Any) -> bool:
    try:
        return v is not None and not isinstance(v, bool) and not math.isnan(float(v))
    except Exception:
        return False
