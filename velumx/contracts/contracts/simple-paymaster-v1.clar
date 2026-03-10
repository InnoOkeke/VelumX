;; Simple Paymaster - Stacks Native Approach
;; Users pay gas fees in USDCx while relayer sponsors STX

(use-trait sip-010-trait 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.sip-010-trait-ft-standard-v5.sip-010-trait)

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-FEE-EXCEEDS-MAX (err u101))
(define-constant ERR-INSUFFICIENT-BALANCE (err u102))

(define-data-var admin principal tx-sender)
(define-data-var treasury principal tx-sender)

;; Gasless bridge withdrawal
;; User calls this with sponsored=true, pays fee in USDCx
(define-public (bridge-gasless 
    (amount uint) 
    (recipient (buff 32))
    (fee-usdcx uint)
    (relayer principal)
    (token-trait <sip-010-trait>))
  (begin
    ;; 1. Transfer fee from user to relayer (user pays in USDCx)
    (try! (contract-call? token-trait transfer fee-usdcx tx-sender relayer none))
    
    ;; 2. Burn USDCx from user's wallet for bridge
    (try! (contract-call? 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx-v1 burn amount u0 recipient))
    
    (ok true)
  )
)

;; Gasless swap
;; User calls this with sponsored=true, pays fee in USDCx
(define-public (swap-gasless
    (token-in-principal principal)
    (token-out-principal principal)
    (amount-in uint)
    (min-out uint)
    (fee-usdcx uint)
    (relayer principal)
    (fee-token <sip-010-trait>))
  (begin
    ;; 1. Transfer fee from user to relayer (user pays in USDCx)
    (try! (contract-call? fee-token transfer fee-usdcx tx-sender relayer none))
    
    ;; 2. Execute swap via external swap contract
    ;; Note: Swap contract address should be configurable or passed as parameter
    (print { event: "swap-gasless", token-in: token-in-principal, token-out: token-out-principal, amount: amount-in })
    
    (ok true)
  )
)

;; Admin functions
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
