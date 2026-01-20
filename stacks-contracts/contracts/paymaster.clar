;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; BitPaymaster v3 - Production Bridge Support
;; Gasless UX + Official USDC Bridge Integration
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(use-trait sip-010 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sip-010-trait-ft-standard.sip-010-trait)

(define-constant ERR-NOT-SPONSORED (err u200))
(define-constant ERR-WRONG-SPONSOR (err u201))

;; The backend relayer address that pays the STX fees
(define-data-var relayer principal 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P)

;; Official USDCx token contract on Testnet
(define-constant USDCX_TOKEN 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx)
;; Official USDCx protocol contract on Testnet
(define-constant USDCX_PROTOCOL 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx-v1)

;; 1. Standard Fee Settlement
(define-public (pay-fee-in-usdc (usdc <sip-010>) (amount uint))
  (let ((sponsor (unwrap! tx-sponsor? ERR-NOT-SPONSORED)))
    (asserts! (is-eq sponsor (var-get relayer)) ERR-WRONG-SPONSOR)
    (contract-call? usdc transfer amount tx-sender sponsor none)
  )
)

;; 2. Bridge Withdraw (Gasless)
;; Pays fee in USDCx, then calls official Bridge Burn
(define-public (withdraw-gasless (amount uint) (fee uint) (recipient (buff 32)))
  (let ((sponsor (unwrap! tx-sponsor? ERR-NOT-SPONSORED)))
    (asserts! (is-eq sponsor (var-get relayer)) ERR-WRONG-SPONSOR)
    
    ;; 1. Pay the fee to the relayer in USDCx
    (try! (contract-call? USDCX_TOKEN transfer fee tx-sender sponsor none))
    
    ;; 2. Call Official Bridge Burn (native-domain = 0 for Ethereum)
    (contract-call? USDCX_PROTOCOL burn amount u0 recipient)
  )
)

;; 3. Gasless Token Swap
;; Pays fee in USDCx, then executes swap on ALEX DEX
;; Note: This is a simplified version for testnet demo
;; In production, integrate with actual ALEX swap contracts
(define-public (swap-gasless 
    (token-in <sip-010>) 
    (token-out <sip-010>) 
    (amount-in uint) 
    (min-amount-out uint)
    (fee uint))
  (let ((sponsor (unwrap! tx-sponsor? ERR-NOT-SPONSORED)))
    (asserts! (is-eq sponsor (var-get relayer)) ERR-WRONG-SPONSOR)
    
    ;; 1. Pay the fee to the relayer in USDCx
    (try! (contract-call? USDCX_TOKEN transfer fee tx-sender sponsor none))
    
    ;; 2. Execute swap (simplified for demo)
    ;; In production, this would call ALEX swap router
    ;; For now, just transfer tokens as placeholder
    (contract-call? token-in transfer amount-in tx-sender (as-contract tx-sender) none)
  )
)
