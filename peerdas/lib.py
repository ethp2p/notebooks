"""
Shared library for PeerDAS analysis notebooks.

Provides common utilities for:
- ClickHouse connection management
- Time filtering and query helpers
- Plotting configuration
- Data caching for offline/GitHub rendering
"""

from datetime import datetime, timedelta, timezone
import os
from pathlib import Path

import altair as alt
import clickhouse_connect
from dotenv import load_dotenv
import pandas as pd


# =============================================================================
# DEFAULT PARAMETERS
# =============================================================================
DEFAULT_HOURS = 24
DEFAULT_NETWORK = "mainnet"
DATA_DIR = Path(__file__).parent / "data"


def get_time_range(hours: int = DEFAULT_HOURS) -> tuple[datetime, datetime]:
    """Get start and end times for analysis period."""
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(hours=hours)
    return start_time, end_time


def get_client() -> clickhouse_connect.driver.Client:
    """Create and return a ClickHouse client using environment variables."""
    load_dotenv()
    return clickhouse_connect.get_client(
        host=os.environ["CLICKHOUSE_HOST"],
        port=int(os.environ.get("CLICKHOUSE_PORT", 8443)),
        username=os.environ["CLICKHOUSE_USER"],
        password=os.environ["CLICKHOUSE_PASSWORD"],
        secure=True,
    )


def setup_altair() -> None:
    """Configure Altair theme."""
    alt.theme.enable("carbonwhite")


def time_filter(
    start_time: datetime,
    end_time: datetime,
    column: str = "slot_start_date_time",
) -> str:
    """Generate a SQL time filter clause."""
    start_str = start_time.strftime("%Y-%m-%d %H:%M:%S")
    end_str = end_time.strftime("%Y-%m-%d %H:%M:%S")
    return f"{column} BETWEEN '{start_str}' AND '{end_str}'"


def time_bounds(start_time: datetime, end_time: datetime) -> tuple[str, str]:
    """Return formatted time bounds for queries."""
    return (
        start_time.strftime("%Y-%m-%d %H:%M:%S"),
        end_time.strftime("%Y-%m-%d %H:%M:%S"),
    )


def query_df(client, sql: str) -> pd.DataFrame:
    """Execute a query and return a DataFrame."""
    return client.query_df(sql)


def print_analysis_info(start_time: datetime, end_time: datetime, network: str) -> None:
    """Print analysis period information."""
    print(f"Analysis period: {start_time} to {end_time}")
    print(f"Network: {network}")


# =============================================================================
# DATA CACHING
# =============================================================================
def load_or_query(
    client,
    sql: str,
    cache_name: str,
    force_query: bool = False,
) -> pd.DataFrame:
    """Load data from cache or query and cache the result.

    Args:
        client: ClickHouse client (can be None if loading from cache)
        sql: SQL query to execute if cache miss
        cache_name: Name for the cache file (without extension)
        force_query: If True, always query and update cache

    Returns:
        DataFrame with query results
    """
    cache_path = DATA_DIR / f"{cache_name}.parquet"

    if not force_query and cache_path.exists():
        print(f"Loading from cache: {cache_path.name}")
        return pd.read_parquet(cache_path)

    if client is None:
        raise ValueError(f"No cached data at {cache_path} and no client provided")

    print(f"Querying data...")
    df = client.query_df(sql)

    DATA_DIR.mkdir(exist_ok=True)
    df.to_parquet(cache_path, index=False)
    print(f"Cached to: {cache_path.name}")

    return df


def get_client_optional():
    """Create a ClickHouse client if credentials are available, otherwise return None."""
    load_dotenv()
    if not os.environ.get("CLICKHOUSE_HOST"):
        return None
    return clickhouse_connect.get_client(
        host=os.environ["CLICKHOUSE_HOST"],
        port=int(os.environ.get("CLICKHOUSE_PORT", 8443)),
        username=os.environ["CLICKHOUSE_USER"],
        password=os.environ["CLICKHOUSE_PASSWORD"],
        secure=True,
    )


# =============================================================================
# PLOTLY DISPLAY
# =============================================================================
def show_fig(fig) -> None:
    """Display a Plotly figure as interactive HTML.

    Uses IPython HTML display which nbconvert can properly render,
    unlike fig.show() which outputs JSON that nbconvert ignores.
    """
    from IPython.display import display, HTML

    html = fig.to_html(include_plotlyjs="cdn", full_html=False)
    display(HTML(html))
