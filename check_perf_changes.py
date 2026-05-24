#!/usr/bin/env python3
"""
Performance Change Detector and Email Notifier

This script compares the latest performance results with the previous results
and sends an email notification if any operation's performance change exceeds 20%.
"""

import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import requests


class PerformanceChangeDetector:
    def __init__(self, threshold_percent=20.0):
        self.threshold_percent = threshold_percent
        self.data_dir = Path("data")
        self.index_file = self.data_dir / "index.json"
        
    def load_index(self) -> Dict:
        """Load the index.json file."""
        try:
            with open(self.index_file, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"❌ Error loading index.json: {e}")
            return {}
    
    def get_latest_two_results(self) -> Tuple[Optional[Dict], Optional[Dict]]:
        """Get the two most recent performance measurement files."""
        index_data = self.load_index()
        files = index_data.get('files', [])
        
        if len(files) < 2:
            print(f"⚠️ Not enough data to compare. Found {len(files)} measurement(s).")
            return None, None
        
        # Files are already sorted by measurement_date (newest first)
        latest_path = self.data_dir / files[0]['path'].replace('data/', '')
        previous_path = self.data_dir / files[1]['path'].replace('data/', '')
        
        try:
            with open(latest_path, 'r') as f:
                latest_data = json.load(f)
            print(f"📄 Latest results: {files[0]['filename']}")
            print(f"   Date: {files[0]['measurement_date']}")
        except Exception as e:
            print(f"❌ Error loading latest results: {e}")
            return None, None
        
        try:
            with open(previous_path, 'r') as f:
                previous_data = json.load(f)
            print(f"📄 Previous results: {files[1]['filename']}")
            print(f"   Date: {files[1]['measurement_date']}")
        except Exception as e:
            print(f"❌ Error loading previous results: {e}")
            return None, None
        
        return latest_data, previous_data
    
    def compare_results(self, latest: Dict, previous: Dict) -> List[Dict]:
        """
        Compare two performance results and find operations with >threshold% change.
        
        Returns a list of operations with significant changes.
        """
        significant_changes = []
        
        # Create lookup dictionaries for quick access
        latest_ops = {result['operation_name']: result for result in latest.get('results', [])}
        previous_ops = {result['operation_name']: result for result in previous.get('results', [])}
        
        # Compare each operation
        for op_name, latest_result in latest_ops.items():
            if op_name not in previous_ops:
                continue
            
            previous_result = previous_ops[op_name]
            
            latest_avg = latest_result.get('average_duration_ns', 0)
            previous_avg = previous_result.get('average_duration_ns', 0)
            
            if previous_avg == 0:
                continue
            
            # Calculate percentage change
            change_percent = ((latest_avg - previous_avg) / previous_avg) * 100
            
            # Check if change exceeds threshold
            if abs(change_percent) >= self.threshold_percent:
                change_info = {
                    'operation_name': op_name,
                    'test_name': latest_result.get('test_name', op_name),
                    'previous_avg_ns': previous_avg,
                    'latest_avg_ns': latest_avg,
                    'change_percent': change_percent,
                    'change_type': 'improvement' if change_percent < 0 else 'regression',
                    'previous_timestamp': previous_result.get('timestamp', 'unknown'),
                    'latest_timestamp': latest_result.get('timestamp', 'unknown')
                }
                significant_changes.append(change_info)
        
        return significant_changes
    
    def format_email_body(self, changes: List[Dict], latest_metadata: Dict, previous_metadata: Dict) -> str:
        """Format the email body with performance change details."""
        if not changes:
            return "No significant performance changes detected."
        
        # Sort by absolute change percentage (highest first)
        changes.sort(key=lambda x: abs(x['change_percent']), reverse=True)
        
        # Count regressions and improvements
        regressions = [c for c in changes if c['change_type'] == 'regression']
        improvements = [c for c in changes if c['change_type'] == 'improvement']
        
        html_body = f"""
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .header {{ background-color: #f8d7da; padding: 20px; border-radius: 5px; margin-bottom: 20px; }}
                .header.warning {{ background-color: #fff3cd; }}
                .summary {{ background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px; }}
                .operation {{ border-left: 4px solid #dc3545; padding: 10px; margin: 10px 0; background-color: #fff; }}
                .operation.improvement {{ border-left-color: #28a745; }}
                .regression {{ color: #dc3545; font-weight: bold; }}
                .improvement {{ color: #28a745; font-weight: bold; }}
                .metric {{ font-family: monospace; background-color: #f8f9fa; padding: 2px 6px; border-radius: 3px; }}
                table {{ border-collapse: collapse; width: 100%; margin: 10px 0; }}
                th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
                th {{ background-color: #f8f9fa; }}
            </style>
        </head>
        <body>
            <div class="header">
                <h2>⚠️ TTNN Performance Alert</h2>
                <p>Significant performance changes detected (threshold: {self.threshold_percent}%)</p>
            </div>
            
            <div class="summary">
                <h3>Summary</h3>
                <table>
                    <tr>
                        <th>Metric</th>
                        <th>Count</th>
                    </tr>
                    <tr>
                        <td>Total Operations with Changes &gt; {self.threshold_percent}%</td>
                        <td><strong>{len(changes)}</strong></td>
                    </tr>
                    <tr style="background-color: #f8d7da;">
                        <td>Performance Regressions</td>
                        <td><strong>{len(regressions)}</strong></td>
                    </tr>
                    <tr style="background-color: #d4edda;">
                        <td>Performance Improvements</td>
                        <td><strong>{len(improvements)}</strong></td>
                    </tr>
                </table>
                
                <p>
                    <strong>Latest Measurement:</strong> {latest_metadata.get('measurement_date', 'unknown')}<br>
                    <strong>Previous Measurement:</strong> {previous_metadata.get('measurement_date', 'unknown')}<br>
                    <strong>Git Commit:</strong> <code>{latest_metadata.get('git_commit_id', 'unknown')[:8]}</code>
                </p>
            </div>
            
            <h3>Detailed Changes</h3>
        """
        
        # Add regressions first
        if regressions:
            html_body += "<h4 style='color: #dc3545;'>⬇️ Performance Regressions (Slower)</h4>"
            for change in regressions:
                change_sign = "+" if change['change_percent'] > 0 else ""
                html_body += f"""
                <div class="operation">
                    <h4>{change['operation_name']}</h4>
                    <p class="regression">Change: {change_sign}{change['change_percent']:.2f}%</p>
                    <table>
                        <tr>
                            <th>Metric</th>
                            <th>Previous</th>
                            <th>Latest</th>
                            <th>Difference</th>
                        </tr>
                        <tr>
                            <td>Average Duration (ns)</td>
                            <td class="metric">{change['previous_avg_ns']:.2f}</td>
                            <td class="metric">{change['latest_avg_ns']:.2f}</td>
                            <td class="metric">{change['latest_avg_ns'] - change['previous_avg_ns']:.2f}</td>
                        </tr>
                        <tr>
                            <td>Average Duration (μs)</td>
                            <td class="metric">{change['previous_avg_ns']/1000:.2f}</td>
                            <td class="metric">{change['latest_avg_ns']/1000:.2f}</td>
                            <td class="metric">{(change['latest_avg_ns'] - change['previous_avg_ns'])/1000:.2f}</td>
                        </tr>
                    </table>
                </div>
                """
        
        # Add improvements
        if improvements:
            html_body += "<h4 style='color: #28a745;'>⬆️ Performance Improvements (Faster)</h4>"
            for change in improvements:
                change_sign = "+" if change['change_percent'] > 0 else ""
                html_body += f"""
                <div class="operation improvement">
                    <h4>{change['operation_name']}</h4>
                    <p class="improvement">Change: {change_sign}{change['change_percent']:.2f}%</p>
                    <table>
                        <tr>
                            <th>Metric</th>
                            <th>Previous</th>
                            <th>Latest</th>
                            <th>Difference</th>
                        </tr>
                        <tr>
                            <td>Average Duration (ns)</td>
                            <td class="metric">{change['previous_avg_ns']:.2f}</td>
                            <td class="metric">{change['latest_avg_ns']:.2f}</td>
                            <td class="metric">{change['latest_avg_ns'] - change['previous_avg_ns']:.2f}</td>
                        </tr>
                        <tr>
                            <td>Average Duration (μs)</td>
                            <td class="metric">{change['previous_avg_ns']/1000:.2f}</td>
                            <td class="metric">{change['latest_avg_ns']/1000:.2f}</td>
                            <td class="metric">{(change['latest_avg_ns'] - change['previous_avg_ns'])/1000:.2f}</td>
                        </tr>
                    </table>
                </div>
                """
        
        html_body += """
            <hr>
            <p style="color: #6c757d; font-size: 12px;">
                This is an automated email from the TTNN Performance Dashboard.<br>
                Repository: <a href="https://github.com/Aswincloud/ttnn-performance-dashboard">Aswincloud/ttnn-performance-dashboard</a>
            </p>
        </body>
        </html>
        """
        
        return html_body
    
    def send_email_resend(self, subject: str, html_body: str, to_email: str, api_key: str, from_email: str = None) -> bool:
        """
        Send email using Resend API.
        
        Args:
            subject: Email subject
            html_body: HTML email body
            to_email: Recipient email address
            api_key: Resend API key
            from_email: Optional sender email (must use a verified domain for production)
            
        Returns:
            True if email sent successfully, False otherwise
        """
        url = "https://api.resend.com/emails"
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        # Use configured sender or default to onboarding email for testing
        if not (from_email and from_email.strip()):
            from_email = "TTNN Performance Dashboard <onboarding@resend.dev>"
            print(f"⚠️  Warning: Using default test sender (onboarding@resend.dev)")
            print(f"   This can only send to the Resend account owner's email.")
            print(f"   To send to other recipients, set FROM_EMAIL with a verified domain.")
        else:
            # Strip whitespace from provided email
            from_email = from_email.strip()
        
        # Validate email format
        # First check for basic @ presence
        if '@' not in from_email:
            print(f"❌ Error: Invalid FROM_EMAIL format: {from_email}")
            print(f"   Expected format: 'Name <email@domain.com>' or 'email@domain.com'")
            return False
        
        # Extract email from "Name <email@domain.com>" format if present
        email_part = from_email
        if '<' in from_email and '>' in from_email:
            # Validate proper bracket pairing
            open_bracket_idx = from_email.find('<')
            close_bracket_idx = from_email.find('>')
            if close_bracket_idx < open_bracket_idx:
                print(f"❌ Error: Invalid FROM_EMAIL format: {from_email}")
                print(f"   Expected format: 'Name <email@domain.com>' or 'email@domain.com'")
                return False
            
            # Extract email using the bracket indices
            email_part = from_email[open_bracket_idx + 1:close_bracket_idx].strip()
            if not email_part:
                print(f"❌ Error: Invalid FROM_EMAIL format: {from_email}")
                print(f"   Email cannot be empty within brackets")
                return False
        elif '<' in from_email or '>' in from_email:
            # Mismatched brackets
            print(f"❌ Error: Invalid FROM_EMAIL format: {from_email}")
            print(f"   Brackets must be properly paired: 'Name <email@domain.com>'")
            return False
        
        # Validate the extracted email: must have exactly one @ with valid parts
        if email_part.count('@') != 1:
            print(f"❌ Error: Invalid FROM_EMAIL format: {from_email}")
            print(f"   Expected format: 'Name <email@domain.com>' or 'email@domain.com'")
            return False
        
        # Split and validate user@domain parts
        parts = email_part.split('@')
        if not parts[0] or not parts[1]:
            print(f"❌ Error: Invalid email format in FROM_EMAIL: {from_email}")
            print(f"   Email must have format: user@domain.com")
            return False
        
        # Warn if domain doesn't have a dot (might be localhost or unusual TLD)
        if '.' not in parts[1]:
            print(f"⚠️  Warning: Domain '{parts[1]}' doesn't contain a dot")
            print(f"   This may be valid for localhost or certain TLDs, but could be a typo")
        
        # Check if using test domain (check against the actual email part, not display name)
        if 'resend.dev' in email_part.lower():
            print(f"⚠️  Note: Using Resend test domain (resend.dev)")
            print(f"   Emails can only be sent to your Resend account email address.")
            print(f"   To send to '{to_email}', verify a custom domain and update FROM_EMAIL.")
        
        payload = {
            "from": from_email,
            "to": [to_email],
            "subject": subject,
            "html": html_body
        }
        
        try:
            print(f"📧 Sending email to {to_email}...")
            print(f"   From: {from_email}")
            print(f"   Subject: {subject}")
            
            response = requests.post(url, json=payload, headers=headers, timeout=15)
            
            if response.status_code == 200:
                print(f"✅ Email sent successfully!")
                print(f"   Response: {response.json()}")
                return True
            else:
                print(f"❌ Failed to send email. Status code: {response.status_code}")
                print(f"   Response: {response.text}")
                
                # Provide helpful error messages for common issues
                if response.status_code == 403:
                    response_data = {}
                    content_type = response.headers.get('content-type', '').lower()
                    if 'application/json' in content_type:
                        try:
                            response_data = response.json()
                        except json.JSONDecodeError as e:
                            print(f"⚠️  Warning: Could not parse error response as JSON: {e}")
                    
                    error_message = response_data.get('message', '')
                    
                    if 'domain' in error_message.lower() or 'resend.dev' in error_message.lower():
                        print(f"\n💡 Domain Restriction Issue:")
                        print(f"   The sender domain needs to be verified with Resend.")
                        print(f"   Current sender: {from_email}")
                        print(f"   ")
                        print(f"   To fix this:")
                        print(f"   1. Verify a custom domain in your Resend account")
                        print(f"   2. Set FROM_EMAIL environment variable (e.g., 'alerts@yourdomain.com')")
                        print(f"   3. Update the GitHub Actions workflow or secrets")
                
                return False
                
        except Exception as e:
            print(f"❌ Error sending email: {e}")
            return False
    
    def send_test_email(self, api_key: str, to_email: str, from_email: str = None) -> int:
        """
        Send a test email with sample performance change data to verify the notification system.

        Returns:
            0 if email sent successfully
            1 if error occurred
        """
        print("🧪 TEST EMAIL MODE — sending sample performance alert email...")

        # Build sample changes that exercise both regressions and improvements
        now_str = datetime.now().isoformat()
        yesterday_str = (datetime.now() - timedelta(days=1)).isoformat()

        sample_changes = [
            {
                'operation_name': 'abs',
                'test_name': 'test_abs',
                'previous_avg_ns': 1005.0,
                'latest_avg_ns': 1306.5,
                'change_percent': 30.0,
                'change_type': 'regression',
                'previous_timestamp': yesterday_str,
                'latest_timestamp': now_str,
            },
            {
                'operation_name': 'exp',
                'test_name': 'test_exp',
                'previous_avg_ns': 2010.0,
                'latest_avg_ns': 2512.5,
                'change_percent': 25.0,
                'change_type': 'regression',
                'previous_timestamp': yesterday_str,
                'latest_timestamp': now_str,
            },
            {
                'operation_name': 'sqrt',
                'test_name': 'test_sqrt',
                'previous_avg_ns': 1510.0,
                'latest_avg_ns': 1057.0,
                'change_percent': -30.0,
                'change_type': 'improvement',
                'previous_timestamp': yesterday_str,
                'latest_timestamp': now_str,
            },
        ]

        sample_latest_metadata = {
            'measurement_date': now_str,
            'git_commit_id': 'testcommit001',
        }
        sample_previous_metadata = {
            'measurement_date': yesterday_str,
            'git_commit_id': 'testcommit000',
        }

        subject = f"🧪 [TEST] TTNN Performance Alert: {len(sample_changes)} sample operation(s) changed >{self.threshold_percent}%"
        html_body = self.format_email_body(sample_changes, sample_latest_metadata, sample_previous_metadata)

        # Prepend a prominent test banner to the HTML body
        test_banner = """
        <div style="background-color:#fff3cd;border:2px solid #ffc107;padding:15px;border-radius:5px;margin-bottom:20px;">
            <strong>🧪 THIS IS A TEST EMAIL</strong><br>
            The data below is sample/mock data used to verify the email notification system.
            No real performance changes were detected.
        </div>
        """
        html_body = html_body.replace("<body>", "<body>" + test_banner, 1)

        success = self.send_email_resend(subject, html_body, to_email, api_key, from_email)

        if success:
            print("✅ Test email sent successfully! Check your inbox.")
            return 0
        else:
            print("❌ Failed to send test email.")
            return 1

    def run(self, api_key: str, to_email: str, from_email: str = None) -> int:
        """
        Main execution method.
        
        Returns:
            0 if successful (changes detected and email sent or no changes found)
            1 if error occurred
        """
        print("🔍 TTNN Performance Change Detector")
        print(f"   Threshold: {self.threshold_percent}%")
        print(f"   Data directory: {self.data_dir.absolute()}")
        print()
        
        # Get latest two results
        latest, previous = self.get_latest_two_results()
        
        if latest is None or previous is None:
            print("❌ Cannot proceed without both latest and previous results.")
            return 1
        
        print()
        print("🔬 Comparing performance results...")
        
        # Compare results
        changes = self.compare_results(latest, previous)
        
        print(f"\n📊 Found {len(changes)} operation(s) with >{self.threshold_percent}% change")
        
        if not changes:
            print("✅ No significant performance changes detected.")
            return 0
        
        # Print summary to console
        regressions = [c for c in changes if c['change_type'] == 'regression']
        improvements = [c for c in changes if c['change_type'] == 'improvement']
        
        print(f"   ⬇️ Regressions: {len(regressions)}")
        print(f"   ⬆️ Improvements: {len(improvements)}")
        print()
        
        # Print details
        for change in sorted(changes, key=lambda x: abs(x['change_percent']), reverse=True):
            symbol = "📉" if change['change_type'] == 'regression' else "📈"
            sign = "+" if change['change_percent'] > 0 else ""
            print(f"{symbol} {change['operation_name']}: {sign}{change['change_percent']:.2f}% "
                  f"({change['previous_avg_ns']:.2f}ns → {change['latest_avg_ns']:.2f}ns)")
        
        print()
        
        # Format and send email
        latest_metadata = latest.get('metadata', {})
        previous_metadata = previous.get('metadata', {})
        
        subject = f"⚠️ TTNN Performance Alert: {len(changes)} operation(s) changed >{self.threshold_percent}%"
        html_body = self.format_email_body(changes, latest_metadata, previous_metadata)
        
        # Send email
        success = self.send_email_resend(subject, html_body, to_email, api_key, from_email)
        
        if success:
            print("✅ Performance change detection and notification completed successfully!")
            return 0
        else:
            print("⚠️ Performance changes detected but email notification failed.")
            return 1


def main():
    """Main function for command line usage."""
    # Get Resend API key from environment variable
    api_key = os.environ.get('RESEND_API_KEY')
    if not api_key:
        print("❌ Error: RESEND_API_KEY environment variable not set")
        print("   Please set it with: export RESEND_API_KEY='your-api-key'")
        sys.exit(1)
    
    # Get recipient email (default to aswin@aswincloud.com)
    to_email = os.environ.get('ALERT_EMAIL', 'aswin@aswincloud.com')
    
    # Get sender email (optional, for production use with verified domain)
    from_email = os.environ.get('FROM_EMAIL')
    
    # Get threshold from environment or use default
    threshold = float(os.environ.get('PERF_CHANGE_THRESHOLD', '20.0'))

    # Create detector and run
    detector = PerformanceChangeDetector(threshold_percent=threshold)

    # Check if test email mode is requested
    send_test_email = os.environ.get('SEND_TEST_EMAIL', 'false').lower() in ('true', '1', 'yes')
    if send_test_email:
        exit_code = detector.send_test_email(api_key, to_email, from_email)
    else:
        exit_code = detector.run(api_key, to_email, from_email)
    
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
