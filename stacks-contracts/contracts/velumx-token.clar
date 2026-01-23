;; VelumX Token (VEX)
;; This contract implements the SIP-010 community-standard Fungible Token trait.
(impl-trait 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.sip-010-trait-ft-standard-v3.sip-010-trait)

;; Define the FT, with no maximum supply
(define-fungible-token velumx-token)

;; Define errors
(define-constant ERR_OWNER_ONLY (err u100))
(define-constant ERR_NOT_TOKEN_OWNER (err u101))

;; Define constants for contract
(define-constant CONTRACT_OWNER tx-sender)
(define-constant TOKEN_NAME "VelumX")
(define-constant TOKEN_SYMBOL "VEX")
(define-constant TOKEN_DECIMALS u6) ;; 6 units displayed past decimal, e.g. 1.000_000 = 1 token

(define-data-var token-uri (string-ascii 256) "https://velumx.vercel.app/metadata.json")

;; SIP-010 function: Get the token balance of a specified principal
(define-read-only (get-balance (who principal))
  (ok (ft-get-balance velumx-token who))
)

;; SIP-010 function: Returns the total supply of fungible token
(define-read-only (get-total-supply)
  (ok (ft-get-supply velumx-token))
)

;; SIP-010 function: Returns the human-readable token name
(define-read-only (get-name)
  (ok TOKEN_NAME)
)

;; SIP-010 function: Returns the symbol or "ticker" for this token
(define-read-only (get-symbol)
  (ok TOKEN_SYMBOL)
)

;; SIP-010 function: Returns number of decimals to display
(define-read-only (get-decimals)
  (ok TOKEN_DECIMALS)
)

;; SIP-010 function: Returns the URI containing token metadata
(define-read-only (get-token-uri)
  (ok (some (var-get token-uri)))
)

;; Properly updates token URI by emitting a SIP-019 token metadata update notification
(define-public (set-token-uri (value (string-ascii 256)))
    (begin
        (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_OWNER_ONLY)
        (var-set token-uri value)
        (ok (print {
              notification: "token-metadata-update",
              payload: {
                contract-id: current-contract,
                token-class: "ft"
              }
            })
        )
    )
)

;; Mint new tokens and send them to a recipient.
;; Only the contract deployer can perform this operation.
(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_OWNER_ONLY)
    (ft-mint? velumx-token amount recipient)
  )
)

;; SIP-010 function: Transfers tokens to a recipient
(define-public (transfer
  (amount uint)
  (sender principal)
  (recipient principal)
  (memo (optional (buff 34)))
)
  (begin
    (asserts! (or (is-eq tx-sender sender) (is-eq contract-caller sender)) ERR_NOT_TOKEN_OWNER)
    (try! (ft-transfer? velumx-token amount sender recipient))
    (match memo to-print (print to-print) 0x)
    (ok true)
  )
)

;; Initialize initial supply: 100,000 VEX (100,000,000,000 micro-VEX)
(begin
  (ft-mint? velumx-token u100000000000 CONTRACT_OWNER)
)
