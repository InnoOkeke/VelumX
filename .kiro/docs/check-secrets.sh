#!/bin/bash
# Security check script - Run before git push
# This script checks for exposed secrets in your codebase

echo "🔒 VelumX Security Check"
echo "========================"
echo ""

# Check if .env files are in .gitignore
echo "✓ Checking .gitignore..."
if grep -q "^\.env$" .gitignore && grep -q "^\.env\.local$" .gitignore; then
    echo "  ✅ .env files are properly ignored"
else
    echo "  ❌ WARNING: .env files may not be properly ignored!"
    exit 1
fi

# Check if .env files are tracked by git
echo ""
echo "✓ Checking for tracked .env files..."
if git ls-files | grep -E "\.env$|\.env\.local$"; then
    echo "  ❌ CRITICAL: .env files are tracked by git!"
    echo "  Run: git rm --cached backend/.env frontend/.env.local"
    exit 1
else
    echo "  ✅ No .env files are tracked"
fi

# Check for hardcoded private keys (64 hex chars that look like keys)
echo ""
echo "✓ Checking for hardcoded private keys..."
SUSPICIOUS_KEYS=$(git diff --cached | grep -E "^[+].*[0-9a-f]{64}" | grep -v "txid" | grep -v "Explorer" | grep -v "transaction")
if [ ! -z "$SUSPICIOUS_KEYS" ]; then
    echo "  ⚠️  WARNING: Found suspicious 64-character hex strings:"
    echo "$SUSPICIOUS_KEYS"
    echo "  Please verify these are not private keys!"
else
    echo "  ✅ No suspicious private keys found"
fi

# Check for seed phrases (12 or 24 words)
echo ""
echo "✓ Checking for seed phrases..."
if git diff --cached | grep -iE "(SEED_PHRASE|mnemonic).*=.*[a-z]+ [a-z]+ [a-z]+"; then
    echo "  ❌ CRITICAL: Found potential seed phrase!"
    exit 1
else
    echo "  ✅ No seed phrases found"
fi

# Check for RELAYER_PRIVATE_KEY with actual values
echo ""
echo "✓ Checking for exposed relayer keys..."
if git diff --cached | grep -E "RELAYER_PRIVATE_KEY=[0-9a-f]{64}"; then
    echo "  ❌ CRITICAL: Found exposed RELAYER_PRIVATE_KEY!"
    exit 1
else
    echo "  ✅ No exposed relayer keys"
fi

echo ""
echo "========================"
echo "✅ Security check passed!"
echo "Safe to push to GitHub"
echo ""
echo "Remember:"
echo "- Never commit .env files"
echo "- Keep private keys in secure vaults"
echo "- Use different keys for testnet and mainnet"
echo "========================"
