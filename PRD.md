📘 PRODUCT REQUIREMENTS DOCUMENT (PRD)
1. 🧭 Product Overview
Product Name VelumX,

Stacks Gas Abstraction Layer (SGAL)

Vision

Enable users to interact with DeFi on Stacks without holding STX, by paying gas in USDCx via a programmable paymaster system.

Core Value Proposition:

No STX required

Seamless DeFi UX

One-click swaps

Gas-included liquidity adds

Yield deposits without friction

Web2-level onboarding

2. 🎯 Product Goals
Primary Goals

Enable gas payment in USDCx for any contract call.

Provide smart wallet infrastructure.

Support DeFi primitives:

Swaps

Add/remove liquidity

Earn vault deposits

Yield strategies

Create SDK for dApps to integrate gas abstraction easily.

3. 👥 Target Users
Retail Users

Don’t understand STX

Only hold USDCx

Want simple DeFi access

DeFi Protocols on Stacks

DEXs

Lending markets

Yield aggregators

NFT marketplaces

Web2 Apps Onboarding to Bitcoin Ecosystem

Fintech apps

Wallet providers

4. 🧱 Core Features
A. Smart Wallet System
Functional Requirements

Contract-based wallet (Clarity)

Signature validation

Nonce management

Session keys

Spending limits

Social recovery (Phase 2)

Why This Matters

Enables:

Gas abstraction

Batched transactions

Safer UX for DeFi

B. USDCx Paymaster Engine
Functional Requirements

Convert STX gas → USDCx equivalent

Dynamic pricing

Slippage protection

Fee caps

Relayer compensation logic

Flow

User signs intent →
Relayer pays STX →
Wallet transfers USDCx to relayer

C. Universal DeFi Execution Router

Wallet must support:

Swaps

Add liquidity

Remove liquidity

Stake LP tokens

Deposit into vaults

Claim rewards

5. 🏦 DeFi Product Integrations

Here’s how paymaster unlocks each product.

5.1 🔄 Swaps
Example Flow

User:

Has USDCx

Wants STX or other token

Has 0 STX

Flow:

User signs swap intent

Relayer pays STX gas

Wallet executes DEX swap

Paymaster deducts USDCx fee

Required Implementation

Integrate with DEX contracts

Simulate slippage off-chain

Add gas buffer

UX Outcome

One-click swap.
No gas popups.
No STX needed.

5.2 💧 Add Liquidity
Example

User:

Holds USDCx + STX

Wants LP tokens

Has no STX for gas

Flow:

Wallet batches:

Approve

Add liquidity

Relayer pays gas

USDCx deducted

Enhancement

Enable single-sided liquidity:

Auto-swap half

Add LP

Stake LP
All in one transaction.

This becomes:

“1-click LP + farm”

5.3 🌾 Earn / Yield Vaults
Flow

User:

Deposits USDCx into yield vault

Process:

Smart wallet executes deposit

Relayer covers gas

Paymaster deducts USDCx

Advanced Option

Batch:

Deposit

Stake

Lock

Claim rewards

All abstracted under single intent.

5.4 🔁 Auto-Compounding

User sets:

Recurring compound rule

Off-chain service:

Monitors vault rewards

Submits compound intent

Deducts small USDCx fee

6. 🧠 Advanced Features
A. Intent Batching

Support:

Multi-call transactions

Atomic execution

Partial revert handling

Needed for:

LP + stake

Swap + deposit

Claim + reinvest

B. Session Keys

Allow:

Temporary keys

Spending caps

Time limits

Used for:

Trading bots

Auto-compounding

Recurring DCA

C. Fee Modes

Allow dApps to choose:

User pays

dApp sponsors gas

Shared fee

Subscription model

7. 🧩 SDK Requirements

SDK must provide:

Intent builder

Signature module

Fee estimator

Simulation engine

Gas abstraction toggle

Integration goal:

const tx = buildSwapIntent(...)
await wallet.executeWithPaymaster(tx)

Minimal integration complexity.

8. 📊 Monetization Model
Revenue Sources

Spread on STX→USDCx conversion

% of gas fee

Premium relayer routing

SaaS fees for protocols

White-label wallet licensing

9. 🔐 Security Requirements

Must include:

Signature replay protection

Nonce isolation

Fee caps

Oracle sanity checks

Relayer staking (Phase 2)

Emergency pause

10. 🚀 Implementation Roadmap
Phase 1 — Core Infrastructure (0–3 months)

Smart wallet contract

Centralized relayer

Basic USDCx paymaster

Swap support

Deliverable:
Gasless swaps on one DEX.

Phase 2 — DeFi Expansion (3–6 months)

LP support

Vault integrations

Batching

SDK public release

Deliverable:
Gasless DeFi suite.

Phase 3 — Decentralization (6–12 months)

Relayer registry

Staking + slashing

Fee competition

Intent marketplace

Deliverable:
Open gas market on Stacks.

11. 📈 Success Metrics
of gasless transactions

USDCx volume processed

Relayer profit margin

Integration count (DEXs, vaults)

User retention rate

Avg tx cost reduction

12. 🏁 Competitive Positioning

On Ethereum, infrastructure like
Pimlico supports ERC-4337.

On Stacks:
There is no dominant gas abstraction layer.

If executed properly, this becomes:

Default smart wallet infra

Default paymaster layer

Default DeFi UX standard

13. 🔥 Strategic Advantage

Whoever controls gas abstraction controls:

UX

Transaction flow

Order routing

DeFi composability

