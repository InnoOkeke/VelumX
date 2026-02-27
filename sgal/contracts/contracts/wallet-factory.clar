;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SGAL Wallet Factory v1
;; Deploys deterministic Smart Wallet instances per user
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-constant ERR-UNAUTHORIZED (err u100))
(define-constant ERR-WALLET-EXISTS (err u101))

;; Map of EOA Owner -> Smart Wallet Principal
(define-map user-wallets principal principal)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Public Functions
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Deploy a new smart wallet for the caller
;; Note: In Clarity, dynamic contract deployment is not natively supported 
;; in the same way as EVM CREATE2. 
;; For SGAL v1, the "Factory" acts as a registry for wallets deployed 
;; via standard transaction, or we simulate deployment by initializing 
;; predefined contract instances if using a proxy pattern.
;; 
;; Since pure dynamic deployment isn't possible, we register the wallet here.
;; Off-chain, the SGAL SDK deploys a cloned smart-wallet contract and 
;; registers it here in the same batch.
(define-public (register-wallet (wallet principal))
  (let ((caller tx-sender))
    ;; Check if caller already has a wallet registered
    (asserts! (is-none (map-get? user-wallets caller)) ERR-WALLET-EXISTS)
    
    ;; Register the wallet
    (map-set user-wallets caller wallet)
    
    ;; Emit event
    (print { event: "wallet-registered", owner: caller, wallet: wallet })
    (ok true)
  )
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Read-Only Functions
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Get the wallet address for an owner
(define-read-only (get-wallet (owner principal))
  (map-get? user-wallets owner)
)