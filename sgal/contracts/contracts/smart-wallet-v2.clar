(use-trait sip-010-trait 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.sip-010-trait-ft-standard-v5.sip-010-trait)

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-INVALID-SIGNATURE (err u101))
(define-constant ERR-INVALID-NONCE (err u102))
(define-constant ERR-TX-FAILED (err u103))

(define-data-var wallet-owner principal tx-sender)
(define-data-var nonce uint u0)

(define-private (is-owner)
  (is-eq tx-sender (var-get wallet-owner))
)

(define-private (verify-intent (hash (buff 32)) (signature (buff 65)))
  (let ((pubkey (unwrap! (secp256k1-recover? hash signature) false)))
    (is-eq (principal-of? pubkey) (ok (var-get wallet-owner)))
  )
)

(define-public (execute-gasless
    (target principal)
    (payload (buff 1024))
    (max-fee uint)
    (nonce-input uint)
    (signature (buff 65))
    (token-trait <sip-010-trait>))
  (let (
    (current-nonce (var-get nonce))
    (intent-hash (sha256 (concat (concat (concat (unwrap-panic (to-consensus-buff? target)) payload) (unwrap-panic (to-consensus-buff? max-fee))) (unwrap-panic (to-consensus-buff? nonce-input)))))
  )
    (asserts! (is-eq nonce-input current-nonce) ERR-INVALID-NONCE)
    (asserts! (verify-intent intent-hash signature) ERR-INVALID-SIGNATURE)
    (try! (contract-call? 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.paymaster-module-v2 settle-fee token-trait u5000 max-fee tx-sender))
    (var-set nonce (+ current-nonce u1))
    (ok true)
  )
)

(define-read-only (get-nonce) (ok (var-get nonce)))
(define-read-only (get-owner) (ok (var-get wallet-owner)))
