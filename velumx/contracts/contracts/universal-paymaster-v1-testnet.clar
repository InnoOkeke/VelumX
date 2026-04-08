;; Universal Paymaster v2 - VelumX Protocol (Testnet)
;; Identical to mainnet version except for the SIP-010 trait address.
;;
;; Testnet SIP-010 trait
(use-trait sip-010-trait 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sip-010-trait-ft-standard.sip-010-trait)

;; -------------------------------------------------------
;; Constants
;; -------------------------------------------------------
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-TOKEN-NOT-APPROVED (err u101))
(define-constant ERR-FEE-TOO-HIGH (err u102))
(define-constant ERR-ZERO-FEE (err u103))
(define-constant ERR-SELF-TRANSFER (err u104))

(define-constant TX-TYPE-SWAP u1)
(define-constant TX-TYPE-TRANSFER u2)
(define-constant TX-TYPE-BRIDGE u3)
(define-constant TX-TYPE-STAKE u4)
(define-constant TX-TYPE-LP u5)
(define-constant TX-TYPE-OTHER u99)

;; -------------------------------------------------------
;; State
;; -------------------------------------------------------
(define-data-var admin principal tx-sender)
(define-data-var treasury principal tx-sender)
(define-data-var max-fee-cap uint u10000000000)

(define-map ApprovedFeeTokens principal { approved: bool, max-fee: uint })
(define-map AuthorizedRelayers principal bool)
(define-map UserNonces principal uint)

;; -------------------------------------------------------
;; Read-only helpers
;; -------------------------------------------------------
(define-read-only (is-token-approved (token principal))
  (default-to false (get approved (map-get? ApprovedFeeTokens token)))
)

(define-read-only (is-authorized-relayer (relayer principal))
  (default-to false (map-get? AuthorizedRelayers relayer))
)

(define-read-only (get-user-nonce (user principal))
  (default-to u0 (map-get? UserNonces user))
)

(define-read-only (get-token-max-fee (token principal))
  (default-to u0 (get max-fee (map-get? ApprovedFeeTokens token)))
)

;; -------------------------------------------------------
;; Core: collect-fee
;; -------------------------------------------------------
(define-public (collect-fee
    (fee-token <sip-010-trait>)
    (fee-amount uint)
    (relayer principal)
    (tx-type uint)
    (ref-id (buff 32)))
  (let (
    (user tx-sender)
    (token-principal (contract-of fee-token))
    (token-max-fee (get-token-max-fee token-principal))
  )
    (asserts! (is-authorized-relayer relayer) ERR-NOT-AUTHORIZED)
    (asserts! (is-token-approved token-principal) ERR-TOKEN-NOT-APPROVED)
    (asserts! (> fee-amount u0) ERR-ZERO-FEE)
    (asserts! (<= fee-amount token-max-fee) ERR-FEE-TOO-HIGH)
    (asserts! (not (is-eq user relayer)) ERR-SELF-TRANSFER)

    (try! (contract-call? fee-token transfer fee-amount user relayer none))

    (map-set UserNonces user (+ (get-user-nonce user) u1))

    (print {
      event: "fee-collected",
      version: "v2",
      tx-type: tx-type,
      user: user,
      relayer: relayer,
      fee-token: token-principal,
      fee-amount: fee-amount,
      ref-id: ref-id,
      nonce: (get-user-nonce user)
    })

    (ok true)
  )
)

;; Legacy compatibility
(define-public (call-gasless
    (fee-token <sip-010-trait>)
    (fee-amount uint)
    (relayer principal)
    (target-contract principal)
    (target-function (string-ascii 64))
    (payload (buff 1024)))
  (begin
    (try! (collect-fee fee-token fee-amount relayer TX-TYPE-OTHER 0x))
    (print {
      event: "call-gasless-legacy",
      target: target-contract,
      function: target-function
    })
    (ok true)
  )
)

;; -------------------------------------------------------
;; Admin
;; -------------------------------------------------------
(define-public (set-relayer-status (relayer principal) (status bool))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR-NOT-AUTHORIZED)
    (map-set AuthorizedRelayers relayer status)
    (ok true)
  )
)

(define-public (set-token-approval (token principal) (status bool) (max-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR-NOT-AUTHORIZED)
    (map-set ApprovedFeeTokens token { approved: status, max-fee: max-fee })
    (ok true)
  )
)

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR-NOT-AUTHORIZED)
    (var-set admin new-admin)
    (ok true)
  )
)

(define-public (set-treasury (new-treasury principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR-NOT-AUTHORIZED)
    (var-set treasury new-treasury)
    (ok true)
  )
)

(define-public (set-max-fee-cap (cap uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR-NOT-AUTHORIZED)
    (var-set max-fee-cap cap)
    (ok true)
  )
)
