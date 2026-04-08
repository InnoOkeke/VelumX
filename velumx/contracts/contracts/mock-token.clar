;; Mock SIP-010 token for testing universal-paymaster-v1
(define-fungible-token mock-token)

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-INSUFFICIENT-BALANCE (err u102))

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (ft-transfer? mock-token amount sender recipient)
  )
)

(define-public (mint (amount uint) (recipient principal))
  (ft-mint? mock-token amount recipient)
)

(define-read-only (get-balance (account principal))
  (ok (ft-get-balance mock-token account))
)

(define-read-only (get-name) (ok "Mock Token"))
(define-read-only (get-symbol) (ok "MOCK"))
(define-read-only (get-decimals) (ok u6))
(define-read-only (get-total-supply) (ok (ft-get-supply mock-token)))
(define-read-only (get-token-uri) (ok none))
