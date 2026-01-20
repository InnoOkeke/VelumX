# 🔒 Pre-Push Security Checklist

**CRITICAL: Complete this checklist before pushing to GitHub!**

## ✅ Files to NEVER Commit

- [ ] `backend/.env` - NOT in git (contains private keys)
- [ ] `frontend/.env.local` - NOT in git (may contain API keys)
- [ ] Any file with actual private keys or seed phrases
- [ ] `backend/deploy_output.txt` - NOT in git
- [ ] `stacks-contracts/deployment-info.json` - NOT in git

## ✅ .gitignore Verification

- [ ] `.env` is in .gitignore
- [ ] `.env.local` is in .gitignore
- [ ] `*.env` is in .gitignore
- [ ] `**/private-key*` is in .gitignore
- [ ] `**/seed-phrase*` is in .gitignore

## ✅ Code Review

- [ ] No hardcoded private keys in any `.ts`, `.js`, `.clar` files
- [ ] No hardcoded seed phrases in any files
- [ ] No API keys hardcoded in frontend code
- [ ] All sensitive values use `process.env.VARIABLE_NAME`

## ✅ Documentation Review

- [ ] Documentation uses placeholder values (e.g., `your_private_key_here`)
- [ ] No real private keys in example code
- [ ] No real seed phrases in setup guides
- [ ] Transaction IDs and contract addresses are OK (public info)

## ✅ Git Status Check

Run these commands:

```bash
# Check what files will be committed
git status

# Verify .env files are NOT listed
# If you see backend/.env or frontend/.env.local, STOP!

# Check staged changes for secrets
git diff --cached | grep -i "private"
git diff --cached | grep -i "seed"

# Should return nothing suspicious
```

## ✅ Automated Security Check

Run the security check script:

```bash
# On Linux/Mac
chmod +x check-secrets.sh
./check-secrets.sh

# On Windows (Git Bash)
bash check-secrets.sh
```

If the script passes, you're safe to push!

## ✅ Final Verification

Before `git push`:

1. **Double-check git status**:
   ```bash
   git status
   ```
   - Ensure no `.env` files are listed

2. **Review your commit**:
   ```bash
   git diff HEAD~1
   ```
   - Scan for any suspicious 64-character hex strings
   - Look for any seed phrases (12 or 24 words)

3. **Check remote**:
   ```bash
   git remote -v
   ```
   - Verify you're pushing to the correct repository

## 🚨 If You Accidentally Committed Secrets

**STOP! Do NOT push!**

### If not yet pushed:

```bash
# Remove the commit
git reset HEAD~1

# Remove sensitive files from staging
git rm --cached backend/.env
git rm --cached frontend/.env.local

# Commit again without secrets
git add .
git commit -m "Your commit message"
```

### If already pushed:

1. **Immediately rotate all exposed keys**:
   - Generate new private keys
   - Create new seed phrases
   - Update all API keys

2. **Remove from git history**:
   ```bash
   # Use BFG Repo-Cleaner or git filter-branch
   # See: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
   ```

3. **Force push** (only if repository is private and you're the only contributor)

## ✅ Safe to Push Checklist

- [ ] Ran `git status` - no .env files
- [ ] Ran security check script - passed
- [ ] Reviewed `git diff --cached` - no secrets
- [ ] All documentation uses placeholders
- [ ] `.gitignore` is properly configured
- [ ] Ready to push!

## 📝 Safe Push Command

```bash
# Add all changes (excluding .env files via .gitignore)
git add .

# Commit with descriptive message
git commit -m "feat: Add VelumX platform with Velar DEX integration"

# Push to GitHub
git push origin main
```

## 🔐 Post-Push Security

After pushing:

1. **Verify on GitHub**:
   - Browse your repository
   - Check that no .env files are visible
   - Search for "RELAYER_PRIVATE_KEY" - should only find placeholders

2. **Set up GitHub Secrets** (for CI/CD):
   - Go to Settings → Secrets and variables → Actions
   - Add secrets for deployment (if using GitHub Actions)

3. **Enable Secret Scanning** (if available):
   - Go to Settings → Code security and analysis
   - Enable "Secret scanning"

## ✅ Deployment Security

When deploying to Render/Vercel:

- [ ] Use platform's environment variable UI (not .env files)
- [ ] Never commit deployment credentials
- [ ] Use different keys for testnet and mainnet
- [ ] Enable 2FA on deployment platforms
- [ ] Monitor relayer account balance

---

**Remember: Once a secret is pushed to GitHub, consider it compromised!**

Always rotate keys if you suspect exposure.
