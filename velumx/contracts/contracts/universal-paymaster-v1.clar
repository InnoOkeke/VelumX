;; Universal Paymaster v1 - VelumX Protocol
;; Supports any SIP-010 token for gas fees across any transaction type
;; (Swaps, Transfers, Bridging, Staking, LP)

;; Testnet Traits (Use for Testnet deployment)
(use-trait sip-010-trait 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sip-010-trait-ft-standard.sip-010-trait)

;; Mainnet Traits (Uncomment for Mainnet)
;; (use-trait sip-010-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

;; Errors
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-TOKEN-NOT-APPROVED (err u101))
(define-constant ERR-FEE-EXCEEDS-MAX (err u102))
(define-constant ERR-INSUFFICIENT-BALANCE (err u103))

;; State
(define-data-var admin principal tx-sender)
(define-data-var treasury principal tx-sender)

;; Token Whitelist for Fees
(define-map ApprovedFeeTokens principal { approved: bool, min-fee-multiplier: uint })

;; Relayer Whitelist (Multi-tenant Support)
(define-map AuthorizedRelayers principal bool)

(define-read-only (is-token-approved (token principal))
  (default-to false (get approved (map-get? ApprovedFeeTokens token)))
)

(define-read-only (is-authorized-relayer (relayer principal))
  (default-to false (map-get? AuthorizedRelayers relayer))
)

;; ---------------------------------------------------------
;; Core Universal Execution
;; ---------------------------------------------------------

;; call-gasless
;; Generic executor for ANY contract call sponsored by VelumX
;; User signs intent, Relayer sponsors STX, and this contract collects the fee in SIP-010
(define-public (call-gasless
    (fee-token <sip-010-trait>)
    (fee-amount uint)
    (relayer principal)
    (target-contract principal)
    (target-function (string-ascii 64))
    (payload (buff 1024)))
  (begin
    ;; 1. Security Check: The relayer receiving the fee must be authorized by VelumX
    (asserts! (is-authorized-relayer relayer) ERR-NOT-AUTHORIZED)
    
    ;; 2. Token Check: Must be an approved gas asset
    (asserts! (is-token-approved (contract-of fee-token)) ERR-TOKEN-NOT-AUTHORIZED)
    
    ;; 3. Transfer Fee from User to Relayer (Developer Collects)
    ;; In Stacks sponsored tx, tx-sender is the user/origintor
    (try! (contract-call? fee-token transfer fee-amount tx-sender relayer none))
    
    ;; 4. Post-execution logging
    (print { 
      event: "universal-sponsored-tx", 
      target: target-contract, 
      function: target-function, 
      fee-token: (contract-of fee-token), 
      fee-paid: fee-amount,
      relayer: relayer
    })
    
    (ok true)
  )
)

;; ---------------------------------------------------------
;; Admin & Management
;; ---------------------------------------------------------

(define-public (set-relayer-status (relayer principal) (status bool))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR-NOT-AUTHORIZED)
    (map-set AuthorizedRelayers relayer status)
    (ok true)
  )
)

(define-public (set-token-approval (token principal) (status bool) (multiplier uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR-NOT-AUTHORIZED)
    (map-set ApprovedFeeTokens token { approved: status, min-fee-multiplier: multiplier })
    (ok true)
  )
)

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR-NOT-AUTHORIZED)
    (var-set admin new-admin)
    (ok true)
  )
)

(define-public (set-treasury (new-treasury principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR-NOT-AUTHORIZED)
    (var-set treasury new-treasury)
    (ok true)
  )
)
