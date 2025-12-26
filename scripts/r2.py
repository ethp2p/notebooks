#!/usr/bin/env python3
"""
R2 storage management for content-addressed site deployments.

Subcommands:
    upload   Upload site to R2 with content-addressed storage
    cleanup  Clean up orphaned blobs after PR closure

Usage:
    python r2.py upload --dist site/dist --manifest main
    python r2.py upload --dist site/dist --manifest pr-14
    python r2.py cleanup --closed-pr 14 --open-prs 15,16,17
    python r2.py cleanup --closed-pr 14 --open-prs ""
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

# Required environment variables
REQUIRED_ENV = [
    "R2_BUCKET_NAME",
    "R2_ENDPOINT",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
]


def get_s3_client():
    """Create S3 client for R2 using environment variables."""
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
    )


def check_env() -> list[str]:
    """Check for required environment variables. Returns list of missing vars."""
    return [var for var in REQUIRED_ENV if not os.environ.get(var)]


def get_bucket() -> str:
    """Get bucket name from environment."""
    return os.environ["R2_BUCKET_NAME"]


# =============================================================================
# Upload functionality
# =============================================================================


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


def cmd_upload(args: argparse.Namespace) -> int:
    """Upload site to R2 with content-addressed storage."""
    dist_dir = args.dist
    manifest_name = args.manifest
    max_workers = args.workers
    dry_run = args.dry_run

    if not dist_dir.is_dir():
        print(f"Directory not found: {dist_dir}")
        return 1

    s3 = get_s3_client()
    bucket = get_bucket()

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
        return 0

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

    if total_files == 0:
        print("No files found to upload")
        return 1

    return 0


# =============================================================================
# Cleanup functionality
# =============================================================================


def list_objects_with_prefix(s3, bucket: str, prefix: str) -> list[str]:
    """List all object keys with given prefix."""
    keys = []
    paginator = s3.get_paginator("list_objects_v2")

    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            keys.append(obj["Key"])

    return keys


def get_manifest(s3, bucket: str, manifest_key: str) -> dict | None:
    """Get manifest contents, returns None if not found."""
    try:
        response = s3.get_object(Bucket=bucket, Key=manifest_key)
        return json.loads(response["Body"].read().decode("utf-8"))
    except ClientError as e:
        if e.response["Error"]["Code"] == "NoSuchKey":
            return None
        raise


def delete_object(s3, bucket: str, key: str) -> str:
    """Delete a single object. Returns the key on success."""
    s3.delete_object(Bucket=bucket, Key=key)
    return key


def cmd_cleanup(args: argparse.Namespace) -> int:
    """Clean up R2 after a PR is closed."""
    closed_pr = args.closed_pr
    max_workers = args.workers
    dry_run = args.dry_run

    # Parse open PRs
    open_prs = []
    if args.open_prs.strip():
        open_prs = [int(pr.strip()) for pr in args.open_prs.split(",") if pr.strip()]

    print(f"Cleaning up after PR #{closed_pr}")
    print(f"Open PRs to preserve: {open_prs if open_prs else '(none)'}")
    if dry_run:
        print("Mode: DRY RUN")
    print()

    s3 = get_s3_client()
    bucket = get_bucket()

    # 1. List all blobs in bucket
    print("Listing all blobs...")
    all_blobs = set(list_objects_with_prefix(s3, bucket, "blobs/"))
    print(f"  Found {len(all_blobs)} blobs")

    # 2. Collect referenced blobs from active manifests
    referenced_blobs: set[str] = set()
    active_manifests = ["main"] + [f"pr-{pr}" for pr in open_prs]

    print(f"\nLoading active manifests: {active_manifests}")
    for manifest_name in active_manifests:
        manifest_key = f"manifests/{manifest_name}.json"
        manifest = get_manifest(s3, bucket, manifest_key)

        if manifest:
            blobs_in_manifest = {entry["blob"] for entry in manifest.values()}
            referenced_blobs.update(blobs_in_manifest)
            print(f"  {manifest_name}: {len(blobs_in_manifest)} blobs")
        else:
            print(f"  {manifest_name}: not found (skipping)")

    # 3. Find orphaned blobs
    orphaned_blobs = all_blobs - referenced_blobs
    print(f"\nOrphaned blobs: {len(orphaned_blobs)}")

    # 4. Delete closed PR manifest
    closed_manifest_key = f"manifests/pr-{closed_pr}.json"

    if dry_run:
        print(f"\n[DRY RUN] Would delete manifest: {closed_manifest_key}")
        print(f"[DRY RUN] Would delete {len(orphaned_blobs)} orphaned blobs")
        return 0

    # Delete manifest
    deleted_manifest = False
    print(f"\nDeleting closed PR manifest: {closed_manifest_key}")
    try:
        s3.delete_object(Bucket=bucket, Key=closed_manifest_key)
        deleted_manifest = True
        print(f"  Deleted: {closed_manifest_key}")
    except ClientError as e:
        print(f"  Warning: Could not delete manifest: {e}")

    # 5. Delete orphaned blobs in parallel
    deleted_count = 0
    if orphaned_blobs:
        print(f"\nDeleting {len(orphaned_blobs)} orphaned blobs...")

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(delete_object, s3, bucket, key): key
                for key in orphaned_blobs
            }

            for future in as_completed(futures):
                key = futures[future]
                try:
                    future.result()
                    deleted_count += 1
                    print(f"  Deleted: {key}")
                except Exception as e:
                    print(f"  ERROR deleting {key}: {e}", file=sys.stderr)

    print(f"\nCleanup complete!")
    print(f"  Manifest deleted: {deleted_manifest}")
    print(f"  Blobs deleted: {deleted_count}")

    return 0


# =============================================================================
# CLI
# =============================================================================


def main() -> int:
    parser = argparse.ArgumentParser(
        description="R2 storage management for content-addressed deployments"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Upload subcommand
    upload_parser = subparsers.add_parser(
        "upload", help="Upload site to R2 with content-addressed storage"
    )
    upload_parser.add_argument(
        "--dist",
        type=Path,
        default=Path("site/dist"),
        help="Directory to upload (default: site/dist)",
    )
    upload_parser.add_argument(
        "--manifest",
        required=True,
        help="Manifest name (e.g., 'main' or 'pr-14')",
    )
    upload_parser.add_argument(
        "--workers",
        type=int,
        default=10,
        help="Number of parallel workers (default: 10)",
    )
    upload_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Scan and report without uploading",
    )

    # Cleanup subcommand
    cleanup_parser = subparsers.add_parser(
        "cleanup", help="Clean up orphaned blobs after PR closure"
    )
    cleanup_parser.add_argument(
        "--closed-pr",
        type=int,
        required=True,
        help="PR number that was closed",
    )
    cleanup_parser.add_argument(
        "--open-prs",
        type=str,
        default="",
        help="Comma-separated list of open PR numbers (empty if none)",
    )
    cleanup_parser.add_argument(
        "--workers",
        type=int,
        default=10,
        help="Number of parallel workers (default: 10)",
    )
    cleanup_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would be deleted without actually deleting",
    )

    args = parser.parse_args()

    # Check environment
    missing = check_env()
    if missing:
        print(f"Missing required environment variables: {', '.join(missing)}")
        return 1

    # Dispatch to subcommand
    if args.command == "upload":
        return cmd_upload(args)
    elif args.command == "cleanup":
        return cmd_cleanup(args)

    return 1


if __name__ == "__main__":
    sys.exit(main())
