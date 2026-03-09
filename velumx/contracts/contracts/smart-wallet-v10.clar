(use-trait sip-010-trait 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.sip-010-trait-ft-standard-v5.sip-010-trait)

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-INVALID-SIGNATURE (err u101))
(define-constant ERR-INVALID-NONCE (err u102))
(define-constant ERR-DECODE-FAILED (err u103))
(define-constant ERR-TX-FAILED (err u104))

(define-data-var wallet-owner principal tx-sender)
(define-data-var nonce uint u0)

;; SIP-018 Structured Data Domain
(define-constant DOMAIN-HASH (sha256 (unwrap-panic (to-consensus-buff? {
  name: "SGAL-Smart-Wallet",
  version: "1.0.0",
  chain-id: u2147483648
}))))

;; SIP-018 verification helper
(define-private (verify-sip018-intent (message-hash (buff 32)) (signature (buff 65)))
    (let (
        ;; Structured Data Hash = sha256(0x05 | domain-hash | message-hash)
        (structured-data-hash (sha256 (concat 0x05 (concat DOMAIN-HASH message-hash))))
        (pubkey (unwrap! (secp256k1-recover? structured-data-hash signature) false))
    )
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
    (message-hash (sha256 (unwrap-panic (to-consensus-buff? {
        target: target,
        payload: payload,
        max-fee-usdcx: max-fee,
        nonce: nonce-input
    }))))
  )
    (asserts! (is-eq nonce-input current-nonce) ERR-INVALID-NONCE)
    (asserts! (verify-sip018-intent message-hash signature) ERR-INVALID-SIGNATURE)
    
    ;; 1. Settle fee FIRST (entry point logic)
    (try! (contract-call? .paymaster-module-v10 settle-fee token-trait u5000 max-fee tx-sender))
    
    ;; 2. Execution Dispatcher
    ;; ALL branches MUST return same type (response bool uint) or just (ok bool)
    (try! 
      (if (is-eq target .paymaster-module-v10)
          ;; Branch A: Bridge (Response: (response bool uint))
          (let ((args (unwrap! (from-consensus-buff? { amount: uint, fee: uint, recipient: (buff 32) } payload) ERR-DECODE-FAILED)))
              (as-contract (contract-call? .paymaster-module-v10 withdraw-gasless (get amount args) (get recipient args)))
          )
          ;; Branch B: Fallback (Must also return (response bool uint))
          (begin
             (print { event: "v7-generic-execution", target: target, payload: payload })
             (ok true)
          )
      )
    )

    (var-set nonce (+ current-nonce u1))
    (ok true)
  )
)

(define-read-only (get-nonce) (ok (var-get nonce)))
(define-read-only (get-owner) (ok (var-get wallet-owner)))
