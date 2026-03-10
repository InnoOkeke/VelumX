# Gasless Transaction Flow Diagrams

## User Journey: Bridge (Stacks → Ethereum)

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER ACTIONS                            │
└─────────────────────────────────────────────────────────────────┘

1. User connects wallets (Ethereum + Stacks)
   │
   ▼
2. User enters amount: "10 USDCx"
   │
   ▼
3. User enables "Gasless Mode" toggle
   │
   ▼
4. System shows: "Fee: 0.25 USDCx"
   │
   ▼
5. User clicks "Bridge" button
   │
   └──────────────────────────────────────────────────────────────┐
                                                                   │
┌──────────────────────────────────────────────────────────────────┘
│                    AUTOMATIC PROCESSING                          │
└──────────────────────────────────────────────────────────────────┐
                                                                   │
6. Check Smart Wallet                                              │
   │                                                               │
   ├─ Has Smart Wallet? → Continue                                │
   │                                                               │
   └─ No Smart Wallet? → Auto-register                            │
      │                                                            │
      ├─ Show: "Registering Smart Wallet..."                      │
      ├─ User signs registration                                  │
      ├─ Wait for confirmation                                    │
      └─ Continue                                                  │
   │                                                               │
   ▼                                                               │
7. Calculate total cost                                            │
   │                                                               │
   ├─ Bridge amount: 10.00 USDCx                                  │
   ├─ Gas fee: 0.25 USDCx                                         │
   └─ Total needed: 10.25 USDCx                                   │
   │                                                               │
   ▼                                                               │
8. Check balances                                                  │
   │                                                               │
   ├─ Personal wallet: 5.00 USDCx                                 │
   ├─ Smart wallet: 5.50 USDCx                                    │
   └─ Total available: 10.50 USDCx ✓                              │
   │                                                               │
   ▼                                                               │
9. Build transaction intent                                        │
   │                                                               │
   ├─ Target: paymaster-module-v10                                │
   ├─ Function: withdraw-gasless                                  │
   ├─ Amount: 10000000 microUSDCx                                 │
   ├─ Fee: 250000 microUSDCx                      