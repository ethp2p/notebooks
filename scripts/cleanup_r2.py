#!/usr/bin/env python3
"""
Clean up orphaned blobs from R2 after PR closure.

Lists all manifests and blobs, identifies blobs not referenced by any active
manifest (main + open PRs), and deletes them along with the closed PR manifest.

Usage:
    python cleanup_r2.py --closed-pr 14 --open-prs 15,16,17
    python cleanup_r2.py --closed-pr 14 --open-prs ""  # No open PRs
    python cleanup_r2.py --closed-pr 14 --dry-run
"""

import argparse
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

import boto3
from botocore.exceptions import ClientError


def get_s3_client(endpoint_url: str, access_key: str, secret_key: str):
    """Create S3 client for R2."""
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
    )


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


def cleanup_r2(
    bucket: str,
    closed_pr: int,
    open_prs: list[int],
    endpoint_url: str,
    access_key: str,
    secret_key: str,
    max_workers: int = 10,
    dry_run: bool = False,
) -> dict:
    """
    Clean up R2 after a PR is closed.

    1. Load main manifest + all open PR manifests
    2. Collect all referenced blob keys
    3. Delete closed PR manifest
    4. Delete orphaned blobs

    Returns stats dict.
    """
    s3 = get_s3_client(endpoint_url, access_key, secret_key)

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
    deleted_manifest = False

    if dry_run:
        print(f"\n[DRY RUN] Would delete manifest: {closed_manifest_key}")
        print(f"[DRY RUN] Would delete {len(orphaned_blobs)} orphaned blobs")
        return {
            "orphaned_blobs": len(orphaned_blobs),
            "deleted_blobs": 0,
            "deleted_manifest": False,
        }

    # Delete manifest
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

    return {
        "orphaned_blobs": len(orphaned_blobs),
        "deleted_blobs": deleted_count,
        "deleted_manifest": deleted_manifest,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Clean up orphaned R2 blobs after PR closure"
    )
    parser.add_argument(
        "--closed-pr",
        type=int,
        required=True,
        help="PR number that was closed",
    )
    parser.add_argument(
        "--open-prs",
        type=str,
        default="",
        help="Comma-separated list of open PR numbers (empty if none)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=10,
        help="Number of parallel deletion workers (default: 10)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would be deleted without actually deleting",
    )
    args = parser.parse_args()

    # Parse open PRs
    open_prs = []
    if args.open_prs.strip():
        open_prs = [int(pr.strip()) for pr in args.open_prs.split(",") if pr.strip()]

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

    print(f"Cleaning up after PR #{args.closed_pr}")
    print(f"Open PRs to preserve: {open_prs if open_prs else '(none)'}")
    if args.dry_run:
        print("Mode: DRY RUN")
    print()

    stats = cleanup_r2(
        bucket=os.environ["R2_BUCKET_NAME"],
        closed_pr=args.closed_pr,
        open_prs=open_prs,
        endpoint_url=os.environ["R2_ENDPOINT"],
        access_key=os.environ["R2_ACCESS_KEY_ID"],
        secret_key=os.environ["R2_SECRET_ACCESS_KEY"],
        max_workers=args.workers,
        dry_run=args.dry_run,
    )

    # Exit with error if nothing was cleaned (might indicate a problem)
    if not args.dry_run and stats["orphaned_blobs"] == 0 and not stats["deleted_manifest"]:
        print("\nNothing to clean up")


if __name__ == "__main__":
    main()
