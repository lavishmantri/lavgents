import { Agent } from '@mastra/core/agent';
import { getModelConfig } from '../config/model';

const INTERVIEW_PREP_SYSTEM_PROMPT = `You are an expert technical interviewer preparing for candidate interviews at Zig AI.

## Your Role
You create targeted interview questions based on:
1. The candidate's resume
2. Their screening assessment (scores, concerns, claims to verify)
3. The role requirements
4. Learnings from past interviews

## Interview Philosophy
- Probe for ownership: "Did you design this or implement someone else's design?"
- Ask about failures: "What broke?" reveals truth better than "What did you build?"
- Verify claims with specifics: If they say Kubernetes, ask "How do you debug a crash-looping pod?"
- Look for depth over breadth: "Pick the one you're deepest on"

## Question Types to Generate

### 1. Ownership Verification Questions
For each major resume claim, create questions that distinguish:
- Architect (made design decisions) vs
- Senior Implementer (complex implementation) vs
- Implementer (followed specs)

### 2. Red Flag Probes
Based on screening concerns, create targeted questions:
- If AI/LLM seems weak: "Show me a system prompt you wrote"
- If infra seems conceptual: "Walk me through your deployment pipeline"
- If ownership unclear: "Who made the decision to use X?"

### 3. Depth Questions
For technologies they claim, test real understanding:
- Not "Have you used Redis?" but "Tell me about a Redis failure you debugged"
- Not "Do you know Kubernetes?" but "How do you debug a pod that's crash-looping?"

### 4. Failure/Challenge Questions
Based on their projects:
- "What was harder than you expected?"
- "What broke at scale?"
- "What would you do differently?"

### 5. Production Incident Questions
- "Describe a production incident you owned from alert to resolution"
- "When something breaks at 2am, what's your process?"

## Interview Format
- Resume Deep-Dive: ~20 minutes (hard stop)
- Coding/Technical: ~25 minutes
- Candidate Questions: ~10 minutes

## Output Format
Generate a structured interview prep document with clear questions organized by purpose.`;

export const hiringInterviewPrepAgent = new Agent({
  id: 'hiring-interview-prep-agent',
  name: 'Hiring Interview Prep Agent',
  model: getModelConfig(),
  instructions: INTERVIEW_PREP_SYSTEM_PROMPT,
});

export function getInterviewPrepPrompt(
  resumeText: string,
  screeningContent: string,
  roleFileContent: string,
  role: "backend" | "frontend"
): string {
  const codingProblem =
    role === "backend"
      ? `### Problem: Idempotent Event Processor

**Context to give candidate:**
> "At Zig, we process events from multiple sources (CRM updates, email events, etc.) that trigger AI agent actions. Events can be delivered multiple times."

**Problem statement:**
\`\`\`
Design and implement a function that processes events idempotently.
- Events have: event_id, event_type, payload, timestamp
- Same event_id should only be processed once
- Processing involves calling an external API (assume it exists)
- Handle the case where processing partially succeeds
\`\`\`

**What we're looking for:**
1. Recognizes need for persistent state (not just in-memory set)
2. Considers failure scenarios (crash after API call, before marking complete)
3. Thinks about concurrent processing of same event
4. Discusses tradeoffs (exactly-once vs at-least-once)

**Follow-ups:**
- "What if the external API is slow? How do you handle timeouts?"
- "What if two workers pick up the same event simultaneously?"
- "How would you make this scale to 10,000 events/second?"`
      : `### Problem: Real-time Sorted List Component

**Context to give candidate:**
> "At Zig, we display AI agent tasks in a priority-sorted list that updates in real-time via WebSocket."

**Problem statement:**
\`\`\`
Build a React component that:
- Displays a sorted list of tasks (by priority, then timestamp)
- Receives real-time updates via WebSocket (add, update, delete)
- Maintains sort order as items change
- Shows loading/error states appropriately
\`\`\`

**What we're looking for:**
1. Proper state management approach
2. Efficient re-sorting strategy
3. Handling of edge cases (duplicate IDs, out-of-order updates)
4. Clean component structure

**Follow-ups:**
- "What if the list has 10,000 items? How do you handle performance?"
- "How would you test this component?"
- "What if the WebSocket disconnects mid-update?"`;

  return `Create interview prep questions for this candidate.

## Resume
${resumeText}

## Screening Assessment
${screeningContent}

## Role Requirements
${roleFileContent}

---

Generate a complete interview prep document in markdown format:

# Interview Prep: [Candidate Name] | ${role === "backend" ? "Backend" : "Frontend"} Engineer

**Format:** Resume Deep-Dive (20 min) + Coding (25 min)
**Focus Areas:** [Based on screening concerns]

---

## Resume Deep-Dive (20 min)

### Opening (2 min)
> "[Opening question about their current role]"

---

### Ownership Verification Questions

#### On [Major Resume Claim 1]
- [Question probing ownership]
- [Question probing failures]
- [Question probing design decisions]
- [Counterfactual: "If you were rebuilding today..."]

#### On [Major Resume Claim 2]
...

#### On [Major Resume Claim 3] (if time)
...

---

### Red Flag Probes

#### [Concern Area 1]
- [Targeted question]
- [Follow-up if weak]

#### [Concern Area 2]
...

---

### Production Incident Question
- [Standard production incident question]
- [Follow-up about app vs infra]

---

## Coding Round (25 min)

${codingProblem}

---

### Fallback: [Simpler Problem]

If main problem seems too advanced:
\`\`\`
[Simpler problem description]
\`\`\`

---

## Evaluation Checklist

After interview, assess:
- [ ] [Key question 1 based on concerns]
- [ ] [Key question 2]
- [ ] [Key question 3]
- [ ] [Key question 4]
- [ ] [Key question 5]`;
}
