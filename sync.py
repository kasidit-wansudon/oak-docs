#!/usr/bin/env python3
"""
sync.py — Download all .md files from a public Google Drive folder
and generate docs.json manifest for Oak Docs.

Usage:
  python3 sync.py                          # Use default folder ID
  python3 sync.py --folder <FOLDER_ID>     # Use custom folder ID

Requirements: Python 3.7+ (no external packages needed)
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
import argparse

FOLDER_ID = "1udV9C2PrFeoNOjbr59MfR0VSDUmDGcIU"
DOCS_DIR = "docs"
MANIFEST = "docs.json"

# File ID registry: maps Google Drive file IDs to filenames
# This is auto-discovered from the public folder page
KNOWN_FILES = {}


def list_files_from_folder_page(folder_id):
    """
    Fetch file list from a public Google Drive folder
    by parsing the shared folder page.
    """
    url = f"https://drive.google.com/drive/folders/{folder_id}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) "
                       "Chrome/120.0.0.0 Safari/537.36"
    }
    req = urllib.request.Request(url, headers=headers)

    try:
        resp = urllib.request.urlopen(req, timeout=20)
        html = resp.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"  Error fetching folder page: {e}")
        return []

    # Extract file IDs and names from the page HTML
    # Google Drive embeds file data in JS arrays
    files = []

    # Pattern 1: Look for file entries in the data
    # Google Drive pages contain data like: ["FILE_ID","filename.md", ...]
    file_pattern = re.findall(
        r'\["(1[a-zA-Z0-9_-]{10,})","([^"]+\.md)"',
        html
    )

    if file_pattern:
        seen = set()
        for fid, fname in file_pattern:
            if fid not in seen:
                seen.add(fid)
                files.append({"id": fid, "name": fname})
        return files

    # Pattern 2: Try alternative data format
    # Sometimes data is in format: /file/d/FILE_ID followed by name
    ids = re.findall(r'/file/d/([a-zA-Z0-9_-]{20,})', html)
    names = re.findall(r'data-tooltip="([^"]+\.md)"', html)

    if ids:
        seen = set()
        for i, fid in enumerate(ids):
            if fid not in seen:
                seen.add(fid)
                name = names[i] if i < len(names) else ""
                files.append({"id": fid, "name": name})

    return files


def list_files_api(folder_id, api_key=None):
    """List files using Google Drive API v3."""
    url = (
        f"https://www.googleapis.com/drive/v3/files"
        f"?q=%27{folder_id}%27+in+parents"
        f"&fields=files(id,name,mimeType,modifiedTime)"
        f"&orderBy=name&pageSize=100"
    )
    if api_key:
        url += f"&key={api_key}"

    headers = {"User-Agent": "OakDocs-Sync/1.0"}
    req = urllib.request.Request(url, headers=headers)

    try:
        resp = urllib.request.urlopen(req, timeout=15)
        data = json.loads(resp.read())
        return [
            {"id": f["id"], "name": f["name"]}
            for f in data.get("files", [])
            if f.get("name", "").endswith(".md")
        ]
    except Exception as e:
        print(f"  API method failed: {e}")
        return []


def download_file(file_id, dest_path):
    """Download a public file from Google Drive."""
    url = f"https://drive.google.com/uc?export=download&id={file_id}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                       "AppleWebKit/537.36"
    }
    req = urllib.request.Request(url, headers=headers)

    try:
        resp = urllib.request.urlopen(req, timeout=30)
        content = resp.read()

        # Check for virus scan confirmation page (large files)
        if b"confirm=" in content:
            match = re.search(rb'confirm=([0-9A-Za-z_-]+)', content)
            if match:
                confirm_url = (
                    f"https://drive.google.com/uc?export=download"
                    f"&confirm={match.group(1).decode()}&id={file_id}"
                )
                req2 = urllib.request.Request(confirm_url, headers=headers)
                resp2 = urllib.request.urlopen(req2, timeout=30)
                content = resp2.read()

        # Verify it's markdown, not an HTML error page
        text = content.decode("utf-8", errors="ignore")[:500]
        if text.strip().startswith("<!DOCTYPE") or "<html" in text.lower()[:200]:
            print("got HTML error page instead of markdown")
            return False

        with open(dest_path, "wb") as f:
            f.write(content)
        return True

    except Exception as e:
        print(f"error: {e}")
        return False


def generate_title(filename):
    """Generate human-readable title from filename."""
    name = filename.replace(".md", "").replace("-", " ").replace("_", " ")
    words = name.split()
    result = []
    skip = {"and", "or", "the", "a", "an", "in", "of", "for", "to", "with"}
    for i, w in enumerate(words):
        if w.lower() in skip and i > 0:
            result.append(w.lower())
        else:
            result.append(w.capitalize() if w.islower() else w)
    return " ".join(result)


def assign_icon(filename):
    """Assign an icon based on filename keywords."""
    fn = filename.lower()
    if "readme" in fn and ("guide" in fn or "remote" in fn):
        return "globe"
    if "readme" in fn:
        return "book"
    if "financial" in fn or "income" in fn or "debt" in fn:
        return "trending"
    if "plan" in fn and "workout" not in fn:
        return "calendar"
    if "stability" in fn or "security" in fn:
        return "shield"
    if "business" in fn or "knowledge" in fn:
        return "lightbulb"
    if "workout" in fn or "health" in fn or "fitness" in fn:
        return "heart"
    if "research" in fn:
        return "chart"
    if "guide" in fn or "remote" in fn:
        return "globe"
    return "file"


def main():
    parser = argparse.ArgumentParser(description="Sync Google Drive folder to docs/")
    parser.add_argument("--folder", default=FOLDER_ID, help="Google Drive folder ID")
    parser.add_argument("--api-key", default=os.environ.get("GOOGLE_API_KEY", ""),
                        help="Google API key (optional)")
    args = parser.parse_args()

    folder_id = args.folder

    print(f"Syncing from Google Drive folder: {folder_id}")
    os.makedirs(DOCS_DIR, exist_ok=True)

    # Try to list files
    files = []

    if args.api_key:
        print("  Trying API method...")
        files = list_files_api(folder_id, args.api_key)

    if not files:
        print("  Trying folder page method...")
        files = list_files_from_folder_page(folder_id)

    if not files:
        print("  Could not discover files automatically.")
        print("  Using existing docs/ directory to generate manifest.")
        files = None

    # Download files
    if files:
        print(f"  Found {len(files)} markdown files")
        downloaded = 0
        for f in files:
            name = f["name"]
            fid = f["id"]
            dest = os.path.join(DOCS_DIR, name)
            print(f"  Downloading {name}... ", end="", flush=True)
            if download_file(fid, dest):
                downloaded += 1
                print("OK")
            else:
                print("FAILED")
            time.sleep(0.5)
        print(f"  Downloaded {downloaded}/{len(files)} files")

    # Generate manifest from all .md files in docs/
    all_md = sorted(f for f in os.listdir(DOCS_DIR) if f.endswith(".md"))
    docs = []
    for fname in all_md:
        doc_id = fname.replace(".md", "")
        docs.append({
            "id": doc_id,
            "title": generate_title(fname),
            "file": f"docs/{fname}",
            "icon": assign_icon(fname),
        })

    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(docs, f, ensure_ascii=False, indent=2)

    print(f"\nGenerated {MANIFEST} with {len(docs)} documents:")
    for d in docs:
        print(f"  [{d['icon']:10}] {d['title']}")
    print("\nSync complete!")


if __name__ == "__main__":
    main()
