;; VelumX Simple Paymaster v2 - Mainnet
;; Gasless transactions: users pay gas in any SIP-010 token.
;; Relayer sponsors the STX network fee via native Stacks sponsorship.
;;
;; Multi-tenant design:
;;   - No relayer whitelist: any principal can receive fees (relayer validates off-chain)
;;   - No token whitelist: any SIP-010 token works (relayer validates supported tokens)
;;   - Security is enforced by the relayer: it only sponsors txs it has verified
;;   - The contract's only job: collect the fee and execute the action atomically
;;
;; Supported actions:
;;   swap-gasless      - ALEX AMM swap (amm-pool-v2-01)
;;   bridge-gasless    - USDCx cross-chain bridge burn
;;   transfer-gasless  - Any SIP-010 token transfer
;;   execute-gasless   - Universal: any developer-defined action via velumx-executor-trait

;; Mainnet SIP-010 trait - using ALEX's trait for amm-pool-v2-01 compatibility
(use-trait sip-010-trait 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.trait-sip-010.sip-010-trait)

;; VelumX executor trait - developers implement this to plug in custom actions
;; Interface: (execute (user principal) (payload (buff 2048))) -> (response bool uint)
(define-trait velumx-executor-trait
  ((execute (principal (buff 2048)) (response bool uint)))
)

;; -------------------------------------------------------
;; Constants
;; -------------------------------------------------------
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-ZERO-FEE (err u101))
(define-constant ERR-SELF-TRANSFER (err u102))

;; Admin (VelumX protocol - for contract upgrades only)
(define-data-var admin principal tx-sender)

;; -------------------------------------------------------
;; Read-only
;; -------------------------------------------------------
(define-read-only (get-admin) (var-get admin))

;; -------------------------------------------------------
;; Internal: collect fee from user to developer's relayer
;; The relayer is the developer's derived key (getUserRelayerKey).
;; Fee goes directly to the developer's relayer to cover their STX costs.
;; Security: user explicitly signs the tx with relayer address + fee amount visible.
;; -------------------------------------------------------
(define-private (collect-fee-internal
    (fee-token <sip-010-trait>)
    (fee-amount uint)
    (relayer principal))
  (let ((user tx-sender))
    (asserts! (> fee-amount u0) ERR-ZERO-FEE)
    (asserts! (not (is-eq user relayer)) ERR-SELF-TRANSFER)
    (contract-call? fee-token transfer fee-amount user relayer none)
  )
)

;; -------------------------------------------------------
;; swap-gasless
;; User pays gas fee in any approved SIP-010 token.
;; Executes a direct swap on ALEX amm-pool-v2-01.
;;
;; Parameters:
;;   token-x-trait  - Input token (SIP-010)
;;   token-y-trait  - Output token (SIP-010)
;;   factor         - ALEX pool factor (e.g. u100000000)
;;   dx             - Amount of token-x to swap (in 1e8 units)
;;   min-dy         - Minimum output amount (slippage protection)
;;   fee-amount     - Gas fee in fee-token micro units
;;   relayer        - Authorized VelumX relayer
;;   fee-token      - SIP-010 token user pays gas with
;; -------------------------------------------------------
(define-public (swap-gasless
    (token-x-trait <sip-010-trait>)
    (token-y-trait <sip-010-trait>)
    (factor uint)
    (dx uint)
    (min-dy (optional uint))
    (fee-amount uint)
    (relayer principal)
    (fee-token <sip-010-trait>))
  (begin
    ;; 1. Collect gas fee from user
    (try! (collect-fee-internal fee-token fee-amount relayer))

    ;; 2. Execute swap on ALEX AMM
    (try! (contract-call? 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.amm-pool-v2-01
      swap-helper
      token-x-trait
      token-y-trait
      factor
      dx
      min-dy))

    (print {
      event: "swap-gasless",
      user: tx-sender,
      token-x: (contract-of token-x-trait),
      token-y: (contract-of token-y-trait),
      dx: dx,
      fee-token: (contract-of fee-token),
      fee-amount: fee-amount
    })

    (ok true)
  )
)

;; -------------------------------------------------------
;; swap-gasless-a
;; Two-hop swap via ALEX amm-pool-v2-01 swap-helper-a.
;; token-x → token-y → token-z
;;
;; Parameters:
;;   token-x-trait  - Input token
;;   token-y-trait  - Intermediate token
;;   token-z-trait  - Output token
;;   factor-x       - Pool factor for x→y hop
;;   factor-y       - Pool factor for y→z hop
;;   dx             - Amount of token-x to swap
;;   min-dz         - Minimum output amount (slippage protection)
;;   fee-amount     - Gas fee in fee-token micro units
;;   relayer        - Authorized VelumX relayer
;;   fee-token      - SIP-010 token user pays gas with
;; -------------------------------------------------------
(define-public (swap-gasless-a
    (token-x-trait <sip-010-trait>)
    (token-y-trait <sip-010-trait>)
    (token-z-trait <sip-010-trait>)
    (factor-x uint)
    (factor-y uint)
    (dx uint)
    (min-dz (optional uint))
    (fee-amount uint)
    (relayer principal)
    (fee-token <sip-010-trait>))
  (begin
    (try! (collect-fee-internal fee-token fee-amount relayer))
    (try! (contract-call? 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.amm-pool-v2-01
      swap-helper-a
      token-x-trait
      token-y-trait
      token-z-trait
      factor-x
      factor-y
      dx
      min-dz))
    (print {
      event: "swap-gasless-a",
      user: tx-sender,
      token-x: (contract-of token-x-trait),
      token-z: (contract-of token-z-trait),
      dx: dx,
      fee-token: (contract-of fee-token),
      fee-amount: fee-amount
    })
    (ok true)
  )
)

;; -------------------------------------------------------
;; swap-gasless-b
;; Three-hop swap via ALEX amm-pool-v2-01 swap-helper-b.
;; token-x → token-y → token-z → token-w
;; -------------------------------------------------------
(define-public (swap-gasless-b
    (token-x-trait <sip-010-trait>)
    (token-y-trait <sip-010-trait>)
    (token-z-trait <sip-010-trait>)
    (token-w-trait <sip-010-trait>)
    (factor-x uint)
    (factor-y uint)
    (factor-z uint)
    (dx uint)
    (min-dw (optional uint))
    (fee-amount uint)
    (relayer principal)
    (fee-token <sip-010-trait>))
  (begin
    (try! (collect-fee-internal fee-token fee-amount relayer))
    (try! (contract-call? 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.amm-pool-v2-01
      swap-helper-b
      token-x-trait
      token-y-trait
      token-z-trait
      token-w-trait
      factor-x
      factor-y
      factor-z
      dx
      min-dw))
    (print {
      event: "swap-gasless-b",
      user: tx-sender,
      token-x: (contract-of token-x-trait),
      token-w: (contract-of token-w-trait),
      dx: dx,
      fee-token: (contract-of fee-token),
      fee-amount: fee-amount
    })
    (ok true)
  )
)

;; -------------------------------------------------------
;; bridge-gasless
;; User pays gas fee in any approved SIP-010 token.
;; Burns USDCx for cross-chain bridge.
;;
;; Parameters:
;;   amount         - USDCx amount to bridge (micro units)
;;   recipient      - Ethereum recipient address (32 bytes)
;;   fee-amount     - Gas fee in fee-token micro units
;;   relayer        - Authorized VelumX relayer
;;   fee-token      - SIP-010 token user pays gas with
;; -------------------------------------------------------
(define-public (bridge-gasless
    (amount uint)
    (recipient (buff 32))
    (fee-amount uint)
    (relayer principal)
    (fee-token <sip-010-trait>))
  (begin
    ;; 1. Collect gas fee from user
    (try! (collect-fee-internal fee-token fee-amount relayer))

    ;; 2. Burn USDCx for bridge
    (try! (contract-call? 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx-v1
      burn amount u0 recipient))

    (print {
      event: "bridge-gasless",
      user: tx-sender,
      amount: amount,
      recipient: recipient,
      fee-token: (contract-of fee-token),
      fee-amount: fee-amount
    })

    (ok true)
  )
)

;; -------------------------------------------------------
;; transfer-gasless
;; User pays gas fee in any approved SIP-010 token.
;; Transfers any SIP-010 token to a recipient.
;;
;; Parameters:
;;   amount         - Amount to transfer
;;   recipient      - Transfer recipient
;;   memo           - Optional memo
;;   fee-amount     - Gas fee in fee-token micro units
;;   relayer        - Authorized VelumX relayer
;;   fee-token      - SIP-010 token user pays gas with
;;   target-token   - The SIP-010 token to transfer
;; -------------------------------------------------------
(define-public (transfer-gasless
    (amount uint)
    (recipient principal)
    (memo (optional (buff 34)))
    (fee-amount uint)
    (relayer principal)
    (fee-token <sip-010-trait>)
    (target-token <sip-010-trait>))
  (begin
    ;; 1. Collect gas fee from user
    (try! (collect-fee-internal fee-token fee-amount relayer))

    ;; 2. Execute the token transfer
    (try! (contract-call? target-token transfer amount tx-sender recipient memo))

    (print {
      event: "transfer-gasless",
      user: tx-sender,
      token: (contract-of target-token),
      amount: amount,
      recipient: recipient,
      fee-token: (contract-of fee-token),
      fee-amount: fee-amount
    })

    (ok true)
  )
)

;; -------------------------------------------------------
;; execute-gasless
;; Universal executor for developer-defined actions.
;; Developers deploy a contract implementing velumx-executor-trait
;; and pass it here. The paymaster collects the fee and calls
;; executor.execute(user, payload).
;;
;; This enables any custom action (staking, LP, NFT mint, etc.)
;; to be gasless without modifying this contract.
;;
;; Parameters:
;;   executor       - Contract implementing velumx-executor-trait
;;   payload        - Arbitrary bytes passed to executor.execute()
;;   fee-amount     - Gas fee in fee-token micro units
;;   relayer        - Authorized VelumX relayer
;;   fee-token      - SIP-010 token user pays gas with
;;
;; Example executor contract:
;;   (define-public (execute (user principal) (payload (buff 2048)))
;;     ;; decode payload and perform action on behalf of user
;;     (ok true))
;; -------------------------------------------------------
(define-public (execute-gasless
    (executor <velumx-executor-trait>)
    (payload (buff 2048))
    (fee-amount uint)
    (relayer principal)
    (fee-token <sip-010-trait>))
  (let ((user tx-sender))
    ;; 1. Collect gas fee from user
    (try! (collect-fee-internal fee-token fee-amount relayer))

    ;; 2. Call developer's executor contract with user context
    ;; tx-sender inside executor will be this paymaster contract,
    ;; so we pass user explicitly for the executor to act on their behalf
    (try! (contract-call? executor execute user payload))

    (print {
      event: "execute-gasless",
      user: user,
      executor: (contract-of executor),
      fee-token: (contract-of fee-token),
      fee-amount: fee-amount
    })

    (ok true)
  )
)

;; -------------------------------------------------------
;; Admin
;; -------------------------------------------------------
(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR-NOT-AUTHORIZED)
    (var-set admin new-admin)
    (ok true)
  )
)
