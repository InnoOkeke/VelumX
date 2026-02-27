;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SGAL Paymaster Module v1
;; Converts STX gas paid by relayer into USDCx settlement
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(use-trait sip-010-trait 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sip-010-trait-ft-standard.sip-010-trait)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Constants & Errors
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-ORACLE-STALE (err u101))
(define-constant ERR-FEE-EXCEEDS-MAX (err u102))
(define-constant ERR-TX-FAILED (err u103))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Data Storage
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; The admin of the paymaster (can update oracle)
(define-data-var admin principal tx-sender)

;; STX to USDCx Price Oracle
;; Price is represented as USDCx per 1 STX (micro units)
;; E.g. $2.00 STX = 2,000,000 (USDCx has 6 decimals)
(define-data-var stx-usdcx-price uint u2000000) 
(define-data-var last-oracle-update uint u0)

;; Markup Fee in BPS (Basis Points, 10000 = 100%)
;; Default 800 BPS = 8%
(define-data-var fee-bps uint u800) 
(define-data-var treasury principal tx-sender)

;; SGAL Protocol configuration
(define-constant BPS-DIVISOR u10000)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Admin Functions
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-public (update-oracle (new-price uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR-NOT-AUTHORIZED)
    (var-set stx-usdcx-price new-price)
    (var-set last-oracle-update burn-block-height)
    (ok true)
  )
)

(define-public (set-fee-bps (new-bps uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR-NOT-AUTHORIZED)
    ;; Cap max fee at 50%
    (asserts! (<= new-bps u5000) ERR-NOT-AUTHORIZED)
    (var-set fee-bps new-bps)
    (ok true)
  )
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Public Functions
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Calculate the required USDCx fee given a gas-amount
(define-read-only (calculate-fee (gas-used-ustx uint))
  (let (
    (stx-price (var-get stx-usdcx-price))
    (markup-bps (var-get fee-bps))
    
    ;; 1 STX = 1,000,000 uSTX
    ;; Cost in USDCx = (gas / 1,000,000) * stx-price
    (base-cost-usdcx (/ (* gas-used-ustx stx-price) u1000000))
    
    ;; Add Markup
    ;; Total = base + (base * markup / 10000)
    (total-fee-usdcx (+ base-cost-usdcx (/ (* base-cost-usdcx markup-bps) BPS-DIVISOR)))
  )
    (ok total-fee-usdcx)
  )
)

;; Settle Fee (Called by the user's Smart Wallet)
;; Validates the cost and transfers USDCx to the relayer and treasury
(define-public (settle-fee 
    (token-trait <sip-010-trait>)
    (gas-used-ustx uint) 
    (max-fee-usdcx uint)
    (relayer principal))
  (let (
    (computed-fee (unwrap! (calculate-fee gas-used-ustx) ERR-TX-FAILED))
    (base-cost-usdcx (/ (* gas-used-ustx (var-get stx-usdcx-price)) u1000000))
    (treasury-fee (- computed-fee base-cost-usdcx))
  )
    ;; 1. Check max fee cap
    (asserts! (<= computed-fee max-fee-usdcx) ERR-FEE-EXCEEDS-MAX)
    
    ;; 2. The caller (Smart Wallet) pays...
    ;; Send base cost back to Relayer
    (try! (contract-call? token-trait transfer base-cost-usdcx tx-sender relayer none))
    
    ;; Send markup (if any) to Treasury
    (if (> treasury-fee u0)
        (try! (contract-call? token-trait transfer treasury-fee tx-sender (var-get treasury) none))
        false
    )
    
    (print { event: "fee-settled", wallet: tx-sender, relayer: relayer, amount: computed-fee })
    (ok true)
  )
)