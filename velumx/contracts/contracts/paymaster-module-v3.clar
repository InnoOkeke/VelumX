(use-trait sip-010-trait 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.sip-010-trait-ft-standard-v5.sip-010-trait)

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-ORACLE-STALE (err u101))
(define-constant ERR-FEE-EXCEEDS-MAX (err u102))
(define-constant ERR-TX-FAILED (err u103))

(define-data-var admin principal tx-sender)
(define-data-var stx-usdcx-price uint u2000000) 
(define-data-var last-oracle-update uint u0)
(define-data-var fee-bps uint u800) 
(define-data-var treasury principal tx-sender)
(define-constant BPS-DIVISOR u10000)

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
    (asserts! (<= new-bps u5000) ERR-NOT-AUTHORIZED)
    (var-set fee-bps new-bps)
    (ok true)
  )
)

(define-read-only (calculate-fee (gas-used-ustx uint))
  (let (
    (stx-price (var-get stx-usdcx-price))
    (markup-bps (var-get fee-bps))
    (base-cost-usdcx (/ (* gas-used-ustx stx-price) u1000000))
    (total-fee-usdcx (+ base-cost-usdcx (/ (* base-cost-usdcx markup-bps) BPS-DIVISOR)))
  )
    (ok total-fee-usdcx)
  )
)

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
    (asserts! (<= computed-fee max-fee-usdcx) ERR-FEE-EXCEEDS-MAX)
    ;; In v3, we are explicitly settling with the official USDCx if that's what's passed
    (try! (contract-call? token-trait transfer base-cost-usdcx tx-sender relayer none))
    (if (> treasury-fee u0)
        (try! (contract-call? token-trait transfer treasury-fee tx-sender (var-get treasury) none))
        false
    )
    (ok true)
  )
)
