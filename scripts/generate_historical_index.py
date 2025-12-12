#!/usr/bin/env python3
"""
Generate index.html files for historical archive dates.
"""
import sys
from pathlib import Path


def generate_index(date: str, output_dir: Path):
    """Generate an index.html for a historical date."""
    html = f"""<!DOCTYPE html>
<html>
<head>
  <title>PeerDAS Analysis - {date}</title>
  <style>
    body {{ font-family: system-ui, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }}
    h1 {{ color: #333; }}
    ul {{ list-style: none; padding: 0; }}
    li {{ margin: 10px 0; }}
    a {{ color: #0066cc; text-decoration: none; font-size: 18px; }}
    a:hover {{ text-decoration: underline; }}
    .back {{ margin-bottom: 20px; }}
  </style>
</head>
<body>
  <p class="back"><a href="../../index.html">&larr; Back to main</a></p>
  <h1>PeerDAS Analysis - {date}</h1>
  <ul>
    <li><a href="01-blob-inclusion.html">Blob Inclusion</a></li>
    <li><a href="02-blob-flow.html">Blob Flow</a></li>
    <li><a href="03-column-propagation.html">Column Propagation</a></li>
    <li><a href="04-client-versions.html">Client Versions</a></li>
  </ul>
</body>
</html>
"""
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "index.html").write_text(html)
    print(f"Generated index for {date}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: generate_historical_index.py DATE OUTPUT_DIR")
        sys.exit(1)

    date = sys.argv[1]
    output_dir = Path(sys.argv[2])
    generate_index(date, output_dir)
