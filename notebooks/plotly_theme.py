"""Shared Plotly theme and layout utilities for consistent chart styling."""

import plotly.graph_objects as go

# Default layout settings for consistent spacing
LAYOUT_DEFAULTS = dict(
    margin=dict(l=60, r=30, t=30, b=60),
    font=dict(size=12),
)

# Extended bottom margin for charts with horizontal colorbars
LAYOUT_HORIZONTAL_COLORBAR = dict(
    margin=dict(l=60, r=30, t=30, b=100),
    font=dict(size=12),
)


def horizontal_colorbar(title: str = "") -> dict:
    """Return colorbar config for horizontal orientation with proper spacing."""
    return dict(
        title=dict(text=title, side="bottom") if title else None,
        orientation="h",
        y=-0.2,
        yanchor="top",
        x=0.5,
        xanchor="center",
        len=0.6,
        thickness=15,
    )


def apply_theme(fig: go.Figure, horizontal_cbar: bool = False) -> go.Figure:
    """Apply consistent spacing and styling to a Plotly figure.

    Args:
        fig: The Plotly figure to style.
        horizontal_cbar: If True, use extended bottom margin for horizontal colorbar.

    Returns:
        The styled figure.
    """
    layout = LAYOUT_HORIZONTAL_COLORBAR if horizontal_cbar else LAYOUT_DEFAULTS
    fig.update_layout(**layout)
    return fig
