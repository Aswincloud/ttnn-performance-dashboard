#!/usr/bin/env python3
"""
GitHub Performance Results Uploader

This script uploads performance measurement results to the ttnn-performance-dashboard GitHub repository.
"""

import os
import sys
import json
import subprocess
import shutil
from datetime import datetime
from pathlib import Path


def _find_gh():
    """Resolve the gh executable, falling back to ~/.local/bin for cron/non-login shells."""
    gh = shutil.which("gh")
    if gh:
        return gh
    local = os.path.expanduser("~/.local/bin/gh")
    return local if os.path.exists(local) else "gh"


class GitHubPerformanceUploader:
    def __init__(self, repo_url="git@github.com:Aswincloud/ttnn-performance-dashboard.git"):
        self.repo_url = repo_url
        self.repo_name = "ttnn-performance-dashboard"
        self.temp_dir = f"/tmp/{self.repo_name}_upload_{int(datetime.now().timestamp())}"
        self.dashboard_dir = Path(self.temp_dir) / self.repo_name

    def upload_results(self, json_file_path):
        """Upload performance results to GitHub repository."""
        try:
            # Validate input file
            if not os.path.exists(json_file_path):
                print(f"❌ Error: JSON file not found: {json_file_path}")
                return False

            # Load the results
            with open(json_file_path, 'r') as f:
                results_data = json.load(f)

            print(f"📄 Loaded results from: {json_file_path}")

            # Clone or update the dashboard repository
            if not self._prepare_dashboard_repo():
                return False

            # Copy the results file to the daily directory
            if not self._copy_results_to_dashboard(json_file_path, results_data):
                return False

            # Update latest results if this is a complete run
            if self._is_complete_run(results_data):
                self._update_latest_results(results_data)

            # Update index.json with new entry
            self._update_index(results_data, json_file_path)

            # Commit and push changes
            if not self._commit_and_push():
                return False

            print("🎉 Successfully uploaded results to GitHub!")
            return True

        except Exception as e:
            print(f"❌ Upload failed with error: {e}")
            return False
        finally:
            # Clean up temporary directory
            self._cleanup()

    def _prepare_dashboard_repo(self):
        """Clone or update the dashboard repository."""
        try:
            print(f"📥 Preparing dashboard repository...")

            # Create temp directory
            os.makedirs(self.temp_dir, exist_ok=True)

            # Clone the repository
            cmd = ["git", "clone", self.repo_url, self.repo_name]
            result = subprocess.run(cmd, cwd=self.temp_dir, capture_output=True, text=True)

            if result.returncode != 0:
                print(f"❌ Failed to clone repository: {result.stderr}")
                return False

            print(f"✅ Repository cloned successfully")
            return True

        except Exception as e:
            print(f"❌ Error preparing dashboard repo: {e}")
            return False

    def _copy_results_to_dashboard(self, json_file_path, results_data):
        """Copy results file to the dashboard's daily directory."""
        try:
            daily_dir = self.dashboard_dir / "data" / "daily"

            # Create daily directory if it doesn't exist
            daily_dir.mkdir(parents=True, exist_ok=True)

            # Generate filename for dashboard (YYYY-MM-DD_filename format)
            measurement_date = results_data.get('metadata', {}).get('measurement_date', '')
            if measurement_date:
                date_part = measurement_date.split('T')[0]  # Get YYYY-MM-DD part
                filename = f"{date_part}_{os.path.basename(json_file_path)}"
            else:
                filename = os.path.basename(json_file_path)

            destination_path = daily_dir / filename

            # Copy the file
            shutil.copy2(json_file_path, destination_path)
            print(f"📋 Copied results to: {filename}")

            return True

        except Exception as e:
            print(f"❌ Error copying results to dashboard: {e}")
            return False

    def _is_complete_run(self, results_data):
        """Check if this is a complete run (not a partial/rerun)."""
        metadata = results_data.get('metadata', {})
        total_tests = metadata.get('total_tests', 0)
        successful_tests = metadata.get('successful_tests', 0)
        failed_tests = metadata.get('failed_tests', 0)

        # Consider it complete if we have results and total matches successful + failed
        return total_tests > 0 and total_tests == (successful_tests + failed_tests)

    def _update_latest_results(self, results_data):
        """Update the latest results file."""
        try:
            latest_dir = self.dashboard_dir / "data" / "latest"
            latest_dir.mkdir(parents=True, exist_ok=True)

            latest_file = latest_dir / "latest_results.json"

            # Write the results as latest
            with open(latest_file, 'w') as f:
                json.dump(results_data, f, indent=2)

            print(f"🔄 Updated latest results")

        except Exception as e:
            print(f"⚠️ Warning: Could not update latest results: {e}")

    def _update_index(self, results_data, json_file_path):
        """Update the index.json file with the new results entry."""
        try:
            index_file = self.dashboard_dir / "data" / "index.json"

            # Load existing index or create new one
            if index_file.exists():
                with open(index_file, 'r') as f:
                    index_data = json.load(f)
            else:
                index_data = {
                    "last_updated": datetime.now().isoformat(),
                    "total_measurements": 0,
                    "files": []
                }

            # Ensure we have the expected structure
            if not isinstance(index_data, dict):
                index_data = {
                    "last_updated": datetime.now().isoformat(),
                    "total_measurements": 0,
                    "files": []
                }

            files_list = index_data.get('files', [])

            # Create new entry
            metadata = results_data.get('metadata', {})
            date_str = metadata.get('measurement_date', datetime.now().isoformat())

            # Use the original filename from the source file, not generate a new one
            original_filename = os.path.basename(json_file_path)
            dashboard_filename = f"{date_str.split('T')[0]}_{original_filename}"

            new_entry = {
                'filename': dashboard_filename,
                'path': f"data/daily/{dashboard_filename}",
                'measurement_date': date_str,
                'git_commit_id': metadata.get('git_commit_id', 'unknown'),
                'total_tests': metadata.get('total_tests', 0),
                'successful_tests': metadata.get('successful_tests', 0),
                'failed_tests': metadata.get('failed_tests', 0)
            }

            # Add to files list (avoid duplicates based on measurement_date and commit)
            existing_entry = None
            for i, entry in enumerate(files_list):
                if (entry.get('measurement_date') == new_entry['measurement_date'] and
                    entry.get('git_commit_id') == new_entry['git_commit_id']):
                    existing_entry = i
                    break

            if existing_entry is not None:
                # Update existing entry
                files_list[existing_entry] = new_entry
                print(f"🔄 Updated existing index entry")
            else:
                # Add new entry
                files_list.append(new_entry)
                print(f"➕ Added new index entry")

            # Sort by measurement_date (newest first)
            files_list.sort(key=lambda x: x.get('measurement_date', ''), reverse=True)

            # Update metadata
            index_data['files'] = files_list
            index_data['last_updated'] = datetime.now().isoformat()
            index_data['total_measurements'] = len(files_list)

            # Save index
            with open(index_file, 'w') as f:
                json.dump(index_data, f, indent=2)

        except Exception as e:
            print(f"⚠️ Warning: Could not update index: {e}")

    def _commit_and_push(self):
        """Commit changes and land them on main via an auto-merged pull request.

        main is protected (PR required + status checks + merge queue), so a direct
        push is rejected. Instead we push a branch, open a PR, and enable auto-merge
        (the repo's auto-approve workflow satisfies the required review, and the
        merge queue lands it once checks pass). Requires an authenticated `gh`.
        """
        try:
            cwd = self.dashboard_dir

            # Stage all changes
            result = subprocess.run(["git", "add", "."], cwd=cwd, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"❌ Failed to add files: {result.stderr}")
                return False

            # Nothing to commit?
            result = subprocess.run(["git", "status", "--porcelain"], cwd=cwd, capture_output=True, text=True)
            if not result.stdout.strip():
                print("ℹ️ No changes to commit")
                return True

            # Create a dated branch (main is protected against direct pushes)
            branch = f"perf/{datetime.now().strftime('%Y-%m-%d-%H%M%S')}"
            result = subprocess.run(["git", "checkout", "-b", branch], cwd=cwd, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"❌ Failed to create branch: {result.stderr}")
                return False

            # Commit
            commit_msg = f"Add performance results - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
            result = subprocess.run(["git", "commit", "-m", commit_msg], cwd=cwd, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"❌ Failed to commit: {result.stderr}")
                return False

            # Push the branch (allowed; only main is protected)
            result = subprocess.run(["git", "push", "-u", "origin", branch], cwd=cwd, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"❌ Failed to push branch: {result.stderr}")
                return False

            # Open a pull request
            gh = _find_gh()
            result = subprocess.run(
                [gh, "pr", "create", "--base", "main", "--head", branch,
                 "--title", commit_msg,
                 "--body", "Automated daily performance results upload."],
                cwd=cwd, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"❌ Failed to create PR: {result.stderr}")
                print("💡 The branch was pushed; open a PR manually if needed.")
                return False
            pr_url = result.stdout.strip()
            print(f"🔀 Opened PR: {pr_url}")

            # Enable auto-merge (squash). Fall back to an immediate merge if the
            # repo does not have auto-merge enabled.
            result = subprocess.run(
                [gh, "pr", "merge", branch, "--squash", "--auto", "--delete-branch", "--yes"],
                cwd=cwd, capture_output=True, text=True)
            if result.returncode != 0:
                fallback = subprocess.run(
                    [gh, "pr", "merge", branch, "--squash", "--delete-branch", "--yes"],
                    cwd=cwd, capture_output=True, text=True)
                if fallback.returncode != 0:
                    print(f"⚠️ Could not enable auto-merge: {result.stderr or fallback.stderr}")
                    print(f"💡 PR is open for manual merge: {pr_url}")
                    return True

            print(f"📤 PR submitted with auto-merge enabled: {pr_url}")
            return True

        except Exception as e:
            print(f"❌ Error during commit/PR: {e}")
            return False

    def _cleanup(self):
        """Clean up temporary directory."""
        try:
            if os.path.exists(self.temp_dir):
                shutil.rmtree(self.temp_dir)
        except Exception as e:
            print(f"⚠️ Warning: Could not clean up temp directory: {e}")


def main():
    """Main function for command line usage."""
    if len(sys.argv) < 2:
        print("Usage: python push_to_github.py <path_to_results_json>")
        sys.exit(1)

    json_file_path = sys.argv[1]

    # Check if file exists
    if not os.path.exists(json_file_path):
        print(f"Error: File not found: {json_file_path}")
        sys.exit(1)

    uploader = GitHubPerformanceUploader()
    success = uploader.upload_results(json_file_path)

    if success:
        print("✅ Upload completed successfully!")
        sys.exit(0)
    else:
        print("❌ Upload failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()