# Wanderly Adaptive Assistance: Technical Architecture

This is the proposed pilot architecture, not a claim that every component is deployed.
The current POC runs journey tracking, context construction and execution policy in
the browser. The target adds server-authoritative policy/state and acknowledged
activation while retaining the existing rules, provider and Adobe integration boundaries.

```mermaid
flowchart TB
    subgraph browser["Customer browser / Next.js UI"]
        pages["Travel pages<br/>Destinations / Packages / Compare / Booking"]
        tracking["JourneyTracker + semantic events<br/>Session ID / consent-aware collection"]
        context["Journey context builder<br/>Observable activity and progression"]
        plugin["ConciergePlugin<br/>Debounce / reject stale decisions"]
        activation["NEW: activation state machine<br/>Request / open / submit / cancel / fail"]
        connector["Adobe connector + SDK adapter<br/>Bounded acknowledgement / deduplication"]
        chat["Brand Concierge UI<br/>Preserve existing conversation"]
        pages --> tracking --> context --> plugin
        plugin --> activation --> connector --> chat
        tracking -. "current POC only" .-> local["Browser event history<br/>localStorage: latest 300 events"]
    end

    subgraph backend["Next.js backend / Node-capable deployment"]
        api["POST /api/assistance/reason<br/>Schema validation / request limits"]
        orchestrator["NEW: decision orchestrator<br/>Session validation / eligibility / deadline"]
        rules["Deterministic rules baseline"]
        reasoner["AI reasoner<br/>Structured output validation"]
        providers["Provider adapters<br/>OpenAI / Bedrock Converse / approved HTTP"]
        policy["Execution policy<br/>Confidence / progression / dismissal<br/>Cooldown / handled types / session budget"]
        result["NEW: versioned activation authorization<br/>Decision ID / context version / expiry"]
        api --> orchestrator
        orchestrator -->|"rules mode"| rules
        orchestrator -->|"AI mode"| reasoner
        reasoner --> providers
        reasoner -. "recorded failure / fallback" .-> rules
        rules --> policy
        reasoner -->|"validated proposal"| policy
        policy -->|"allowed"| result
        policy -->|"blocked / SILENT / WAIT"| noaction["No customer interruption<br/>Record policy reason"]
    end

    subgraph external["External services"]
        llm["Approved LLM endpoint<br/>Proposal only; never direct execution"]
        adobe["Adobe Brand Concierge<br/>Conversation / configured knowledge"]
        providers -->|"minimized JourneyContext<br/>server-side credentials"| llm
        llm -->|"structured proposal"| providers
    end

    subgraph operations["NEW: pilot state and observability"]
        state["Durable session / policy state<br/>Budget / dismissals / idempotency"]
        outcomes["Outcome ingestion<br/>Requested / opened / submitted<br/>Failed / cancelled / dismissed / progressed"]
        reporting["Operational reporting<br/>Latency / fallback / cost / engagement"]
        evaluation["Evaluation and experiments<br/>Labelled holdouts / shadow mode / controlled trial"]
        outcomes --> state
        outcomes --> reporting
        outcomes --> evaluation
    end

    plugin -->|"HTTPS: canonical JourneyContext"| api
    result -->|"decision + authorization"| plugin
    policy <-->|"authoritative history / budget"| state
    connector -->|"approved contextual opening message<br/>not the full local handoff"| adobe
    adobe -->|"SDK lifecycle / conversation events"| connector
    activation -->|"correlated lifecycle events"| outcomes
    tracking -->|"consented progression signals"| outcomes
    orchestrator -->|"decision / model / policy versions"| reporting

    classDef existing fill:#e8f1ff,stroke:#2563eb,color:#172554;
    classDef planned fill:#fff7ed,stroke:#c2410c,color:#431407,stroke-dasharray:5 3;
    classDef externalNode fill:#f3e8ff,stroke:#7e22ce,color:#3b0764;
    class pages,tracking,context,plugin,connector,chat,local,api,rules,reasoner,providers,noaction existing;
    class activation,orchestrator,policy,result,state,outcomes,reporting,evaluation planned;
    class llm,adobe externalNode;
```

## Legend and implementation boundaries

- **Blue:** existing POC building blocks; integration presence does not establish live-service reliability.
- **Orange / dashed:** planned capability or placement. The policy algorithm already exists, but moving its authority to the backend is proposed.
- **Purple:** external services. Live provider and Adobe capabilities depend on approved configuration.
- **Solid arrows:** intended runtime interactions. **Dotted arrows:** fallback or current browser-only storage.

## Key contracts

1. **Proposal:** validated `SILENT / WAIT / ASSIST`, confidence, assistance type and observable evidence.
2. **Authorization:** proposed decision/activation IDs, context version and expiry; the browser rechecks session, route and progression before opening.
3. **Execution acknowledgement:** distinguish opening from actual message submission; match the callback, apply a timeout and cancel obsolete requests.
4. **Outcomes:** correlate lifecycle and progression using IDs. Automatic opening is not visitor acceptance; progression is not proof of causal uplift.

## Deployment and data constraints

- Keep this as a modular Next.js application initially; separate services only when scaling or ownership requires them.
- Use Node/serverless-capable hosting for the live reasoning API. GitHub Pages can host a static/mock showcase, not the server endpoint.
- LLM credentials remain server-side. Send only approved context to the reasoner and approved opening-message content to Adobe.
- Govern consent, retention and brand configuration before a pilot. Default operational telemetry to metadata rather than raw journeys or conversations.
- Do not duplicate Adobe's conversational answer system; Wanderly owns intervention timing, policy and activation orchestration.
