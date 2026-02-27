;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; SGAL Relayer Registry v1 (Phase 2)
;; Decentralizes gas providers through staking and reputation
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-ALREADY-REGISTERED (err u101))
(define-constant ERR-NOT-REGISTERED (err u102))
(define-constant ERR-INSUFFICIENT-STAKE (err u103))

;; Governance Principal (Can slash/update reputation)
(define-data-var governance principal tx-sender)

;; Minimum stake to become a relayer (e.g. 100 STX = 100,000,000 uSTX)
(define-constant MIN-STAKE u100000000)

;; Store relayer details
;; stake: amount of STX locked (micro-STX)
;; reputation: a score from 0-100 (starts at 50)
;; active: boolean flag for system participation
(define-map relayers principal 
  { 
    stake: uint, 
    reputation: uint, 
    active: bool 
  }
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Relayer Functions
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Register as a new relayer by locking STX
(define-public (register-relayer (stake-amount uint))
  (let ((caller tx-sender))
    (asserts! (>= stake-amount MIN-STAKE) ERR-INSUFFICIENT-STAKE)
    (asserts! (is-none (map-get? relayers caller)) ERR-ALREADY-REGISTERED)

    ;; Lock the STX in the contract
    (try! (stx-transfer? stake-amount caller (as-contract tx-sender)))

    (map-set relayers caller {
      stake: stake-amount,
      reputation: u50,
      active: true
    })
    
    (print { event: "relayer-registered", relayer: caller, stake: stake-amount })
    (ok true)
  )
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Governance Functions
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Slash a relayer for malicious behavior (e.g. failing to submit accepted intents)
(define-public (slash-relayer (relayer principal) (amount uint))
  (let (
    (relayer-data (unwrap! (map-get? relayers relayer) ERR-NOT-REGISTERED))
    (current-stake (get stake relayer-data))
    (slash-amount (if (> amount current-stake) current-stake amount))
  )
    (asserts! (is-eq tx-sender (var-get governance)) ERR-NOT-AUTHORIZED)
    
    ;; Send slashed funds to governance (or burn address)
    (try! (as-contract (stx-transfer? slash-amount tx-sender (var-get governance))))
    
    (map-set relayers relayer (merge relayer-data { 
      stake: (- current-stake slash-amount),
      active: (>= (- current-stake slash-amount) MIN-STAKE) ;; Deactivate if below minimum
    }))
    
    (print { event: "relayer-slashed", relayer: relayer, amount: slash-amount })
    (ok true)
  )
)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Read-Only Functions
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define-read-only (get-relayer (relayer principal))
  (map-get? relayers relayer)
)