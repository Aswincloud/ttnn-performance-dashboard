#!/bin/bash

# Daily Performance Measurement Script for TT-Metal
# This script runs the complete workflow: update code, build, measure performance, upload results

set -eo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/perf_log.txt"
ERROR_LOG="$SCRIPT_DIR/perf_error.txt"
PYTHON_ENV="$SCRIPT_DIR/python_env"
NOTIFICATION_EMAIL="aswin@aswincloud.com"
RESEND_API_KEY="${RESEND_API_KEY:-re_DUMMY_replace_with_real_key}"

# Parse command line arguments
UPLOAD_TO_GITHUB=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --upload|--github)
            UPLOAD_TO_GITHUB=true
            shift
            ;;
        --no-upload|--local)
            UPLOAD_TO_GITHUB=false
            shift
            ;;
        *)
            echo "Usage: $0 [--upload|--no-upload]"
            echo "  --upload/--github: Upload results to GitHub repository"
            echo "  --no-upload/--local: Keep results local only (default)"
            exit 1
            ;;
    esac
done

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to log errors
log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "$ERROR_LOG"
}

# GitHub Configuration
GITHUB_REPO_URL="git@github.com:Aswincloud/ttnn-performance-dashboard.git"

# Validate GitHub configuration (only if uploading)
if [ "$UPLOAD_TO_GITHUB" = true ]; then
    log "🔗 Using repository: $GITHUB_REPO_URL"
fi

# Function to check if command succeeded — pass exit code explicitly
check_success() {
    local rc=$1
    local msg="$2"
    if [ "$rc" -eq 0 ]; then
        log "✅ $msg - SUCCESS"
    else
        log_error "$msg - FAILED (exit code: $rc)"
        send_email "TT-Metal Perf: $msg FAILED" "Step '$msg' failed with exit code $rc.\n\nLog tail:\n$(tail -30 "$LOG_FILE" 2>/dev/null)"
        exit 1
    fi
}

send_email() {
    local subject="$1"
    local body="$2"
    if [ -z "$RESEND_API_KEY" ]; then
        log "⚠️  RESEND_API_KEY not set, skipping email notification"
        return 0
    fi
    log "📧 Sending email notification: $subject"
    curl -s -X POST "https://api.resend.com/emails" \
        -H "Authorization: Bearer $RESEND_API_KEY" \
        -H "Content-Type: application/json" \
        -d "$(jq -n \
            --arg from "TT-Metal Perf <onboarding@resend.dev>" \
            --arg to "$NOTIFICATION_EMAIL" \
            --arg subject "$subject" \
            --arg text "$(echo -e "$body")" \
            '{from: $from, to: [$to], subject: $subject, text: $text}'
        )" > /dev/null 2>&1 || log "⚠️  Failed to send email"
}

# Start the performance measurement workflow
log "🚀 Starting daily performance measurement workflow"
log "📁 Working directory: $SCRIPT_DIR"
if [ "$UPLOAD_TO_GITHUB" = true ]; then
    log "📤 GitHub upload: ENABLED"
    log "🔗 Repository: $GITHUB_REPO_URL"
else
    log "📁 Local mode: Results will be saved locally only"
fi

# Change to script directory
cd "$SCRIPT_DIR"

# Step 1: Git operations
log "📥 Step 1: Updating repository..."
git pull origin main 2>&1 | tee -a "$LOG_FILE"
rc=${PIPESTATUS[0]}
git pull origin main 2>&1 | tee -a "$LOG_FILE"
rc=${PIPESTATUS[0]}
check_success "$rc" "Git pull"

git submodule update --init --recursive 2>&1 | tee -a "$LOG_FILE"
check_success "${PIPESTATUS[0]}" "Git submodule update"

# Verify branch is up to date with remote
log "🔍 Verifying branch is in sync with remote..."
git fetch origin main 2>/dev/null
LOCAL_HEAD=$(git rev-parse HEAD)
REMOTE_HEAD=$(git rev-parse origin/main)
if [ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]; then
    BEHIND_COUNT=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "unknown")
    AHEAD_COUNT=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo "unknown")
    log_error "Branch out of sync after pull! Local: ${LOCAL_HEAD:0:12}, Remote: ${REMOTE_HEAD:0:12} (behind: $BEHIND_COUNT, ahead: $AHEAD_COUNT)"
    send_email "TT-Metal Perf: Git Sync Issue" \
        "Branch is out of sync with origin/main after two git pull attempts.\n\nLocal HEAD:  $LOCAL_HEAD\nRemote HEAD: $REMOTE_HEAD\nCommits behind: $BEHIND_COUNT\nCommits ahead:  $AHEAD_COUNT\n\nThis may indicate merge conflicts, a detached HEAD, or network issues.\nManual intervention required."
    exit 1
fi
log "✅ Branch is in sync with origin/main"

CURRENT_COMMIT="$LOCAL_HEAD"
log "🔧 Current commit: $CURRENT_COMMIT"

# Step 2: Activate Python environment
log "🐍 Step 2: Activating Python environment..."

# Set required environment variables for TT-Metal
export ARCH_NAME="wormhole_b0"
log "🔧 Setting ARCH_NAME: $ARCH_NAME"

# Use the smart activation script
if [ -f "$SCRIPT_DIR/activate_env.sh" ]; then
    log "🔄 Sourcing activation script..."

    # Source directly, then capture and display the key info
    source "$SCRIPT_DIR/activate_env.sh"

    if [ $? -eq 0 ] && [ -n "$VIRTUAL_ENV" ]; then
        log "✅ Smart environment activation - SUCCESS"
        log "🔍 Environment check: VIRTUAL_ENV=$VIRTUAL_ENV"
        log "🔍 Python check: $(which python 2>/dev/null || echo 'not found')"
    else
        log_error "Smart environment activation - FAILED"
        exit 1
    fi
else
    # Fallback to manual activation if activate_env.sh not found
    log "⚠️  activate_env.sh not found, using fallback activation..."
    if [ -f "$PYTHON_ENV/bin/activate" ]; then
        # Activate the virtual environment
        source "$PYTHON_ENV/bin/activate"

        # Check if activation was successful by verifying VIRTUAL_ENV is set
        if [ -n "$VIRTUAL_ENV" ] && [ "$VIRTUAL_ENV" = "$PYTHON_ENV" ]; then
            log "✅ Fallback activation successful: $VIRTUAL_ENV"

            # Set TT-Metal environment variables
            export TT_METAL_HOME="$SCRIPT_DIR"
            export PYTHONPATH="$TT_METAL_HOME:$PYTHONPATH"
            log "🔧 TT_METAL_HOME: $TT_METAL_HOME"
            log "🐍 PYTHONPATH: $PYTHONPATH"
            log "🔍 Python executable: $(which python)"
        else
            log_error "Fallback activation failed - VIRTUAL_ENV not properly set"
            log_error "Expected: $PYTHON_ENV"
            log_error "Actual: $VIRTUAL_ENV"
            exit 1
        fi
    else
        log_error "Python environment not found at $PYTHON_ENV"
        exit 1
    fi
fi

# Step 3: Install dependencies and build
log "📦 Installing dependencies..."
sudo ./install_dependencies.sh 2>&1 | tee -a "$LOG_FILE"
check_success "${PIPESTATUS[0]}" "Install dependencies"

log "🧹 Clearing TT-Metal cache..."
rm -rf /home/aswin/.cache/tt-metal-cache
log "🔨 Building TT-Metal..."
set +e
./build_metal.sh
BUILD_RC=$?
set -e

if [ "$BUILD_RC" -ne 0 ]; then
    log "⚠️  Initial build failed (exit code: $BUILD_RC), attempting clean build..."
    log "🧹 Cleaning build artifacts..."
    set +e
    ./build_metal.sh --clean
    log "🔨 Retrying build after clean..."
    ./build_metal.sh
    BUILD_RC=$?
    set -e
    check_success "$BUILD_RC" "TT-Metal clean rebuild"
else
    log "✅ Build successful"
fi

# Install ttperf
log "📦 Installing ttperf..."
uv pip install ttperf 2>&1 | tee -a "$LOG_FILE"
check_success "${PIPESTATUS[0]}" "ttperf installation"

# Step 4: Run performance measurements
log "📊 Step 4: Running performance measurements..."

# Ensure Python executable is available
if [ -n "$VIRTUAL_ENV" ] && [ -f "$VIRTUAL_ENV/bin/python" ]; then
    PYTHON_CMD="$VIRTUAL_ENV/bin/python"
    log "🐍 Using Python: $PYTHON_CMD"
elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python"
    log "🐍 Using system Python: $(which python)"
else
    log_error "Python executable not found"
    exit 1
fi

if [ "$UPLOAD_TO_GITHUB" = true ]; then
    log "🎯 Running: $PYTHON_CMD perf_measurement_script.py --upload"
    $PYTHON_CMD -u perf_measurement_script.py --upload 2>&1 | tee -a "$LOG_FILE"
    check_success "${PIPESTATUS[0]}" "Performance measurement with GitHub upload"
else
    log "🎯 Running: $PYTHON_CMD perf_measurement_script.py"
    $PYTHON_CMD -u perf_measurement_script.py 2>&1 | tee -a "$LOG_FILE"
    check_success "${PIPESTATUS[0]}" "Performance measurement (local only)"
fi

# Step 5: Generate summary
log "📈 Step 5: Generating summary..."
RESULTS_FILE=$(ls -t eltwise_perf_results_*_final.json 2>/dev/null | head -1)
if [ -n "$RESULTS_FILE" ]; then
    TOTAL_TESTS=$(jq -r '.metadata.total_tests' "$RESULTS_FILE" 2>/dev/null || echo "unknown")
    SUCCESSFUL_TESTS=$(jq -r '.metadata.successful_tests' "$RESULTS_FILE" 2>/dev/null || echo "unknown")
    FAILED_TESTS=$(jq -r '.metadata.failed_tests' "$RESULTS_FILE" 2>/dev/null || echo "unknown")
    
    log "📊 Results Summary:"
    log "   📄 Results file: $RESULTS_FILE"
    log "   📈 Total tests: $TOTAL_TESTS"
    log "   ✅ Successful: $SUCCESSFUL_TESTS"
    log "   ❌ Failed: $FAILED_TESTS"
    
    if [ "$UPLOAD_TO_GITHUB" = true ]; then
        log "   📤 Uploaded to GitHub repository"
        # Extract potential GitHub Pages URL from repo URL
        if [[ "$GITHUB_REPO_URL" == *"github.com"* ]]; then
            PAGES_URL=$(echo "$GITHUB_REPO_URL" | sed 's/github\.com/github.io/' | sed 's/\.git$//')
            log "   🌐 Dashboard URL: $PAGES_URL"
        fi
    else
        log "   📁 Results saved locally only"
        log "   💡 To upload later: $PYTHON_CMD push_to_github.py $RESULTS_FILE"
    fi
else
    log_error "No results file found"
fi

# Step 6: Cleanup (optional)
log "🧹 Step 6: Cleanup..."
# Remove old log files (keep last 7 days)
find "$SCRIPT_DIR" -name "perf_log_*.txt" -mtime +7 -delete 2>/dev/null || true
# For local mode, keep more historical data (60 days vs 30)
if [ "$UPLOAD_TO_GITHUB" = true ]; then
    RETENTION_DAYS=30
else
    RETENTION_DAYS=60
fi
find "$SCRIPT_DIR" -name "eltwise_perf_results_*.json" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
find "$SCRIPT_DIR" -name "eltwise_perf_results_*.csv" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
rm -rf "$SCRIPT_DIR/generated/"*

log "✅ Daily performance measurement completed successfully!"
log "$(printf '=%.0s' {1..60})"

send_email "TT-Metal Perf: Daily Run Completed" \
    "Daily performance measurement completed successfully.\n\nCommit: $CURRENT_COMMIT\nResults: ${RESULTS_FILE:-none}\nTotal tests: ${TOTAL_TESTS:-unknown}\nSuccessful: ${SUCCESSFUL_TESTS:-unknown}\nFailed: ${FAILED_TESTS:-unknown}"

exit 0