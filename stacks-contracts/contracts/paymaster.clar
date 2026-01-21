;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; BitPaymaster v3 - Production Bridge Support
;; Gasless UX + Official USDC Bridge Integration
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(use-trait sip-010 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sip-010-trait-ft-standard.sip-010-trait)

;; Import swap contract
(define-constant SWAP-CONTRACT 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.swap-contract-v12)

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
;; Pays fee in USDCx, then executes swap on our DEX
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
    
    ;; 2. Execute swap on our DEX contract
    ;; Note: User must have already approved token-in for the swap contract
    (contract-call? SWAP-CONTRACT swap token-in token-out amount-in min-amount-out)
  )
)

;; 4. Gasless Add Liquidity
;; Pays fee in USDCx, then adds liquidity to our DEX
(define-public (add-liquidity-gasless
    (token-a <sip-010>)
    (token-b <sip-010>)
    (amount-a-desired uint)
    (amount-b-desired uint)
    (amount-a-min uint)
    (amount-b-min uint)
    (fee uint))
  (let ((sponsor (unwrap! tx-sponsor? ERR-NOT-SPONSORED)))
    (asserts! (is-eq sponsor (var-get relayer)) ERR-WRONG-SPONSOR)
    
    ;; 1. Pay the fee to the relayer in USDCx
    (try! (contract-call? USDCX_TOKEN transfer fee tx-sender sponsor none))
    
    ;; 2. Add liquidity to our DEX contract
    (contract-call? SWAP-CONTRACT add-liquidity 
      token-a token-b 
      amount-a-desired amount-b-desired 
      amount-a-min amount-b-min)
  )
)

;; 5. Gasless Remove Liquidity
;; Pays fee in USDCx, then removes liquidity from our DEX
(define-public (remove-liquidity-gasless
    (token-a <sip-010>)
    (token-b <sip-010>)
    (liquidity uint)
    (amount-a-min uint)
    (amount-b-min uint)
    (fee uint))
  (let ((sponsor (unwrap! tx-sponsor? ERR-NOT-SPONSORED)))
    (asserts! (is-eq sponsor (var-get relayer)) ERR-WRONG-SPONSOR)
    
    ;; 1. Pay the fee to the relayer in USDCx
    (try! (contract-call? USDCX_TOKEN transfer fee tx-sender sponsor none))
    
    ;; 2. Remove liquidity from our DEX contract
    (contract-call? SWAP-CONTRACT remove-liquidity 
      token-a token-b 
      liquidity 
      amount-a-min amount-b-min)
  )
)
