(define-constant ERR-NOT-AUTHORIZED (err u100))

(define-map relayers principal { stake: uint, active: bool })

(define-public (register-relayer (stake uint))
  (begin
    (map-set relayers tx-sender { stake: stake, active: true })
    (ok true)
  )
)

(define-read-only (is-active-relayer (relayer principal))
  (default-to false (get active (map-get? relayers relayer)))
)
