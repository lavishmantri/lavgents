import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { join } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { readMdFile } from '../read-utils';
import { writeMdFile, updateMdFrontmatter } from '../write-utils';
import type { VaultConfig } from '../../config/vaults';

const exerciseSetSchema = z.object({
  reps: z.number(),
  weight_kg: z.number().optional(),
  notes: z.string().optional(),
});

const exerciseSchema = z.object({
  name: z.string().describe('Normalized lowercase-hyphenated name, e.g. barbell-bench-press'),
  sets: z.array(exerciseSetSchema),
});

/**
 * Create fitness-specific domain tools for the fitness vault agent.
 * These tools encode the vault's naming conventions, folder structure, and
 * frontmatter schemas so the LLM doesn't have to rediscover them on every call.
 */
export function createFitnessTools(vault: VaultConfig) {
  const root = vault.path;

  // ── update_daily_workout_log ──────────────────────────────────────────────

  const updateDailyWorkoutLog = createTool({
    id: 'update-daily-workout-log',
    description:
      'Write or append a workout session to the daily workout log. If a log for today already exists, new exercises are appended — existing data is never overwritten. Creates the log from the template if it is the first session of the day.',
    inputSchema: z.object({
      date: z.string().describe('Date in YYYY-MM-DD format, e.g. 2026-04-06'),
      exercises: z.array(exerciseSchema).describe('Exercises performed in this session'),
      split: z
        .enum(['push', 'pull', 'legs', 'upper', 'lower', 'full-body', 'cardio', 'rest'])
        .optional(),
      duration_min: z.number().optional(),
      mood: z.number().min(1).max(5).optional(),
      energy: z.number().min(1).max(5).optional(),
      session_notes: z.string().optional(),
    }),
    outputSchema: z.object({ savedTo: z.string(), appended: z.boolean() }),
    execute: async ({ date, exercises, split, duration_min, mood, energy, session_notes }) => {
      const [year, month] = date.split('-');
      const logDir = join(root, 'logs', year, month);
      await mkdir(logDir, { recursive: true });
      const logPath = join(logDir, `${date}.md`);

      // Build the exercises markdown block
      const exercisesBlock = exercises
        .map(ex => {
          const header = ex.name
            .split('-')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
          const rows = ex.sets
            .map((s, i) => `| ${i + 1}   | ${s.reps}    | ${s.weight_kg ?? '–'}          | ${s.notes ?? ''} |`)
            .join('\n');
          return `### ${header}\n| Set | Reps | Weight (kg) | Notes |\n|-----|------|-------------|-------|\n${rows}`;
        })
        .join('\n\n');

      let existingFile = false;
      try {
        const existing = await readMdFile(logPath);
        // Append new exercises to the existing file
        const appendBlock =
          `\n\n---\n\n${exercisesBlock}` +
          (session_notes ? `\n\n## Session Notes\n${session_notes}` : '');

        // Update frontmatter merging muscle groups and duration
        const newGroups = inferMuscleGroups(exercises);
        const existingGroups: string[] = (existing.frontmatter.muscle_groups as string[]) ?? [];
        const merged = Array.from(new Set([...existingGroups, ...newGroups]));
        const existingDuration: number = (existing.frontmatter.duration_min as number) ?? 0;

        await updateMdFrontmatter(logPath, {
          muscle_groups: merged,
          ...(duration_min != null && { duration_min: existingDuration + duration_min }),
          ...(mood != null && { mood }),
          ...(energy != null && { energy }),
        });

        const updatedContent = existing.body + appendBlock;
        await writeMdFile(logPath, { ...existing.frontmatter }, updatedContent);
        existingFile = true;
      } catch {
        // File doesn't exist — create from template
        const templatePath = join(root, 'templates', 'workout-log.md');
        let template = '';
        try {
          template = await readFile(templatePath, 'utf-8');
        } catch {
          template = ''; // no template, create fresh
        }

        const frontmatter: Record<string, unknown> = {
          date,
          type: 'workout',
          ...(split && { split }),
          muscle_groups: inferMuscleGroups(exercises),
          ...(duration_min != null && { duration_min }),
          ...(mood != null && { mood }),
          ...(energy != null && { energy }),
          notes: session_notes ?? '',
        };

        const body =
          `## Exercises\n\n${exercisesBlock}` +
          (session_notes ? `\n\n## Session Notes\n${session_notes}` : '');

        await writeMdFile(logPath, frontmatter, body);
      }

      const relativePath = join('logs', year, month, `${date}.md`);
      return { savedTo: relativePath, appended: existingFile };
    },
  });

  // ── create_workout_plan_for_week ─────────────────────────────────────────

  const createWorkoutPlanForWeek = createTool({
    id: 'create-workout-plan-for-week',
    description:
      'Create a structured weekly workout program and save it to programs/. Ask the user for goal, days per week, available equipment, and any injuries/limitations before calling this.',
    inputSchema: z.object({
      name: z.string().describe('Program name, e.g. "PPL Hypertrophy 6-Day"'),
      goal: z.enum(['hypertrophy', 'strength', 'cutting', 'maintenance']),
      days_per_week: z.number().min(1).max(7),
      split: z.array(z.string()).describe('Day labels, e.g. ["push","pull","legs","push","pull","legs","rest"]'),
      program_content: z
        .string()
        .describe('Full markdown body: each day as a section with exercises, sets, reps'),
      equipment: z.string().optional(),
      notes: z.string().optional(),
    }),
    outputSchema: z.object({ savedTo: z.string() }),
    execute: async ({ name, goal, days_per_week, split, program_content, equipment, notes }) => {
      const programsDir = join(root, 'programs');
      await mkdir(programsDir, { recursive: true });

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
      const filePath = join(programsDir, `${slug}.md`);

      const frontmatter: Record<string, unknown> = {
        type: 'program',
        name,
        days_per_week,
        split,
        goal,
        status: 'active',
        started: new Date().toISOString().slice(0, 10),
        ...(equipment && { equipment }),
        ...(notes && { notes }),
      };

      await writeMdFile(filePath, frontmatter, program_content);
      return { savedTo: `programs/${slug}.md` };
    },
  });

  // ── create_nutrition_plan_for_week ───────────────────────────────────────

  const createNutritionPlanForWeek = createTool({
    id: 'create-nutrition-plan-for-week',
    description:
      'Create a weekly nutrition/meal plan and save it to nutrition/plans/. Ask the user for calorie target, macro split, meal count, and dietary restrictions before calling this.',
    inputSchema: z.object({
      name: z.string().describe('Plan name, e.g. "Cut 2500kcal Lean Bulk"'),
      daily_calories: z.number(),
      protein_g: z.number(),
      carbs_g: z.number(),
      fat_g: z.number(),
      meals_per_day: z.number().default(4),
      plan_content: z
        .string()
        .describe('Full markdown body: daily meals, macro breakdown, grocery list'),
      restrictions: z.string().optional().describe('Dietary restrictions or preferences'),
      notes: z.string().optional(),
    }),
    outputSchema: z.object({ savedTo: z.string() }),
    execute: async ({
      name,
      daily_calories,
      protein_g,
      carbs_g,
      fat_g,
      meals_per_day,
      plan_content,
      restrictions,
      notes,
    }) => {
      const plansDir = join(root, 'nutrition', 'plans');
      await mkdir(plansDir, { recursive: true });

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
      const filePath = join(plansDir, `${slug}.md`);

      const frontmatter: Record<string, unknown> = {
        type: 'nutrition-plan',
        name,
        daily_calories,
        protein_g,
        carbs_g,
        fat_g,
        meals_per_day,
        created: new Date().toISOString().slice(0, 10),
        ...(restrictions && { restrictions }),
        ...(notes && { notes }),
      };

      await writeMdFile(filePath, frontmatter, plan_content);
      return { savedTo: `nutrition/plans/${slug}.md` };
    },
  });

  // ── log_body_metrics ─────────────────────────────────────────────────────

  const logBodyMetrics = createTool({
    id: 'log-body-metrics',
    description: 'Append a body metrics entry (weight, measurements) to progress/metrics/body-log.md.',
    inputSchema: z.object({
      date: z.string().describe('YYYY-MM-DD'),
      weight_kg: z.number().optional(),
      body_fat_pct: z.number().optional(),
      chest_cm: z.number().optional(),
      waist_cm: z.number().optional(),
      arms_cm: z.number().optional(),
      thighs_cm: z.number().optional(),
      notes: z.string().optional(),
    }),
    outputSchema: z.object({ savedTo: z.string() }),
    execute: async ({ date, weight_kg, body_fat_pct, chest_cm, waist_cm, arms_cm, thighs_cm, notes }) => {
      const metricsDir = join(root, 'progress', 'metrics');
      await mkdir(metricsDir, { recursive: true });
      const filePath = join(metricsDir, 'body-log.md');

      let existing = '';
      try {
        existing = await readFile(filePath, 'utf-8');
      } catch {
        existing = '# Body Metrics Log\n\n| Date | Weight (kg) | Body Fat % | Chest | Waist | Arms | Thighs | Notes |\n|------|-------------|------------|-------|-------|------|--------|-------|\n';
      }

      const row = `| ${date} | ${weight_kg ?? '–'} | ${body_fat_pct ?? '–'} | ${chest_cm ?? '–'} | ${waist_cm ?? '–'} | ${arms_cm ?? '–'} | ${thighs_cm ?? '–'} | ${notes ?? ''} |`;

      const updated = existing.trimEnd() + '\n' + row + '\n';
      const { writeFile } = await import('node:fs/promises');
      await writeFile(filePath, updated, 'utf-8');

      return { savedTo: 'progress/metrics/body-log.md' };
    },
  });

  return {
    updateDailyWorkoutLog,
    createWorkoutPlanForWeek,
    createNutritionPlanForWeek,
    logBodyMetrics,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function inferMuscleGroups(exercises: Array<{ name: string }>): string[] {
  const push = ['bench', 'press', 'fly', 'dip', 'tricep', 'push', 'shoulder', 'lateral', 'front-raise'];
  const pull = ['row', 'pulldown', 'pull-up', 'chin', 'curl', 'rear', 'face-pull', 'deadlift'];
  const legs = ['squat', 'leg', 'lunge', 'calf', 'hamstring', 'glute', 'rdl', 'hip'];

  const groups = new Set<string>();
  for (const ex of exercises) {
    const n = ex.name.toLowerCase();
    if (push.some(k => n.includes(k))) groups.add('push');
    if (pull.some(k => n.includes(k))) groups.add('pull');
    if (legs.some(k => n.includes(k))) groups.add('legs');
  }
  return Array.from(groups);
}
