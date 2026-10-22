# Agent Watchtower — Why All 418 Records Are Currently in REVIEW

## 1. Executive Summary

The current Agent Watchtower evaluation reports:

| Result | Count |
| :--- | ---: |
| Total registry records | **418** |
| Functional groups | **24** |
| KEEP | **0** |
| REVIEW | **418** |
| RETIRE | **0** |

This does **not** mean that all 418 records are broken.

It means that, under the current evidence and the project's deliberately conservative decision rules, Watchtower does not have sufficient evidence to confidently classify any of the 418 records as KEEP or RETIRE.

The correct outcome under insufficient evidence is:

> **REVIEW**

---

# 2. The Most Important Reason

The strongest common limitation observed during the final functional-evaluation implementation is:

> **A safe, observable task interface is not currently available for the records being evaluated.**

The testing layer can determine whether a stored endpoint can be reached, but reaching an endpoint is not the same as proving that the underlying agent can perform its intended task.

The current tester therefore records:

`FUNCTIONAL_EXECUTION_NOT_AVAILABLE`

and limits quality conclusions to:

`QUALITY_EVIDENCE_LIMITED`

This prevents Watchtower from inventing task-success results.

---

# 3. Why Reachability Alone Is Not Enough

Suppose an agent URL responds successfully three times.

That proves something useful:

> The endpoint was reachable during those checks.

It does **not** prove:

- The intended agent task works.
- The agent returned a correct result.
- The result was relevant.
- The task can be executed repeatedly.
- The agent is better than a similar agent.
- The agent should be kept.
- The agent should be retired.

Therefore:

**3/3 reachable ≠ KEEP**

This is a deliberate design decision.

---

# 4. What Watchtower Can Currently Establish

The evaluation pipeline separates several levels of evidence.

### Level 1 — Reachability

Can the stored endpoint be reached?

### Level 2 — Runtime Behavior

Does the endpoint respond and what is its observed response behavior?

### Level 3 — Agent Type

Does available evidence support AGENT, WEB APP, or UNKNOWN?

### Level 4 — Functional Similarity

Does the record appear to perform a similar function to other records?

### Level 5 — Task Execution

Can Watchtower safely execute an intended task?

### Level 6 — Task Success

Did the task actually succeed?

### Level 7 — Quality

Was the result correct, relevant, and consistent?

The current fleet has useful evidence at the earlier levels, but the strongest KEEP decision requires stronger functional evidence.

---

# 5. Why the Decision Engine Does Not Automatically Mark KEEP

The KEEP rule requires strong evidence.

The implemented decision logic allows KEEP when there is evidence such as:

- At least 3 controlled task trials with a task success rate of at least 80%, with no clearly stronger equivalent; or
- Sustained monitored health meeting the configured strong-health criteria, with no significant incident and no clearly stronger equivalent.

Current evaluation evidence does not provide sufficient task-success evidence for the fleet.

Therefore the decision engine does not manufacture KEEP results.

---

# 6. Why the Decision Engine Does Not Mark RETIRE

RETIRE has an intentionally high evidence threshold.

A record should not be retired merely because:

- It failed once.
- It was temporarily unreachable.
- It is old.
- It has no backend metadata.
- It is classified as a WEB APP.
- Capabilities are not exposed.
- Functional execution is unavailable.
- Its name is similar to another record.
- It has incomplete information.

RETIRE requires strong converging evidence, including repeated failure and a stronger equivalent peer or clear redundancy.

The current fleet does not have sufficient evidence to meet that standard.

Therefore:

**0 RETIRE is the correct conservative result.**

---

# 7. Why REVIEW Is the Correct Middle State

REVIEW means:

> "This record requires more evidence or human verification before a stronger KEEP or RETIRE recommendation can responsibly be made."

It does not mean:

> "This record is broken."

It does not mean:

> "This record is useless."

It does not mean:

> "This record should be deleted."

It means:

> "Watchtower cannot responsibly make a stronger automated recommendation from the evidence currently available."

---

# 8. Records That Are Not Runnable Agent Candidates

The registry contains different kinds of records.

Not every registry row necessarily represents a runnable AI agent.

Some records can represent supporting resources or other non-agent records.

For these records, Watchtower does not pretend that a functional agent test applies.

The decision engine intentionally returns REVIEW for non-candidate records.

The reason is effectively:

> This record is not established as a runnable agent candidate, so a functional KEEP/RETIRE decision does not apply.

This is another reason why a fleet-wide RETIRE decision would be unsafe.

---

# 9. Records That Cannot Be Safely Tested

Some records cannot be safely evaluated through their stored URL.

For example, the system may encounter a URL that cannot be externally tested under the established safety rules.

In such cases, Watchtower:

- Does not invent a replacement URL.
- Does not guess a host.
- Does not probe an unsafe endpoint.
- Does not fabricate a functional result.
- Records that functional testing is not possible.
- Keeps the recommendation at REVIEW.

This is intentional.

---

# 10. Records That Are Reachable but Still REVIEW

A particularly important case is a record that is reachable.

For example:

- 3/3 reachability trials succeed.
- Average latency is measurable.
- The service responds consistently.

That is good operational evidence.

But if no safe task interface is available, Watchtower still cannot say:

> "The agent successfully performed its intended task."

Therefore the correct conclusion is still:

**REVIEW**

with a reason such as:

> "The service is reachable, but its actual task could not be safely executed and verified."

This distinction is one of the most important features of the project.

---

# 11. Why Similarity Does Not Automatically Cause Retirement

Watchtower identified:

**24 functional groups**

Some records appear to provide similar functionality.

However, similarity alone does not prove that one record should be removed.

Two records may:

- Serve different users.
- Have different implementations.
- Have different ownership.
- Have different operational environments.
- Have different task behavior.
- Have different capabilities.
- Both still be useful.

Therefore functional similarity is used for comparison, not automatic deletion.

A stronger equivalent peer becomes relevant to RETIRE only when there is also strong evidence that the current record is inferior or redundant.

---

# 12. Why Missing Backend Information Does Not Cause Retirement

The decision rules deliberately prevent the following shortcut:

> "No backend information = retire."

A record may still be a useful application even if its registry metadata does not expose the implementation details needed for Watchtower's functional execution.

Therefore missing backend information is supporting evidence only, not a retirement reason.

---

# 13. Why WEB APP Classification Does Not Cause Retirement

A WEB APP classification means:

> The available evidence looks more like a web application than a machine-readable agent interface.

It does not mean:

> The application is useless.

A web application may still provide valuable functionality.

Therefore WEB APP classification alone cannot cause RETIRE.

---

# 14. Why One Failure Does Not Cause Retirement

Networks, services, and applications can fail temporarily.

A single failed request can be caused by:

- Temporary downtime.
- Network conditions.
- Timeout.
- Service restart.
- External dependency.
- Transient infrastructure issue.

Therefore Watchtower requires repeated evidence before considering retirement.

This protects the system from making destructive recommendations based on temporary conditions.

---

# 15. Current Evidence vs. Missing Evidence

## Evidence Watchtower has

The system can observe:

- Registry information.
- Stored URLs.
- Reachability.
- Response behavior.
- Latency.
- Classification evidence.
- Functional similarity.
- Monitoring state where available.
- Controlled trial results where executed.
- Peer/group information.

## Evidence currently missing or limited

For the current fleet, the major limitation is:

- Reliable, safe task execution.
- Repeated task-success evidence.
- Strong automated quality evidence.
- Strong evidence that one equivalent agent is clearly superior to another.

Because these stronger evidence layers are limited, REVIEW is appropriate.

---

# 16. What Would Move a Record From REVIEW to KEEP?

A record can move toward KEEP when stronger evidence becomes available.

Examples:

### Strong functional evidence

At least several controlled task trials demonstrate successful task execution, with a strong success rate and no clearly stronger equivalent.

### Strong sustained operational evidence

The agent demonstrates sustained healthy monitoring performance over enough observations, without significant incidents, and there is no clearly stronger equivalent.

### Clear useful functionality

The intended task is observable and the output can be evaluated reliably.

The exact decision remains evidence-based rather than automatic based on one positive observation.

---

# 17. What Would Move a Record From REVIEW to RETIRE?

RETIRE should require strong evidence such as:

1. Repeated or persistent failure.
2. Enough observations to distinguish persistent failure from a temporary outage.
3. A stronger functionally equivalent alternative or clear redundancy.
4. Evidence that continued retention provides little or no value.
5. A human-readable reason explaining the evidence.

Only then should RETIRE become a serious recommendation.

---

# 18. Why 418 REVIEW Is a Healthy Project Outcome

The current result demonstrates that the decision layer is behaving conservatively instead of producing artificial certainty.

A weaker system might have produced:

- Many false KEEP decisions because URLs returned HTTP 200.
- Many false RETIRE decisions because task execution was unavailable.
- Duplicate decisions based only on names.
- Unsupported quality scores.
- Automatic deletion recommendations.

Agent Watchtower instead reports:

**418 REVIEW**

because it does not have enough evidence to make stronger claims.

That is a sign that the evidence controls are working.

---

# 19. Important Interpretation for Stakeholders

When presenting the result, use this wording:

> **"All 418 records are currently in REVIEW because Watchtower can observe and evaluate their available evidence, but the current agent ecosystem does not expose enough safe, verifiable task-execution evidence to confidently classify the records as KEEP or RETIRE. REVIEW therefore means further evidence or human verification is required; it does not mean that all 418 agents are broken."**

---

# 20. Final Conclusion

The current result is:

**418 REVIEW / 0 KEEP / 0 RETIRE**

The reason is not that Watchtower failed to evaluate the fleet.

The reason is that Watchtower correctly reached the boundary of what can be proven from the currently available evidence.

The system can observe the fleet, classify records, identify similar functionality, perform bounded testing where possible, and explain its decisions.

What it will not do is claim successful agent functionality without being able to observe and verify the actual task.

That is the intended behavior of the final decision-support layer.

---

## Appendix — Short Explanation

If someone asks:

**"Why are all 418 in REVIEW?"**

Answer:

> "Because Watchtower does not have enough verified functional evidence to confidently mark them as working or retire them. Many can be reached, but their actual agent tasks cannot currently be safely executed and verified. REVIEW means more evidence or human verification is needed — it does not mean they are all broken."

---

## Appendix — Evidence Status Labels

| Technical Condition | Human Meaning |
| :--- | :--- |
| `FUNCTIONAL_EXECUTION_NOT_AVAILABLE` | Task could not be tested |
| `FUNCTIONAL_TEST_NOT_POSSIBLE` | Safe functional testing was not possible |
| `QUALITY_EVIDENCE_LIMITED` | There is not enough evidence to judge output quality |
| Reachability success | Service responded; functionality is not yet proven |
| REVIEW | Evidence is insufficient for a stronger recommendation |
| KEEP | Strong evidence supports continued retention |
| RETIRE | Strong evidence supports retirement consideration |
