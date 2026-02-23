import { Agent } from '@mastra/core/agent';
import { getModelConfig } from '../config/model';

const SCREENING_SYSTEM_PROMPT = `You are an expert technical recruiter screening resumes for Zig AI, a startup building the orchestration layer for AI-driven sales execution.

## Your Role
You evaluate resumes against role-specific scorecards and provide structured assessments. You are thorough, evidence-based, and look for both green signals and red flags.

## Scoring Guidelines (1-5 Scale)
- 5: Exceptional - clear evidence of depth and ownership
- 4: Strong - meets criteria with concrete examples
- 3: Adequate - some relevant experience but lacks depth or specificity
- 2: Weak - tangential experience or red flags
- 1: Missing or disqualifying

## Decision Thresholds
- Average >= 4 -> MOVE_FORWARD
- Average 3-3.5 -> BORDERLINE
- Average < 3 -> REJECT

## Green Signals to Look For
- Personal ownership of production systems (clear "I" language vs "we")
- Concrete failure/debugging examples
- Hands-on cloud/infra experience (not just conceptual)
- LLM work beyond demos (prompt iteration, reliability, latency)
- Evidence of fast iteration and comfort with ambiguity

## Red Flags
- Team-level or vague ownership claims
- Theoretical knowledge only ("familiar with" vs "built")
- No production failure examples
- AI experience limited to demos/experiments
- Signs of needing stable specs or heavy process
- Inflated metrics without context

## Resume Analysis Tips
- "Architected" or "Designed" claims need scrutiny - ask "who made the decisions?"
- Impressive scale numbers (20M users, 40M records) - verify with "what broke at that scale?"
- Multiple technologies listed - probe "which did you configure vs inherit?"
- Long technology lists in skills section - depth > breadth

## Output Format
Generate a structured screening document with:
1. Candidate Overview (experience, company, location, education)
2. Scorecard with scores and evidence for each area
3. Average score and decision
4. Strengths (3-5 bullet points)
5. Concerns (3-5 bullet points)
6. Recommendation paragraph
7. Top 3 Resume Claims to Verify (with probe questions for each)

Be direct and specific. Use evidence from the resume. Don't hedge unnecessarily.`;

export const hiringScreeningAgent = new Agent({
  id: 'hiring-screening-agent',
  name: 'Hiring Screening Agent',
  model: getModelConfig(),
  instructions: SCREENING_SYSTEM_PROMPT,
});

export const BACKEND_SCORECARD_AREAS = `
## Backend Engineer Scorecard Areas
1. **Backend depth** - Production backend experience, API design, service architecture
2. **Cloud/infra hands-on** - AWS/GCP, Docker, Kubernetes, CI/CD (real deployments, not just concepts)
3. **Distributed systems** - Queues, async processing, workflows, event-driven patterns
4. **AI/LLM experience** - Production LLM work, prompt engineering, reliability handling
5. **Startup mindset** - Fast iteration, ambiguity comfort, ownership
6. **Ownership & communication** - Clear "I" ownership, production responsibility`;

export const FRONTEND_SCORECARD_AREAS = `
## Frontend Engineer Scorecard Areas
1. **React & TypeScript depth** - Framework proficiency, hooks, state management
2. **Async/state-heavy UI experience** - Polling, caching, real-time updates, loading/error states
3. **AI/workflow UI exposure** - Automation UIs, progress tracking, explainability
4. **Full-stack collaboration** - API work, backend exposure
5. **Startup mindset & ownership** - Fast iteration, end-to-end ownership
6. **Mobile experience** (optional, low weight) - React Native or mobile shipping`;

export function getScreeningPrompt(
  resumeText: string,
  role: 'backend' | 'frontend',
  roleFileContent: string,
): string {
  const scorecardAreas = role === 'backend' ? BACKEND_SCORECARD_AREAS : FRONTEND_SCORECARD_AREAS;

  return `Please screen this candidate for the ${role === 'backend' ? 'AI Backend Engineer' : 'AI Frontend Engineer'} role at Zig AI.

${scorecardAreas}

## Role Definition & Screening Guide
${roleFileContent}

## Resume Text
${resumeText}

---

Generate a complete screening assessment in markdown format. Follow the structure:

# Screening: [Candidate Name] | ${role === 'backend' ? 'Backend' : 'Frontend'} Engineer

**Date:** [Today's date YYYY-MM-DD]
**Role:** ${role === 'backend' ? 'Backend' : 'Frontend'} Engineer
**Source:** Resume review

---

## Candidate Overview

- **Experience:** [X years at Company (dates)]
- **Company:** [Company description]
- **Location:** [City]
- **Education:** [Degree, school, GPA if notable]

---

## Screening Scorecard

| Area | Score | Evidence |
|------|-------|----------|
| [Area 1] | [1-5] | [Specific evidence from resume] |
...

**Average: [X.X] -> [MOVE_FORWARD/BORDERLINE/REJECT]**

---

## Decision: [MOVE_FORWARD/BORDERLINE/REJECT] - [brief summary]

### Strengths
- [Strength 1]
- [Strength 2]
...

### Concerns
- [Concern 1]
- [Concern 2]
...

### Recommendation
[1-2 paragraph recommendation with what to verify in interview]

---

## Top 3 Resume Claims to Verify

### 1. [Claim from resume]
- [Question 1]
- [Question 2]
- [Question 3]

### 2. [Claim from resume]
...

### 3. [Claim from resume]
...`;
}
