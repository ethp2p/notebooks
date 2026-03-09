import pandas as pd
from typing import List
from IPython.display import display, HTML


def render_table(df: pd.DataFrame, columns: List[str] = None):
    """
    Renders the give dataframe as a table under a unified common style
    Args:
        df: dataframe to render
        custom_colums: Custom naming for the columns. Get the names from the columns if None was given
    """
    cols = df.columns
    if columns is not None:
        if len(columns) != len(cols):
            raise ValueError("Number of columns does not match")
        else:
            cols = columns

    table = '''
    <style>
    .missed-table { border-collapse: collapse; width: 100%; font-family: monospace; font-size: 13px; }
    .missed-table th { background: #c0392b; color: white; padding: 8px 12px; text-align: left; position: sticky; top: 0; }
    .missed-table td { padding: 6px 12px; border-bottom: 1px solid #eee; }
    .missed-table tr:hover { background: #ffebee; }
    .missed-table a { color: #1976d2; text-decoration: none; }
    .missed-table a:hover { text-decoration: underline; }
    .table-container { max-height: 500px; overflow-y: auto; }
    </style>
    <div class="table-container">
    <table class="missed-table">
    <thead>
    '''
    header = "<tr>"
    for col in cols:
        header += f"<th>{col.replace("_", " ").upper()}</th>"""
    table += header + '</tr></thead><tbody>'

    for row in df.iter_rows(named=True):
        row_str = "<tr>"
        for col in df.columns:
            row_str += f"<td>{row[col]}</td>"
        table += row_str + '</tr>'

    table += '</tbody></table></div>'
    display(HTML(table))
