# Security Guidelines

## 🔐 Critical Security Information

### NEVER Commit These Files
The following files contain sensitive information and must NEVER be committed to git:

- `backend/.env` - Contains private keys and seed phrases
- `frontend/.env.local` - May contain API keys
- Any file with `private-key`, `seed-phrase`, or `mnemonic` in the name
- `backend/deploy_output.txt` - May contain deployment details
- `stacks-contracts/deployment-info.json` - Contains deployment information

### Environment Variables

#### Backend (.env)
```env
# SENSITIVE - NEVER COMMIT
RELAYER_PRIVATE_KEY=your_private_key_here
RELAYER_SEED_PHRASE=your twelve word seed phrase here
RELAYER_STACKS_ADDRESS=your_stacks_address_here
```

These values provide full control over the relayer wallet. If compromised:
- Attacker can drain all STX from relayer
- Attacker can sponsor malicious transactions
- Attacker can deploy contracts under your address

#### Frontend (.env.local)
```env
# Less sensitive but still private
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

## 🛡️ Security Best Practices

### 1. Environment Files
- ✅ Use `.env.example` as template
- ✅ Copy to `.env` and fill in real values
- ✅ Never commit `.env` files
- ✅ Add `.env*` to `.gitignore`
- ✅ Rotate keys regularly in production

### 2. Private Keys
- ✅ Generate unique keys for each environment (dev/staging/prod)
- ✅ Store production keys in secure vault (AWS Secrets Manager, HashiCorp Vault)
- ✅ Never share keys via email, Slack, or other channels
- ✅ Use hardware wallets for high-value accounts
- ✅ Implement key rotation policy

### 3. Seed Phrases
- ✅ Store offline in secure location
- ✅ Never type into online forms
- ✅ Use BIP39 standard phrases only
- ✅ Consider using multi-sig for production
- ✅ Have backup recovery plan

### 4. API Keys
- ✅ Use separate keys for dev/prod
- ✅ Rotate keys every 90 days
- ✅ Monitor usage for anomalies
- ✅ Set up rate limiting
- ✅ Use least-privilege principle

### 5. Relayer Security
- ✅ Monitor relayer balance continuously
- ✅ Set up alerts for low balance
- ✅ Set up alerts for unusual activity
- ✅ Implement spending limits
- ✅ Use separate hot/cold wallets

## 🚨 What to Do If Keys Are Compromised

### Immediate Actions
1. **Stop all services** using the compromised keys
2. **Transfer funds** to new secure wallet
3. **Rotate all keys** immediately
4. **Review transaction history** for unauthorized activity
5. **Update all configurations** with new keys
6. **Notify team members** if applicable

### Investigation
1. Check git history for accidental commits
2. Review access logs
3. Scan for malware
4. Review recent deployments
5. Check for unauthorized access

### Prevention
1. Use git hooks to prevent committing secrets
2. Use secret scanning tools (GitHub Secret Scanning, GitGuardian)
3. Implement code review process
4. Use environment variable management tools
5. Regular security audits

## 📋 Security Checklist

### Development
- [ ] `.env` files in `.gitignore`
- [ ] No hardcoded secrets in code
- [ ] Using `.env.example` templates
- [ ] Local secrets not shared
- [ ] Development keys separate from production

### Deployment
- [ ] Production keys in secure vault
- [ ] Environment variables set correctly
- [ ] No secrets in CI/CD logs
- [ ] Secrets rotation policy in place
- [ ] Monitoring and alerting configured

### Monitoring
- [ ] Relayer balance monitoring
- [ ] Transaction monitoring
- [ ] Unusual activity alerts
- [ ] Regular security audits
- [ ] Incident response plan

## 🔍 Scanning for Exposed Secrets

### Check Git History
```bash
# Search for potential secrets in git history
git log -p | grep -i "private"
git log -p | grep -i "seed"
git log -p | grep -i "mnemonic"
```

### Remove Accidentally Committed Secrets
```bash
# If you accidentally committed secrets, use git-filter-repo
# WARNING: This rewrites history
git filter-repo --path backend/.env --invert-paths
```

### Use Secret Scanning Tools
- GitHub Secret Scanning (automatic)
- GitGuardian
- TruffleHog
- git-secrets

## 📞 Reporting Security Issues

If you discover a security vulnerability:

1. **DO NOT** open a public issue
2. **DO NOT** share details publicly
3. Email security concerns to: [your-security-email]
4. Include detailed description
5. Wait for response before disclosure

## 🔗 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Stacks Security Best Practices](https://docs.stacks.co/security)
- [Ethereum Security](https://ethereum.org/en/security/)
- [Web3 Security](https://www.web3security.io/)

## ⚠️ Testnet vs Mainnet

### Testnet (Current)
- Uses testnet tokens (no real value)
- Acceptable to use less secure practices for testing
- Still should not commit keys to public repos
- Good for learning and development

### Mainnet (Future)
- Uses real tokens with real value
- MUST follow all security best practices
- MUST use hardware wallets for high-value accounts
- MUST have incident response plan
- MUST have insurance/backup funds
- MUST conduct security audit

---

**Remember:** Security is not a one-time task, it's an ongoing process. Stay vigilant!

**Last Updated:** January 20, 2026
