;; VelumX Sweep-to-STX Contract (velumx-sweep)
;; Atomically swaps 1-6 tokens to STX in a single transaction.
;; Each token is independently swapped to STX (not chained).
;; User signs once, receives total STX minus 0.1% protocol fee.
;;
;; dex = u0 -> ALEX  SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.amm-pool-v2-01
;; dex = u1 -> Velar SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-router

(use-trait ft-trait 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.trait-sip-010.sip-010-trait)
(use-trait share-fee-to-trait 'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-share-fee-to-trait.share-fee-to-trait)

(define-constant ALEX-AMM  'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.amm-pool-v2-01)
(define-constant VELAR-RTR 'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-router)
(define-constant FEE-NUM   u1)
(define-constant FEE-DEN   u1000)

(define-constant ERR-NOT-OWNER (err u100))
(define-constant ERR-PAUSED    (err u101))
(define-constant ERR-ZERO      (err u102))
(define-constant ERR-SLIPPAGE  (err u103))

(define-data-var owner         principal tx-sender)
(define-data-var fee-recipient principal tx-sender)
(define-data-var paused        bool      false)
(define-data-var fees-total    uint      u0)

;; --- Admin ---

(define-public (set-owner (p principal))
  (begin (asserts! (is-eq tx-sender (var-get owner)) ERR-NOT-OWNER)
         (var-set owner p) (ok true)))

(define-public (set-fee-recipient (p principal))
  (begin (asserts! (is-eq tx-sender (var-get owner)) ERR-NOT-OWNER)
         (var-set fee-recipient p) (ok true)))

(define-public (set-paused (v bool))
  (begin (asserts! (is-eq tx-sender (var-get owner)) ERR-NOT-OWNER)
         (var-set paused v) (ok true)))

(define-read-only (get-stats)
  (ok { owner: (var-get owner), fee-recipient: (var-get fee-recipient),
        paused: (var-get paused), fees-total: (var-get fees-total) }))

;; --- Internals ---

(define-private (calc-fee (dx uint)) (/ (* dx FEE-NUM) FEE-DEN))
(define-private (check-active) (ok (asserts! (not (var-get paused)) ERR-PAUSED)))

;; Swap token -> STX via ALEX, returns STX amount
(define-private (alex-to-stx (ti <ft-trait>) (factor uint) (dx uint))
  (as-contract (contract-call? ALEX-AMM swap-helper ti 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-wstx factor dx (some u0))))

;; Swap token -> STX via Velar, returns STX amount
(define-private (velar-to-stx
    (pool-id uint) (t0 <ft-trait>) (t1 <ft-trait>)
    (ti <ft-trait>) (fee-to <share-fee-to-trait>) (dx uint))
  (let ((result (try! (as-contract
    (contract-call? VELAR-RTR swap-exact-tokens-for-tokens
      pool-id t0 t1 ti 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-wstx fee-to dx u0)))))
    (ok (get amt-out result))))

;; Pull one token from user, swap to STX, return raw STX out
(define-private (do-swap
    (user principal)
    (token <ft-trait>)
    (amount uint)
    (dex uint)
    (factor uint)
    (pool-id uint)
    (t0 <ft-trait>)
    (t1 <ft-trait>)
    (fee-to <share-fee-to-trait>))
  (begin
    (asserts! (> amount u0) ERR-ZERO)
    (try! (contract-call? token transfer amount user (as-contract tx-sender) none))
    (if (is-eq dex u0)
      (alex-to-stx token factor amount)
      (velar-to-stx pool-id t0 t1 token fee-to amount))))

;; --- Sweep functions ---

;; 1 token -> STX
(define-public (sweep-to-stx-1
  (token-a <ft-trait>)
  (dex-a uint) (factor-a uint) (pool-id-a uint) (t0-a <ft-trait>) (t1-a <ft-trait>) (fee-to-a <share-fee-to-trait>)
  (amount-a uint)
  (min-stx-out uint))
  (let ((user tx-sender))
    (try! (check-active))
    (let ((stx-a (try! (do-swap user token-a amount-a dex-a factor-a pool-id-a t0-a t1-a fee-to-a))))
      (let ((total stx-a))
        (let ((fee (calc-fee total)))
          (let ((net (- total fee)))
            (asserts! (>= net min-stx-out) ERR-SLIPPAGE)
            (var-set fees-total (+ (var-get fees-total) fee))
            (try! (as-contract (stx-transfer? fee tx-sender (var-get fee-recipient))))
            (try! (as-contract (stx-transfer? net tx-sender user)))
            (ok net)))))))

;; 2 tokens -> STX
(define-public (sweep-to-stx-2
  (token-a <ft-trait>)
  (dex-a uint) (factor-a uint) (pool-id-a uint) (t0-a <ft-trait>) (t1-a <ft-trait>) (fee-to-a <share-fee-to-trait>)
  (amount-a uint)
  (token-b <ft-trait>)
  (dex-b uint) (factor-b uint) (pool-id-b uint) (t0-b <ft-trait>) (t1-b <ft-trait>) (fee-to-b <share-fee-to-trait>)
  (amount-b uint)
  (min-stx-out uint))
  (let ((user tx-sender))
    (try! (check-active))
    (let ((stx-a (try! (do-swap user token-a amount-a dex-a factor-a pool-id-a t0-a t1-a fee-to-a)))
          (stx-b (try! (do-swap user token-b amount-b dex-b factor-b pool-id-b t0-b t1-b fee-to-b))))
      (let ((total (+ stx-a stx-b)))
        (let ((fee (calc-fee total)))
          (let ((net (- total fee)))
            (asserts! (>= net min-stx-out) ERR-SLIPPAGE)
            (var-set fees-total (+ (var-get fees-total) fee))
            (try! (as-contract (stx-transfer? fee tx-sender (var-get fee-recipient))))
            (try! (as-contract (stx-transfer? net tx-sender user)))
            (ok net)))))))

;; 3 tokens -> STX
(define-public (sweep-to-stx-3
  (token-a <ft-trait>)
  (dex-a uint) (factor-a uint) (pool-id-a uint) (t0-a <ft-trait>) (t1-a <ft-trait>) (fee-to-a <share-fee-to-trait>)
  (amount-a uint)
  (token-b <ft-trait>)
  (dex-b uint) (factor-b uint) (pool-id-b uint) (t0-b <ft-trait>) (t1-b <ft-trait>) (fee-to-b <share-fee-to-trait>)
  (amount-b uint)
  (token-c <ft-trait>)
  (dex-c uint) (factor-c uint) (pool-id-c uint) (t0-c <ft-trait>) (t1-c <ft-trait>) (fee-to-c <share-fee-to-trait>)
  (amount-c uint)
  (min-stx-out uint))
  (let ((user tx-sender))
    (try! (check-active))
    (let ((stx-a (try! (do-swap user token-a amount-a dex-a factor-a pool-id-a t0-a t1-a fee-to-a)))
          (stx-b (try! (do-swap user token-b amount-b dex-b factor-b pool-id-b t0-b t1-b fee-to-b)))
          (stx-c (try! (do-swap user token-c amount-c dex-c factor-c pool-id-c t0-c t1-c fee-to-c))))
      (let ((total (+ stx-a stx-b stx-c)))
        (let ((fee (calc-fee total)))
          (let ((net (- total fee)))
            (asserts! (>= net min-stx-out) ERR-SLIPPAGE)
            (var-set fees-total (+ (var-get fees-total) fee))
            (try! (as-contract (stx-transfer? fee tx-sender (var-get fee-recipient))))
            (try! (as-contract (stx-transfer? net tx-sender user)))
            (ok net)))))))

;; 4 tokens -> STX
(define-public (sweep-to-stx-4
  (token-a <ft-trait>)
  (dex-a uint) (factor-a uint) (pool-id-a uint) (t0-a <ft-trait>) (t1-a <ft-trait>) (fee-to-a <share-fee-to-trait>)
  (amount-a uint)
  (token-b <ft-trait>)
  (dex-b uint) (factor-b uint) (pool-id-b uint) (t0-b <ft-trait>) (t1-b <ft-trait>) (fee-to-b <share-fee-to-trait>)
  (amount-b uint)
  (token-c <ft-trait>)
  (dex-c uint) (factor-c uint) (pool-id-c uint) (t0-c <ft-trait>) (t1-c <ft-trait>) (fee-to-c <share-fee-to-trait>)
  (amount-c uint)
  (token-d <ft-trait>)
  (dex-d uint) (factor-d uint) (pool-id-d uint) (t0-d <ft-trait>) (t1-d <ft-trait>) (fee-to-d <share-fee-to-trait>)
  (amount-d uint)
  (min-stx-out uint))
  (let ((user tx-sender))
    (try! (check-active))
    (let ((stx-a (try! (do-swap user token-a amount-a dex-a factor-a pool-id-a t0-a t1-a fee-to-a)))
          (stx-b (try! (do-swap user token-b amount-b dex-b factor-b pool-id-b t0-b t1-b fee-to-b)))
          (stx-c (try! (do-swap user token-c amount-c dex-c factor-c pool-id-c t0-c t1-c fee-to-c)))
          (stx-d (try! (do-swap user token-d amount-d dex-d factor-d pool-id-d t0-d t1-d fee-to-d))))
      (let ((total (+ stx-a stx-b stx-c stx-d)))
        (let ((fee (calc-fee total)))
          (let ((net (- total fee)))
            (asserts! (>= net min-stx-out) ERR-SLIPPAGE)
            (var-set fees-total (+ (var-get fees-total) fee))
            (try! (as-contract (stx-transfer? fee tx-sender (var-get fee-recipient))))
            (try! (as-contract (stx-transfer? net tx-sender user)))
            (ok net)))))))

;; 5 tokens -> STX
(define-public (sweep-to-stx-5
  (token-a <ft-trait>)
  (dex-a uint) (factor-a uint) (pool-id-a uint) (t0-a <ft-trait>) (t1-a <ft-trait>) (fee-to-a <share-fee-to-trait>)
  (amount-a uint)
  (token-b <ft-trait>)
  (dex-b uint) (factor-b uint) (pool-id-b uint) (t0-b <ft-trait>) (t1-b <ft-trait>) (fee-to-b <share-fee-to-trait>)
  (amount-b uint)
  (token-c <ft-trait>)
  (dex-c uint) (factor-c uint) (pool-id-c uint) (t0-c <ft-trait>) (t1-c <ft-trait>) (fee-to-c <share-fee-to-trait>)
  (amount-c uint)
  (token-d <ft-trait>)
  (dex-d uint) (factor-d uint) (pool-id-d uint) (t0-d <ft-trait>) (t1-d <ft-trait>) (fee-to-d <share-fee-to-trait>)
  (amount-d uint)
  (token-e <ft-trait>)
  (dex-e uint) (factor-e uint) (pool-id-e uint) (t0-e <ft-trait>) (t1-e <ft-trait>) (fee-to-e <share-fee-to-trait>)
  (amount-e uint)
  (min-stx-out uint))
  (let ((user tx-sender))
    (try! (check-active))
    (let ((stx-a (try! (do-swap user token-a amount-a dex-a factor-a pool-id-a t0-a t1-a fee-to-a)))
          (stx-b (try! (do-swap user token-b amount-b dex-b factor-b pool-id-b t0-b t1-b fee-to-b)))
          (stx-c (try! (do-swap user token-c amount-c dex-c factor-c pool-id-c t0-c t1-c fee-to-c)))
          (stx-d (try! (do-swap user token-d amount-d dex-d factor-d pool-id-d t0-d t1-d fee-to-d)))
          (stx-e (try! (do-swap user token-e amount-e dex-e factor-e pool-id-e t0-e t1-e fee-to-e))))
      (let ((total (+ stx-a stx-b stx-c stx-d stx-e)))
        (let ((fee (calc-fee total)))
          (let ((net (- total fee)))
            (asserts! (>= net min-stx-out) ERR-SLIPPAGE)
            (var-set fees-total (+ (var-get fees-total) fee))
            (try! (as-contract (stx-transfer? fee tx-sender (var-get fee-recipient))))
            (try! (as-contract (stx-transfer? net tx-sender user)))
            (ok net)))))))

;; 6 tokens -> STX
(define-public (sweep-to-stx-6
  (token-a <ft-trait>)
  (dex-a uint) (factor-a uint) (pool-id-a uint) (t0-a <ft-trait>) (t1-a <ft-trait>) (fee-to-a <share-fee-to-trait>)
  (amount-a uint)
  (token-b <ft-trait>)
  (dex-b uint) (factor-b uint) (pool-id-b uint) (t0-b <ft-trait>) (t1-b <ft-trait>) (fee-to-b <share-fee-to-trait>)
  (amount-b uint)
  (token-c <ft-trait>)
  (dex-c uint) (factor-c uint) (pool-id-c uint) (t0-c <ft-trait>) (t1-c <ft-trait>) (fee-to-c <share-fee-to-trait>)
  (amount-c uint)
  (token-d <ft-trait>)
  (dex-d uint) (factor-d uint) (pool-id-d uint) (t0-d <ft-trait>) (t1-d <ft-trait>) (fee-to-d <share-fee-to-trait>)
  (amount-d uint)
  (token-e <ft-trait>)
  (dex-e uint) (factor-e uint) (pool-id-e uint) (t0-e <ft-trait>) (t1-e <ft-trait>) (fee-to-e <share-fee-to-trait>)
  (amount-e uint)
  (token-f <ft-trait>)
  (dex-f uint) (factor-f uint) (pool-id-f uint) (t0-f <ft-trait>) (t1-f <ft-trait>) (fee-to-f <share-fee-to-trait>)
  (amount-f uint)
  (min-stx-out uint))
  (let ((user tx-sender))
    (try! (check-active))
    (let ((stx-a (try! (do-swap user token-a amount-a dex-a factor-a pool-id-a t0-a t1-a fee-to-a)))
          (stx-b (try! (do-swap user token-b amount-b dex-b factor-b pool-id-b t0-b t1-b fee-to-b)))
          (stx-c (try! (do-swap user token-c amount-c dex-c factor-c pool-id-c t0-c t1-c fee-to-c)))
          (stx-d (try! (do-swap user token-d amount-d dex-d factor-d pool-id-d t0-d t1-d fee-to-d)))
          (stx-e (try! (do-swap user token-e amount-e dex-e factor-e pool-id-e t0-e t1-e fee-to-e)))
          (stx-f (try! (do-swap user token-f amount-f dex-f factor-f pool-id-f t0-f t1-f fee-to-f))))
      (let ((total (+ stx-a stx-b stx-c stx-d stx-e stx-f)))
        (let ((fee (calc-fee total)))
          (let ((net (- total fee)))
            (asserts! (>= net min-stx-out) ERR-SLIPPAGE)
            (var-set fees-total (+ (var-get fees-total) fee))
            (try! (as-contract (stx-transfer? fee tx-sender (var-get fee-recipient))))
            (try! (as-contract (stx-transfer? net tx-sender user)))
            (ok net)))))))
