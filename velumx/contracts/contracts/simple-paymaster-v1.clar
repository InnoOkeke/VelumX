;; Simple Paymaster - Stacks Native Approach
;; Users pay gas fees in USDCx while relayer sponsors STX

(use-trait sip-010-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)
(use-trait executor-trait 'SPKYNF473GQ1V0WWCF24TV7ZR1WYAKTC7AM8QGBW.executor-trait-v1.executor-trait)

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
    (try! (contract-call? 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx-v1 burn amount u0 recipient))
    
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

;; Gasless Transfer
;; Allows user to transfer any SIP-010 token without STX
(define-public (transfer-gasless
    (amount uint)
    (sender principal)
    (recipient principal)
    (fee-usdcx uint)
    (relayer principal)
    (fee-token <sip-010-trait>)
    (target-token <sip-010-trait>))
  (begin
    ;; 1. Transfer fee from user to relayer (if any)
    (if (> fee-usdcx u0)
        (try! (contract-call? fee-token transfer fee-usdcx tx-sender relayer none))
        true
    )
    
    ;; 2. Execute the token transfer
    (try! (contract-call? target-token transfer amount sender recipient none))
    
    (ok true)
  )
)

;; Universal Execute
;; Allows any generic action through the executor trait
(define-public (execute-gasless
    (target <executor-trait>)
    (action-id (buff 32))
    (param uint)
    (fee-usdcx uint)
    (relayer principal)
    (fee-token <sip-010-trait>))
  (begin
    ;; 1. Admin/Relayer only for security (user signs intent, relayer executes)
    ;; In this version, we trust the tx-sender (relayer) to have verified user signature
    (asserts! (is-eq tx-sender (var-get admin)) ERR-NOT-AUTHORIZED)
    
    ;; 2. Transfer fee from user to relayer (if any)
    ;; Note: 'user' here is implicit from the payload logic, for now assume fee is paid by tx-sender
    ;; or we'd need the 'user' principal as an argument.
    (if (> fee-usdcx u0)
        (try! (contract-call? fee-token transfer fee-usdcx tx-sender relayer none))
        true
    )
    
    ;; 3. Dispatch to target contract
    (try! (contract-call? target execute (var-get admin) action-id param))
    
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