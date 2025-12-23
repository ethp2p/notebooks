#!/usr/bin/env python3
"""
Upload site to R2 with content-addressed storage.

Files are stored as blobs named by their content hash.
A manifest maps paths to blob hashes for each deployment.

Usage:
    python upload_r2.py --dist site/dist --manifest main
    python upload_r2.py --dist site/dist --manifest pr-14
"""

import argparse
import hashlib
import json
import mimetypes
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import boto3
from botocore.exceptions import ClientError


def hash_file(path: Path) -> str:
    """Compute SHA256 hash, return first 16 chars."""
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def get_extension(path: Path) -> str:
    """Get file extension for blob naming."""
    return path.suffix or ".bin"


def blob_exists(s3, bucket: str, key: str) -> bool:
    """Check if a blob already exists in R2."""
    try:
        s3.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] == "404":
            return False
        raise


def upload_blob(s3, bucket: str, file_path: Path, blob_key: str) -> tuple[str, int]:
    """Upload a single blob to R2. Returns (blob_key, bytes_uploaded)."""
    content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    file_size = file_path.stat().st_size

    s3.upload_file(
        str(file_path),
        bucket,
        blob_key,
        ExtraArgs={"ContentType": content_type},
    )

    return blob_key, file_size


def upload_site(
    dist_dir: Path,
    bucket: str,
    manifest_name: str,
    endpoint_url: str,
    access_key: str,
    secret_key: str,
    max_workers: int = 10,
    dry_run: bool = False,
) -> dict:
    """
    Upload site to R2 with content-addressed storage.

    Returns stats dict with counts and sizes.
    """
    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
    )

    manifest: dict[str, dict] = {}
    blobs_to_upload: list[tuple[Path, str]] = []
    existing_blobs: list[str] = []

    print(f"Scanning {dist_dir}...")

    # 1. Build manifest and identify new blobs
    all_files = list(dist_dir.rglob("*"))
    files_to_process = [f for f in all_files if f.is_file()]

    for file_path in files_to_process:
        relative_path = "/" + str(file_path.relative_to(dist_dir))
        content_hash = hash_file(file_path)
        extension = get_extension(file_path)
        blob_key = f"blobs/{content_hash}{extension}"

        manifest[relative_path] = {
            "hash": content_hash,
            "blob": blob_key,
            "size": file_path.stat().st_size,
        }

        # Check if blob exists
        if blob_exists(s3, bucket, blob_key):
            existing_blobs.append(blob_key)
        else:
            blobs_to_upload.append((file_path, blob_key))

    total_files = len(manifest)
    total_size = sum(m["size"] for m in manifest.values())
    new_blobs = len(blobs_to_upload)
    reused_blobs = len(existing_blobs)

    print(f"Found {total_files} files ({total_size / 1024 / 1024:.1f} MB)")
    print(f"  Existing blobs (reused): {reused_blobs}")
    print(f"  New blobs to upload: {new_blobs}")

    if dry_run:
        print("\nDry run - no uploads performed")
        return {
            "total_files": total_files,
            "total_size": total_size,
            "new_blobs": new_blobs,
            "reused_blobs": reused_blobs,
            "bytes_uploaded": 0,
        }

    # 2. Upload new blobs in parallel
    bytes_uploaded = 0

    if blobs_to_upload:
        print(f"\nUploading {new_blobs} new blobs...")

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(upload_blob, s3, bucket, file_path, blob_key): blob_key
                for file_path, blob_key in blobs_to_upload
            }

            for future in as_completed(futures):
                blob_key = futures[future]
                try:
                    _, size = future.result()
                    bytes_uploaded += size
                    print(f"  {blob_key} ({size / 1024:.1f} KB)")
                except Exception as e:
                    print(f"  ERROR uploading {blob_key}: {e}", file=sys.stderr)
                    raise

    # 3. Upload manifest
    manifest_key = f"manifests/{manifest_name}.json"
    manifest_json = json.dumps(manifest, indent=2, sort_keys=True)

    print(f"\nUploading manifest: {manifest_key}")
    s3.put_object(
        Bucket=bucket,
        Key=manifest_key,
        Body=manifest_json,
        ContentType="application/json",
    )

    # 4. Summary
    print(f"\nUpload complete!")
    print(f"  Manifest: {manifest_key}")
    print(f"  Total files: {total_files}")
    print(f"  Bytes uploaded: {bytes_uploaded / 1024 / 1024:.2f} MB")
    print(f"  Blobs reused: {reused_blobs}")

    return {
        "total_files": total_files,
        "total_size": total_size,
        "new_blobs": new_blobs,
        "reused_blobs": reused_blobs,
        "bytes_uploaded": bytes_uploaded,
        "manifest_key": manifest_key,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Upload site to R2 with content-addressed storage"
    )
    parser.add_argument(
        "--dist",
        type=Path,
        default=Path("site/dist"),
        help="Directory to upload (default: site/dist)",
    )
    parser.add_argument(
        "--manifest",
        required=True,
        help="Manifest name (e.g., 'main' or 'pr-14')",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=10,
        help="Number of parallel upload workers (default: 10)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Scan and report without uploading",
    )
    args = parser.parse_args()

    # Get credentials from environment
    required_env = [
        "R2_BUCKET_NAME",
        "R2_ENDPOINT",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
    ]

    missing = [var for var in required_env if not os.environ.get(var)]
    if missing:
        print(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)

    if not args.dist.is_dir():
        print(f"Directory not found: {args.dist}")
        sys.exit(1)

    stats = upload_site(
        dist_dir=args.dist,
        bucket=os.environ["R2_BUCKET_NAME"],
        manifest_name=args.manifest,
        endpoint_url=os.environ["R2_ENDPOINT"],
        access_key=os.environ["R2_ACCESS_KEY_ID"],
        secret_key=os.environ["R2_SECRET_ACCESS_KEY"],
        max_workers=args.workers,
        dry_run=args.dry_run,
    )

    # Exit with error if no files found
    if stats["total_files"] == 0:
        print("No files found to upload")
        sys.exit(1)


if __name__ == "__main__":
    main()
