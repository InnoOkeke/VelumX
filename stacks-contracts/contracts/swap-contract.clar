;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Stacks Swap Contract - V2 with Native STX Support
;; Constant Product Market Maker (x * y = k)
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Import SIP-010 trait
(use-trait sip-010-trait 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.sip-010-trait-ft-standard-v3.sip-010-trait)

;; Constants
(define-constant stx-principal 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM) ;; Sentinel for STX

;; Error codes
(define-constant err-owner-only (err u100))
(define-constant err-not-authorized (err u101))
(define-constant err-contract-paused (err u102))
(define-constant err-invalid-token (err u103))
(define-constant err-identical-tokens (err u104))
(define-constant err-zero-amount (err u105))
(define-constant err-insufficient-liquidity (err u106))
(define-constant err-insufficient-input-amount (err u107))
(define-constant err-insufficient-output-amount (err u108))
(define-constant err-slippage-exceeded (err u109))
(define-constant err-pool-not-found (err u110))
(define-constant err-pool-already-exists (err u111))
(define-constant err-insufficient-lp-balance (err u112))
(define-constant err-transfer-failed (err u113))
(define-constant err-overflow (err u115))

;; Fee configuration (0.3% = 3/1000)
(define-constant fee-numerator u3)
(define-constant fee-denominator u1000)
(define-constant fee-multiplier u997)

;; Data variables
(define-data-var contract-owner principal tx-sender)
(define-data-var is-paused bool false)

;; Pool reserves map
(define-map pools
  {token-a: principal, token-b: principal}
  {reserve-a: uint, reserve-b: uint, total-supply: uint}
)

;; LP token balances map
(define-map lp-balances
  {pool-id: {token-a: principal, token-b: principal}, owner: principal}
  uint
)

;; --- Private helper functions ---

(define-private (sort-tokens (token-a principal) (token-b principal))
  (if (< (unwrap-panic (to-consensus-buff? token-a)) (unwrap-panic (to-consensus-buff? token-b)))
    {token-a: token-a, token-b: token-b}
    {token-a: token-b, token-b: token-a}
  )
)

(define-private (is-owner) (is-eq tx-sender (var-get contract-owner)))
(define-private (assert-owner) (ok (asserts! (is-owner) err-owner-only)))
(define-private (assert-not-paused) (ok (asserts! (not (var-get is-paused)) err-contract-paused)))

(define-private (get-amount-out (amount-in uint) (reserve-in uint) (reserve-out uint))
  (if (or (is-eq amount-in u0) (is-eq reserve-in u0) (is-eq reserve-out u0))
    err-insufficient-liquidity
    (let (
      (amount-in-with-fee (* amount-in fee-multiplier))
      (numerator (* amount-in-with-fee reserve-out))
      (denominator (+ (* reserve-in fee-denominator) amount-in-with-fee))
    )
      (ok (/ numerator denominator))
    )
  )
)

(define-private (sqrt (n uint))
  (if (<= n u1) n
    (let ((root (/ n u2)))
      (if (is-eq root u0) u1 root)))) ;; Simple approx for testnet

;; --- Read-only functions ---

(define-read-only (get-pool-reserves (token-a principal) (token-b principal))
  (let ((sorted (sort-tokens token-a token-b)))
    (ok (unwrap! (map-get? pools sorted) err-pool-not-found))))

(define-read-only (get-lp-balance (token-a principal) (token-b principal) (owner principal))
  (let ((sorted (sort-tokens token-a token-b)))
    (ok (default-to u0 (map-get? lp-balances {pool-id: sorted, owner: owner})))))

(define-read-only (quote-swap (token-in principal) (token-out principal) (amount-in uint))
  (let (
    (sorted (sort-tokens token-in token-out))
    (pool (unwrap! (map-get? pools sorted) err-pool-not-found))
    (is-token-a-in (is-eq token-in (get token-a sorted)))
    (reserve-in (if is-token-a-in (get reserve-a pool) (get reserve-b pool)))
    (reserve-out (if is-token-a-in (get reserve-b pool) (get reserve-a pool)))
    (amount-out (try! (get-amount-out amount-in reserve-in reserve-out)))
  )
    (ok {amount-out: amount-out, fee: (/ (* amount-in fee-numerator) fee-denominator)})))

;; --- Public functions - Token/Token Swap ---

(define-public (swap (token-in <sip-010-trait>) (token-out <sip-010-trait>) (amount-in uint) (min-amount-out uint))
  (let (
    (ti (contract-of token-in))
    (to (contract-of token-out))
    (sorted (sort-tokens ti to))
    (pool (unwrap! (map-get? pools sorted) err-pool-not-found))
    (is-ti-a (is-eq ti (get token-a sorted)))
    (ra (get reserve-a pool))
    (rb (get reserve-b pool))
    (ri (if is-ti-a ra rb))
    (ro (if is-ti-a rb ra))
    (ao (try! (get-amount-out amount-in ri ro)))
    (user tx-sender)
  )
    (asserts! (>= ao min-amount-out) err-slippage-exceeded)
    (try! (contract-call? token-in transfer amount-in tx-sender (as-contract tx-sender) none))
    (map-set pools sorted (if is-ti-a 
      {reserve-a: (+ ra amount-in), reserve-b: (- rb ao), total-supply: (get total-supply pool)}
      {reserve-a: (- ra ao), reserve-b: (+ rb amount-in), total-supply: (get total-supply pool)}))
    (try! (as-contract (contract-call? token-out transfer ao tx-sender user none)))
    (ok ao)))

;; --- Public functions - STX Swaps ---

(define-public (swap-stx-to-token (token-out <sip-010-trait>) (amount-in uint) (min-amount-out uint))
  (let (
    (ti stx-principal)
    (to (contract-of token-out))
    (sorted (sort-tokens ti to))
    (pool (unwrap! (map-get? pools sorted) err-pool-not-found))
    (is-ti-a (is-eq ti (get token-a sorted)))
    (ra (get reserve-a pool))
    (rb (get reserve-b pool))
    (ri (if is-ti-a ra rb))
    (ro (if is-ti-a rb ra))
    (ao (try! (get-amount-out amount-in ri ro)))
    (user tx-sender)
  )
    (asserts! (>= ao min-amount-out) err-slippage-exceeded)
    (try! (stx-transfer? amount-in tx-sender (as-contract tx-sender)))
    (map-set pools sorted (if is-ti-a 
      {reserve-a: (+ ra amount-in), reserve-b: (- rb ao), total-supply: (get total-supply pool)}
      {reserve-a: (- ra ao), reserve-b: (+ rb amount-in), total-supply: (get total-supply pool)}))
    (try! (as-contract (contract-call? token-out transfer ao tx-sender user none)))
    (ok ao)))

(define-public (swap-token-to-stx (token-in <sip-010-trait>) (amount-in uint) (min-amount-out uint))
  (let (
    (ti (contract-of token-in))
    (to stx-principal)
    (sorted (sort-tokens ti to))
    (pool (unwrap! (map-get? pools sorted) err-pool-not-found))
    (is-ti-a (is-eq ti (get token-a sorted)))
    (ra (get reserve-a pool))
    (rb (get reserve-b pool))
    (ri (if is-ti-a ra rb))
    (ro (if is-ti-a rb ra))
    (ao (try! (get-amount-out amount-in ri ro)))
    (user tx-sender)
  )
    (asserts! (>= ao min-amount-out) err-slippage-exceeded)
    (try! (contract-call? token-in transfer amount-in tx-sender (as-contract tx-sender) none))
    (map-set pools sorted (if is-ti-a 
      {reserve-a: (+ ra amount-in), reserve-b: (- rb ao), total-supply: (get total-supply pool)}
      {reserve-a: (- ra ao), reserve-b: (+ rb amount-in), total-supply: (get total-supply pool)}))
    (try! (as-contract (stx-transfer? ao tx-sender user)))
    (ok ao)))

;; --- Liquidity functions - STX ---

(define-public (add-liquidity-stx (token <sip-010-trait>) (stx-amount uint) (token-amount uint) (stx-min uint) (token-min uint))
  (let (
    (ta stx-principal)
    (tb (contract-of token))
    (sorted (sort-tokens ta tb))
    (is-ta-first (is-eq ta (get token-a sorted)))
    (pool-opt (map-get? pools sorted))
  )
    (match pool-opt
      pool (err u999) ;; Simplified
      (let ((liq (sqrt (* stx-amount token-amount))))
        (try! (stx-transfer? stx-amount tx-sender (as-contract tx-sender)))
        (try! (contract-call? token transfer token-amount tx-sender (as-contract tx-sender) none))
        (map-set pools sorted {
          reserve-a: (if is-ta-first stx-amount token-amount),
          reserve-b: (if is-ta-first token-amount stx-amount),
          total-supply: liq})
        (map-set lp-balances {pool-id: sorted, owner: tx-sender} liq)
        (ok liq)))))

;; --- Liquidity functions - Token/Token ---

(define-public (add-liquidity (token-a <sip-010-trait>) (token-b <sip-010-trait>) (amount-a uint) (amount-b uint) (amount-a-min uint) (amount-b-min uint))
  (let (
    (ta (contract-of token-a))
    (tb (contract-of token-b))
    (sorted (sort-tokens ta tb))
    (is-ta-first (is-eq ta (get token-a sorted)))
    (pool-opt (map-get? pools sorted))
  )
    (match pool-opt
      pool (err u999) ;; Simplified
      (let ((liq (sqrt (* amount-a amount-b))))
        (try! (contract-call? token-a transfer amount-a tx-sender (as-contract tx-sender) none))
        (try! (contract-call? token-b transfer amount-b tx-sender (as-contract tx-sender) none))
        (map-set pools sorted {
          reserve-a: (if is-ta-first amount-a amount-b),
          reserve-b: (if is-ta-first amount-b amount-a),
          total-supply: liq})
        (map-set lp-balances {pool-id: sorted, owner: tx-sender} liq)
        (ok liq)))))

(define-public (remove-liquidity (token-a <sip-010-trait>) (token-b <sip-010-trait>) (liquidity uint) (amount-a-min uint) (amount-b-min uint))
  (let (
    (ta (contract-of token-a))
    (tb (contract-of token-b))
    (sorted (sort-tokens ta tb))
    (pool (unwrap! (map-get? pools sorted) err-pool-not-found))
    (is-ta-first (is-eq ta (get token-a sorted)))
    (ra (get reserve-a pool))
    (rb (get reserve-b pool))
    (ts (get total-supply pool))
    (aa (/ (* liquidity ra) ts))
    (ab (/ (* liquidity rb) ts))
    (user tx-sender)
  )
    (asserts! (>= (if is-ta-first aa ab) amount-a-min) err-slippage-exceeded)
    (asserts! (>= (if is-ta-first ab aa) amount-b-min) err-slippage-exceeded)
    (map-set pools sorted {
      reserve-a: (- ra aa),
      reserve-b: (- rb ab),
      total-supply: (- ts liquidity)})
    (try! (as-contract (contract-call? token-a transfer (if is-ta-first aa ab) tx-sender user none)))
    (try! (as-contract (contract-call? token-b transfer (if is-ta-first ab aa) tx-sender user none)))
    (ok {amount-a: aa, amount-b: ab})))

(define-public (remove-liquidity-stx (token <sip-010-trait>) (liquidity uint) (amount-stx-min uint) (amount-token-min uint))
  (let (
    (ta stx-principal)
    (tb (contract-of token))
    (sorted (sort-tokens ta tb))
    (pool (unwrap! (map-get? pools sorted) err-pool-not-found))
    (is-ta-first (is-eq ta (get token-a sorted)))
    (ra (get reserve-a pool))
    (rb (get reserve-b pool))
    (ts (get total-supply pool))
    (aa (/ (* liquidity ra) ts))
    (ab (/ (* liquidity rb) ts))
    (user tx-sender)
  )
    (asserts! (>= (if is-ta-first aa ab) amount-stx-min) err-slippage-exceeded)
    (asserts! (>= (if is-ta-first ab aa) amount-token-min) err-slippage-exceeded)
    (map-set pools sorted {
      reserve-a: (- ra aa),
      reserve-b: (- rb ab),
      total-supply: (- ts liquidity)})
    (try! (as-contract (stx-transfer? (if is-ta-first aa ab) tx-sender user)))
    (try! (as-contract (contract-call? token transfer (if is-ta-first ab aa) tx-sender user none)))
    (ok {stx: aa, token: ab})))
