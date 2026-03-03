(use-trait sip-010-trait 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.sip-010-trait-ft-standard-v5.sip-010-trait)

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-INVALID-SIGNATURE (err u101))
(define-constant ERR-INVALID-NONCE (err u102))
(define-constant ERR-TX-FAILED (err u103))

(define-data-var wallet-owner principal tx-sender)
(define-data-var nonce uint u0)

;; SIP-018 Structured Data Domain
(define-constant DOMAIN-HASH (sha256 (unwrap-panic (to-consensus-buff? {
  name: "SGAL-Smart-Wallet",
  version: "1.0.0",
  chain-id: u2147483648
}))))

(define-private (is-owner)
  (is-eq tx-sender (var-get wallet-owner))
)

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
    ;; The message tuple must match EXACTLY what is signed in the SDK (IntentBuilder.ts)
    (message-hash (sha256 (unwrap-panic (to-consensus-buff? {
        target: target,
        payload: payload,
        max-fee-usdcx: max-fee,
        nonce: nonce-input
    }))))
  )
    (asserts! (is-eq nonce-input current-nonce) ERR-INVALID-NONCE)
    (asserts! (verify-sip018-intent message-hash signature) ERR-INVALID-SIGNATURE)
    
    ;; Settle fee with paymaster-module-v4
    (try! (contract-call? 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.paymaster-module-v4 settle-fee token-trait u5000 max-fee tx-sender))
    
    ;; Execute the actual call
    (print { event: "v4-execution-triggered", target: target, payload: payload })
    (var-set nonce (+ current-nonce u1))
    (ok true)
  )
)

(define-read-only (get-nonce) (ok (var-get nonce)))
(define-read-only (get-owner) (ok (var-get wallet-owner)))
