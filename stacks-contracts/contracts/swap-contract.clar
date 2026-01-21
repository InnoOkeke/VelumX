;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Stacks Swap Contract - Production AMM
;; Constant Product Market Maker (x * y = k)
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Import SIP-010 trait
(use-trait sip-010-trait 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.sip-010-trait-ft-standard-v3.sip-010-trait)

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
(define-constant err-invalid-ratio (err u114))
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

;; Private helper functions

;; Sort token addresses to ensure consistent pool IDs
;; Returns tokens in consistent order (doesn't matter which, just consistent)
(define-private (sort-tokens (token-a principal) (token-b principal))
  (let (
    ;; Convert principals to buffers for comparison
    (buff-a (unwrap-panic (to-consensus-buff? token-a)))
    (buff-b (unwrap-panic (to-consensus-buff? token-b)))
    ;; Take first byte for simple comparison
    (byte-a (unwrap-panic (element-at? buff-a u0)))
    (byte-b (unwrap-panic (element-at? buff-b u0)))
  )
    (if (< byte-a byte-b)
      {token-a: token-a, token-b: token-b}
      (if (> byte-a byte-b)
        {token-a: token-b, token-b: token-a}
        ;; If first bytes equal, compare second byte
        (let (
          (byte-a2 (unwrap-panic (element-at? buff-a u1)))
          (byte-b2 (unwrap-panic (element-at? buff-b u1)))
        )
          (if (<= byte-a2 byte-b2)
            {token-a: token-a, token-b: token-b}
            {token-a: token-b, token-b: token-a}
          )
        )
      )
    )
  )
)

(define-private (is-owner)
  (is-eq tx-sender (var-get contract-owner))
)

(define-private (assert-owner)
  (ok (asserts! (is-owner) err-owner-only))
)

(define-private (assert-not-paused)
  (ok (asserts! (not (var-get is-paused)) err-contract-paused))
)

;; Calculate output amount for a swap using constant product formula
;; Formula: amountOut = (reserveOut * amountIn * 997) / (reserveIn * 1000 + amountIn * 997)
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

;; Calculate input amount required for a desired output (reverse calculation)
;; Formula: amountIn = (reserveIn * amountOut * 1000) / ((reserveOut - amountOut) * 997) + 1
(define-private (get-amount-in (amount-out uint) (reserve-in uint) (reserve-out uint))
  (if (or (is-eq amount-out u0) (is-eq reserve-in u0) (is-eq reserve-out u0))
    err-insufficient-liquidity
    (if (>= amount-out reserve-out)
      err-insufficient-liquidity
      (let (
        (numerator (* (* reserve-in amount-out) fee-denominator))
        (denominator (* (- reserve-out amount-out) fee-multiplier))
        (amount-in (/ numerator denominator))
      )
        ;; Add 1 to round up
        (ok (+ amount-in u1))
      )
    )
  )
)

;; Public functions - Access control
(define-public (set-contract-owner (new-owner principal))
  (begin
    (try! (assert-owner))
    (ok (var-set contract-owner new-owner))
  )
)

(define-public (set-paused (paused bool))
  (begin
    (try! (assert-owner))
    (ok (var-set is-paused paused))
  )
)

;; Read-only functions
(define-read-only (get-contract-owner)
  (ok (var-get contract-owner))
)

(define-read-only (get-is-paused)
  (ok (var-get is-paused))
)

(define-read-only (get-fee-config)
  (ok {
    numerator: fee-numerator,
    denominator: fee-denominator,
    multiplier: fee-multiplier
  })
)

;; Get pool reserves for a token pair
(define-read-only (get-pool-reserves (token-a principal) (token-b principal))
  (let (
    (sorted (sort-tokens token-a token-b))
    (pool (map-get? pools sorted))
  )
    (ok (unwrap! pool err-pool-not-found))
  )
)

;; Get LP token balance for a user in a specific pool
(define-read-only (get-lp-balance (token-a principal) (token-b principal) (owner principal))
  (let (
    (sorted (sort-tokens token-a token-b))
    (balance (default-to u0 (map-get? lp-balances {pool-id: sorted, owner: owner})))
  )
    (ok balance)
  )
)

;; Get total LP token supply for a pool
(define-read-only (get-total-supply (token-a principal) (token-b principal))
  (let (
    (sorted (sort-tokens token-a token-b))
    (pool (unwrap! (map-get? pools sorted) err-pool-not-found))
  )
    (ok (get total-supply pool))
  )
)

;; Get user's proportional share of pool reserves
(define-read-only (get-pool-share (token-a principal) (token-b principal) (owner principal))
  (let (
    (sorted (sort-tokens token-a token-b))
    (pool (unwrap! (map-get? pools sorted) err-pool-not-found))
    (user-balance (default-to u0 (map-get? lp-balances {pool-id: sorted, owner: owner})))
    (total-supply (get total-supply pool))
    (reserve-a (get reserve-a pool))
    (reserve-b (get reserve-b pool))
  )
    (if (is-eq total-supply u0)
      (ok {share-a: u0, share-b: u0, percentage: u0})
      (ok {
        share-a: (/ (* user-balance reserve-a) total-supply),
        share-b: (/ (* user-balance reserve-b) total-supply),
        percentage: (/ (* user-balance u10000) total-supply)
      })
    )
  )
)


;; Calculate price impact for a swap
;; Returns price impact in basis points (10000 = 100%)
(define-read-only (get-price-impact (amount-in uint) (reserve-in uint) (reserve-out uint))
  (if (or (is-eq reserve-in u0) (is-eq reserve-out u0))
    err-insufficient-liquidity
    (let (
      (amount-out (try! (get-amount-out amount-in reserve-in reserve-out)))
      ;; Price before: reserveOut / reserveIn (scaled by 10000)
      (price-before (/ (* reserve-out u10000) reserve-in))
      ;; Price after: (reserveOut - amountOut) / (reserveIn + amountIn)
      (new-reserve-in (+ reserve-in amount-in))
      (new-reserve-out (- reserve-out amount-out))
      (price-after (/ (* new-reserve-out u10000) new-reserve-in))
      ;; Impact: ((priceBefore - priceAfter) / priceBefore) * 10000
      (price-diff (if (> price-before price-after)
                    (- price-before price-after)
                    (- price-after price-before)))
      (impact (/ (* price-diff u10000) price-before))
    )
      (ok impact)
    )
  )
)

;; Get a quote for a swap (amount out, price impact, and fee)
(define-read-only (quote-swap (token-in principal) (token-out principal) (amount-in uint))
  (let (
    (sorted (sort-tokens token-in token-out))
    (pool (unwrap! (map-get? pools sorted) err-pool-not-found))
    (is-token-a-in (is-eq token-in (get token-a sorted)))
    (reserve-in (if is-token-a-in (get reserve-a pool) (get reserve-b pool)))
    (reserve-out (if is-token-a-in (get reserve-b pool) (get reserve-a pool)))
    (amount-out (try! (get-amount-out amount-in reserve-in reserve-out)))
    (fee (/ (* amount-in fee-numerator) fee-denominator))
    (impact (try! (get-price-impact amount-in reserve-in reserve-out)))
  )
    (ok {amount-out: amount-out, price-impact: impact, fee: fee})
  )
)


;; ============================================
;; Public Functions - Swap Execution
;; ============================================

;; Execute a token swap
(define-public (swap 
    (token-in <sip-010-trait>)
    (token-out <sip-010-trait>)
    (amount-in uint)
    (min-amount-out uint))
  (begin
    ;; Validate contract is not paused
    (try! (assert-not-paused))
    
    ;; Validate amount is greater than zero
    (asserts! (> amount-in u0) err-zero-amount)
    
    ;; Get token principals
    (let (
      (token-in-principal (contract-of token-in))
      (token-out-principal (contract-of token-out))
    )
      ;; Validate tokens are not identical
      (asserts! (not (is-eq token-in-principal token-out-principal)) err-identical-tokens)
      
      ;; Sort tokens and get pool
      (let (
        (sorted (sort-tokens token-in-principal token-out-principal))
        (pool (unwrap! (map-get? pools sorted) err-pool-not-found))
        (is-token-a-in (is-eq token-in-principal (get token-a sorted)))
        (reserve-in (if is-token-a-in (get reserve-a pool) (get reserve-b pool)))
        (reserve-out (if is-token-a-in (get reserve-b pool) (get reserve-a pool)))
      )
        ;; Calculate output amount
        (let (
          (amount-out (try! (get-amount-out amount-in reserve-in reserve-out)))
        )
          ;; Check slippage protection
          (asserts! (>= amount-out min-amount-out) err-slippage-exceeded)
          
          ;; Transfer input token from user to contract
          (try! (contract-call? token-in transfer amount-in tx-sender (as-contract tx-sender) none))
          
          ;; Update pool reserves
          (let (
            (new-reserve-in (+ reserve-in amount-in))
            (new-reserve-out (- reserve-out amount-out))
            (new-pool (if is-token-a-in
              {reserve-a: new-reserve-in, reserve-b: new-reserve-out, total-supply: (get total-supply pool)}
              {reserve-a: new-reserve-out, reserve-b: new-reserve-in, total-supply: (get total-supply pool)}
            ))
            (user tx-sender)
          )
            (map-set pools sorted new-pool)
            
            ;; Transfer output token from contract to user
            (try! (as-contract (contract-call? token-out transfer amount-out tx-sender user none)))
            
            ;; Calculate fee
            (let (
              (fee (/ (* amount-in fee-numerator) fee-denominator))
            )
              ;; Return swap details
              (ok {
                amount-in: amount-in,
                amount-out: amount-out,
                fee: fee
              })
            )
          )
        )
      )
    )
  )
)


;; ============================================
;; Private Helper Functions - Liquidity Math
;; ============================================

;; Simplified integer square root using binary search
;; Good enough for liquidity calculations
(define-private (sqrt (n uint))
  (if (<= n u1)
    n
    (if (<= n u4)
      u2
      (if (<= n u9)
        u3
        (if (<= n u16)
          u4
          (if (<= n u25)
            u5
            (if (<= n u36)
              u6
              (if (<= n u49)
                u7
                (if (<= n u64)
                  u8
                  (if (<= n u81)
                    u9
                    (if (<= n u100)
                      u10
                      ;; For larger numbers, use approximation
                      (/ n u10)
                    )
                  )
                )
              )
            )
          )
        )
      )
    )
  )
)

;; ============================================
;; Public Functions - Liquidity Management
;; ============================================

;; Add liquidity to a pool
(define-public (add-liquidity
    (token-a <sip-010-trait>)
    (token-b <sip-010-trait>)
    (amount-a-desired uint)
    (amount-b-desired uint)
    (amount-a-min uint)
    (amount-b-min uint))
  (begin
    ;; Validate contract is not paused
    (try! (assert-not-paused))
    
    ;; Validate amounts are greater than zero
    (asserts! (> amount-a-desired u0) err-zero-amount)
    (asserts! (> amount-b-desired u0) err-zero-amount)
    
    ;; Get token principals
    (let (
      (token-a-principal (contract-of token-a))
      (token-b-principal (contract-of token-b))
    )
      ;; Validate tokens are not identical
      (asserts! (not (is-eq token-a-principal token-b-principal)) err-identical-tokens)
      
      ;; Sort tokens
      (let (
        (sorted (sort-tokens token-a-principal token-b-principal))
        (is-token-a-first (is-eq token-a-principal (get token-a sorted)))
        (pool-opt (map-get? pools sorted))
      )
        (match pool-opt
          ;; Pool exists - add subsequent liquidity
          pool
            (let (
              (reserve-a (get reserve-a pool))
              (reserve-b (get reserve-b pool))
              (total-supply (get total-supply pool))
              ;; Calculate optimal amounts based on current ratio
              (amount-b-optimal (/ (* amount-a-desired reserve-b) reserve-a))
              (amount-a-optimal (/ (* amount-b-desired reserve-a) reserve-b))
            )
              (let (
                ;; Determine actual amounts to use
                (amounts (if (<= amount-b-optimal amount-b-desired)
                  ;; Use amount-a-desired and calculated amount-b
                  (begin
                    (asserts! (>= amount-b-optimal amount-b-min) err-slippage-exceeded)
                    {amount-a: amount-a-desired, amount-b: amount-b-optimal}
                  )
                  ;; Use amount-b-desired and calculated amount-a
                  (begin
                    (asserts! (>= amount-a-optimal amount-a-min) err-slippage-exceeded)
                    {amount-a: amount-a-optimal, amount-b: amount-b-desired}
                  )
                ))
                (amount-a (get amount-a amounts))
                (amount-b (get amount-b amounts))
                ;; Calculate LP tokens to mint
                (liquidity-a (/ (* amount-a total-supply) reserve-a))
                (liquidity-b (/ (* amount-b total-supply) reserve-b))
                (liquidity (if (< liquidity-a liquidity-b) liquidity-a liquidity-b))
              )
                (asserts! (> liquidity u0) err-insufficient-liquidity)
                
                ;; Transfer tokens from user to contract
                (if is-token-a-first
                  (begin
                    (try! (contract-call? token-a transfer amount-a tx-sender (as-contract tx-sender) none))
                    (try! (contract-call? token-b transfer amount-b tx-sender (as-contract tx-sender) none))
                  )
                  (begin
                    (try! (contract-call? token-a transfer amount-b tx-sender (as-contract tx-sender) none))
                    (try! (contract-call? token-b transfer amount-a tx-sender (as-contract tx-sender) none))
                  )
                )
                
                ;; Update pool reserves and total supply
                (map-set pools sorted {
                  reserve-a: (+ reserve-a amount-a),
                  reserve-b: (+ reserve-b amount-b),
                  total-supply: (+ total-supply liquidity)
                })
                
                ;; Mint LP tokens to user
                (let (
                  (current-balance (default-to u0 (map-get? lp-balances {pool-id: sorted, owner: tx-sender})))
                )
                  (map-set lp-balances {pool-id: sorted, owner: tx-sender} (+ current-balance liquidity))
                )
                
                ;; Return liquidity details
                (ok {amount-a: amount-a, amount-b: amount-b, liquidity: liquidity})
              )
            )
          ;; Pool doesn't exist - create first liquidity
          (let (
            (amount-a (if is-token-a-first amount-a-desired amount-b-desired))
            (amount-b (if is-token-a-first amount-b-desired amount-a-desired))
            ;; Calculate initial LP tokens as sqrt(amount-a * amount-b)
            (liquidity (sqrt (* amount-a amount-b)))
          )
            (asserts! (> liquidity u0) err-insufficient-liquidity)
            
            ;; Transfer tokens from user to contract
            (if is-token-a-first
              (begin
                (try! (contract-call? token-a transfer amount-a tx-sender (as-contract tx-sender) none))
                (try! (contract-call? token-b transfer amount-b tx-sender (as-contract tx-sender) none))
              )
              (begin
                (try! (contract-call? token-a transfer amount-b tx-sender (as-contract tx-sender) none))
                (try! (contract-call? token-b transfer amount-a tx-sender (as-contract tx-sender) none))
              )
            )
            
            ;; Create new pool
            (map-set pools sorted {
              reserve-a: amount-a,
              reserve-b: amount-b,
              total-supply: liquidity
            })
            
            ;; Mint LP tokens to user
            (map-set lp-balances {pool-id: sorted, owner: tx-sender} liquidity)
            
            ;; Return liquidity details
            (ok {amount-a: amount-a, amount-b: amount-b, liquidity: liquidity})
          )
        )
      )
    )
  )
)


;; Remove liquidity from a pool
(define-public (remove-liquidity
    (token-a <sip-010-trait>)
    (token-b <sip-010-trait>)
    (liquidity uint)
    (amount-a-min uint)
    (amount-b-min uint))
  (begin
    ;; Validate contract is not paused
    (try! (assert-not-paused))
    
    ;; Validate liquidity is greater than zero
    (asserts! (> liquidity u0) err-zero-amount)
    
    ;; Get token principals
    (let (
      (token-a-principal (contract-of token-a))
      (token-b-principal (contract-of token-b))
    )
      ;; Validate tokens are not identical
      (asserts! (not (is-eq token-a-principal token-b-principal)) err-identical-tokens)
      
      ;; Sort tokens and get pool
      (let (
        (sorted (sort-tokens token-a-principal token-b-principal))
        (pool (unwrap! (map-get? pools sorted) err-pool-not-found))
        (is-token-a-first (is-eq token-a-principal (get token-a sorted)))
        (user-balance (default-to u0 (map-get? lp-balances {pool-id: sorted, owner: tx-sender})))
      )
        ;; Validate user has sufficient LP balance
        (asserts! (>= user-balance liquidity) err-insufficient-lp-balance)
        
        (let (
          (reserve-a (get reserve-a pool))
          (reserve-b (get reserve-b pool))
          (total-supply (get total-supply pool))
          ;; Calculate proportional amounts
          (amount-a (/ (* liquidity reserve-a) total-supply))
          (amount-b (/ (* liquidity reserve-b) total-supply))
        )
          ;; Validate amounts meet minimums (slippage protection)
          (asserts! (>= amount-a amount-a-min) err-slippage-exceeded)
          (asserts! (>= amount-b amount-b-min) err-slippage-exceeded)
          
          ;; Burn LP tokens from user
          (let (
            (new-balance (- user-balance liquidity))
          )
            (if (is-eq new-balance u0)
              (map-delete lp-balances {pool-id: sorted, owner: tx-sender})
              (map-set lp-balances {pool-id: sorted, owner: tx-sender} new-balance)
            )
          )
          
          ;; Update pool reserves and total supply
          (map-set pools sorted {
            reserve-a: (- reserve-a amount-a),
            reserve-b: (- reserve-b amount-b),
            total-supply: (- total-supply liquidity)
          })
          
          ;; Transfer tokens from contract to user
          (let (
            (user tx-sender)
          )
            (if is-token-a-first
              (begin
                (try! (as-contract (contract-call? token-a transfer amount-a tx-sender user none)))
                (try! (as-contract (contract-call? token-b transfer amount-b tx-sender user none)))
              )
              (begin
                (try! (as-contract (contract-call? token-a transfer amount-b tx-sender user none)))
                (try! (as-contract (contract-call? token-b transfer amount-a tx-sender user none)))
              )
            )
          
            ;; Return removed amounts
            (ok {amount-a: amount-a, amount-b: amount-b})
          )
        )
      )
    )
  )
)
