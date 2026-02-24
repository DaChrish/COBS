# Brunswikian 2.0 – Ablauf

**Prioritäten (alle Drafts):**  
1. Max DESIRED, wenn irgendmöglich niemand AVOID  
2. Tie-Breaker: unter gleichen (DESIRED, AVOID) die global unbeliebtesten Cubes verwenden  

---

```mermaid
flowchart TB
    START([runBrunswickian2]) --> FILTER[Spieler filtern, Pod-Größen berechnen]
    FILTER --> SAME{Alle gleichen\nMatchpunkte?<br/>z.B. Draft 1}
    
    SAME -->|Ja| NO_STRENGTH[Draft 1: Keine Stärke]
    SAME -->|Nein| STRENGTH[Ab Draft 2: Mit Stärke]
    
    subgraph DRAFT1[" Draft 1 (assignCubesAndPlayersV2NoStrength) "]
        NO_STRENGTH --> LOOP1[Für jeden Pod p = 1..K]
        LOOP1 --> CUBE1[Verfügbare Cubes nach Unbeliebtheit sortieren<br/>viele AVOID, wenig DESIRED = unbeliebt]
        CUBE1 --> PICK1[Unbeliebtesten Cube wählen, der im verbleibenden Pool<br/>noch ≥ podSize Nicht-AVOID-Spieler hat]
        PICK1 --> FALLBACK1{Für diesen Cube<br/>≥ 8 Nicht-AVOID?}
        FALLBACK1 -->|Ja| ZERO[0 AVOID möglich für diesen Pod]
        FALLBACK1 -->|Nein| LEAST[Unbeliebtesten nehmen, beste 8 wählen]
        ZERO --> PLAYERS1[Aus Pool die besten 8 für diesen Cube wählen<br/>DESIRED → NEUTRAL → AVOID]
        LEAST --> PLAYERS1
        PLAYERS1 --> REMOVE1[8 Spieler + Cube aus Pool entfernen]
        REMOVE1 --> LOOP1
    end
    
    subgraph DRAFT2[" Ab Draft 2 (Stärke-Blöcke) "]
        STRENGTH --> PHASE1[Phase 1: assignCubesToPodsV2Strength]
        PHASE1 --> CUBES2[6 unbeliebteste Cubes den 6 Pods zuordnen<br/>Pod 1 = unbeliebtester Cube, …]
        CUBES2 --> PHASE2[Phase 2: assignPlayersToPodsV2]
        PHASE2 --> BLOCKS[Spieler nach Punkten sortieren, in K Blöcke à podSize aufteilen]
        BLOCKS --> PAIRS[Für jedes Pod–Block-Paar: AVOID-Anzahl + Nutzen berechnen]
        PAIRS --> FILL[Pods der Reihe nach bedienen Pod 0 = unbeliebtester Cube]
        FILL --> BEST[Pro Pod den Block mit wenigsten AVOID wählen<br/>unter noch freien Blöcken, dann max Nutzen]
        BEST --> ASSIGN[Block dem Pod zuweisen, Block als verbraucht markieren]
    end
    
    DRAFT1 --> RESULT[Pods bauen: podNumber, podSize, cubeId, playerIds]
    DRAFT2 --> RESULT
    RESULT --> END([BrunswickianResult])
```

---

## Kurzfassung

| Schritt | Draft 1 (alle gleichen Punkte) | Ab Draft 2 (Stärke) |
|--------|---------------------------------|----------------------|
| **Cube–Pod** | Pro Pod: unbeliebtester Cube, der noch ≥8 Nicht-AVOID im Pool hat | 6 unbeliebteste Cubes → Pod 1..K |
| **Spieler–Pod** | Pro Pod: beste 8 (DESIRED, NEUTRAL, AVOID) für diesen Cube aus Pool | Stärke-Blöcke → Pods; min AVOID, max DESIRED; unbeliebte Cubes zuerst bedient |
| **Tie-Breaker** | Unbeliebteste Cubes zuerst wählen, solange 0 AVOID möglich | Unbeliebteste Cubes für Pods; pro Pod Block mit wenigsten AVOID |
