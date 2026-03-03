(define-constant ERR-UNAUTHORIZED (err u100))
(define-constant ERR-WALLET-EXISTS (err u101))

(define-map user-wallets principal principal)

(define-public (register-wallet (wallet principal))
  (let ((caller tx-sender))
    (asserts! (is-none (map-get? user-wallets caller)) ERR-WALLET-EXISTS)
    (map-set user-wallets caller wallet)
    (print { event: "wallet-v3-registered", owner: caller, wallet: wallet })
    (ok true)
  )
)

(define-read-only (get-wallet (owner principal))
  (map-get? user-wallets owner)
)
