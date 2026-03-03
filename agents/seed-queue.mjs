#!/usr/bin/env node
/**
 * Seeds the task queue from Sprint 0 tasks.
 * Run once to populate tasks/queue/ with JSON task files.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { loadConfig } from './load-config.mjs';

const QUEUE_DIR = loadConfig().tasksDir;
mkdirSync(QUEUE_DIR, { recursive: true });

const tasks = [
  // Phase 1 — Foundation
  {
    id: 'T-001', phase: 1, title: 'Confirm Expo builds on iOS and Android simulators',
    description: 'Run expo build for both platforms, fix any build errors. Ensure clean compile.',
    assignee: 'jen', files: ['LinguaFlow/app.json', 'LinguaFlow/package.json'],
    blockedBy: [],
  },
  {
    id: 'T-002', phase: 1, title: 'Configure .env files for dev/staging/prod',
    description: 'Set up .env, .env.staging, .env.production with Supabase, Cloudflare, AI API keys. Add .env to .gitignore.',
    assignee: 'roy', files: ['LinguaFlow/.env', 'LinguaFlow/.gitignore'],
    blockedBy: [],
  },
  {
    id: 'T-003', phase: 1, title: 'Set up ESLint + Prettier with pre-commit hook',
    description: 'Configure ESLint for React Native/TypeScript. Add Prettier. Set up husky pre-commit hook.',
    assignee: 'roy', files: ['LinguaFlow/.eslintrc.js', 'LinguaFlow/.prettierrc', 'LinguaFlow/package.json'],
    blockedBy: [],
  },
  {
    id: 'T-004', phase: 1, title: 'Configure Sentry for crash reporting',
    description: 'Install @sentry/react-native, configure for iOS + Android, add error boundary.',
    assignee: 'roy', files: ['LinguaFlow/src/services/sentry.ts', 'LinguaFlow/app.json'],
    blockedBy: [],
  },
  {
    id: 'T-005', phase: 1, title: 'Set up GitHub Actions CI pipeline',
    description: 'Create .github/workflows/ci.yml: lint + type-check + build on every PR.',
    assignee: 'denholm', files: ['.github/workflows/ci.yml'],
    blockedBy: [],
  },
  {
    id: 'T-006', phase: 1, title: 'Write migration: users, creators, student_profiles tables',
    description: 'Create Supabase migration with RLS policies. Users have role field. Creators have bio, avatar, stats. Students have language preferences.',
    assignee: 'roy', files: ['LinguaFlow/supabase/migrations/'],
    blockedBy: [],
  },
  {
    id: 'T-007', phase: 1, title: 'Write migration: videos, video_locations, audio_lessons, captions',
    description: 'Content tables. Videos have creator_id, status enum, transcript fields. Captions support multiple languages.',
    assignee: 'roy', files: ['LinguaFlow/supabase/migrations/'],
    blockedBy: ['T-006'],
  },
  {
    id: 'T-008', phase: 1, title: 'Write migration: question_bank, video_question_matches, contributions',
    description: 'Human-curated question bank. Questions have author_type (staff|creator), skill, CEFR level. Video matches have match_score and method.',
    assignee: 'roy', files: ['LinguaFlow/supabase/migrations/'],
    blockedBy: ['T-006'],
  },
  {
    id: 'T-009', phase: 1, title: 'Write migration: quizzes, quiz_attempts, verbal_responses',
    description: 'Quiz containers reference question_ids. Attempts track answers + score. Verbal responses store audio URLs.',
    assignee: 'roy', files: ['LinguaFlow/supabase/migrations/'],
    blockedBy: ['T-008'],
  },
  {
    id: 'T-010', phase: 1, title: 'Write migration: progress, stats, badges, gamification tables',
    description: 'student_progress, user_stats (points, streak, level), badges, user_badges. Includes XP calculation triggers.',
    assignee: 'roy', files: ['LinguaFlow/supabase/migrations/'],
    blockedBy: ['T-006'],
  },
  {
    id: 'T-011', phase: 1, title: 'Write migration: locations table with seed data',
    description: '4-level hierarchy: dialect_zone > country > region > city. Seed Spanish-speaking locations. Dialect metadata JSON.',
    assignee: 'roy', files: ['LinguaFlow/supabase/migrations/'],
    blockedBy: ['T-006'],
  },
  {
    id: 'T-012', phase: 1, title: 'Configure RLS policies for all tables',
    description: 'Students read own data. Creators read own analytics. Published content public. Admin full access.',
    assignee: 'roy', files: ['LinguaFlow/supabase/migrations/'],
    blockedBy: ['T-006', 'T-007', 'T-008', 'T-009', 'T-010'],
  },
  {
    id: 'T-013', phase: 1, title: 'Define design tokens in theme.ts',
    description: 'Colors, spacing scale, typography scale, border radii, shadows. Export as typed constants.',
    assignee: 'jen', files: ['LinguaFlow/src/constants/theme.ts'],
    blockedBy: [],
  },
  {
    id: 'T-014', phase: 1, title: 'Build core UI components (Button, Input, Card, Badge, Avatar)',
    description: 'All variants, loading states, a11y labels. Use NativeWind. Storybook-style preview if feasible.',
    assignee: 'jen', files: ['LinguaFlow/src/components/ui/'],
    blockedBy: ['T-013'],
  },
  {
    id: 'T-015', phase: 1, title: 'Build LoadingSpinner, SkeletonLoader, EmptyState, ErrorState, Toast',
    description: 'Utility UI components used across all screens. Consistent patterns.',
    assignee: 'jen', files: ['LinguaFlow/src/components/ui/'],
    blockedBy: ['T-013'],
  },

  // Phase 2 — Auth & Onboarding
  {
    id: 'T-016', phase: 2, title: 'Wire RegisterScreen to Supabase Auth',
    description: 'Email + password + role selection. Create user in Supabase. Handle errors (duplicate email, weak password).',
    assignee: 'roy', files: ['LinguaFlow/src/stores/authStore.ts', 'LinguaFlow/src/hooks/useAuth.ts'],
    blockedBy: ['T-006'],
  },
  {
    id: 'T-017', phase: 2, title: 'Wire LoginScreen to Supabase Auth',
    description: 'Email + password login. Persist session in Zustand authStore + AsyncStorage. Auto-login on relaunch.',
    assignee: 'roy', files: ['LinguaFlow/src/stores/authStore.ts'],
    blockedBy: ['T-006'],
  },
  {
    id: 'T-018', phase: 2, title: 'Wire ForgotPasswordScreen to Supabase',
    description: 'Send password reset email via Supabase. Handle success + error states.',
    assignee: 'roy', files: ['LinguaFlow/src/stores/authStore.ts'],
    blockedBy: ['T-016'],
  },
  {
    id: 'T-019', phase: 2, title: 'Implement route protection and auth redirect',
    description: 'Redirect unauthenticated users to login. Redirect based on role (student → feed, creator → dashboard).',
    assignee: 'jen', files: ['LinguaFlow/app/_layout.tsx'],
    blockedBy: ['T-016', 'T-017'],
  },
  {
    id: 'T-020', phase: 2, title: 'Build student onboarding flow',
    description: 'OnboardingScreen: language selector (Spanish ↔ English) + CEFR level picker. Save to student_profiles. Skip if profile exists.',
    assignee: 'jen', files: ['LinguaFlow/app/(student)/', 'LinguaFlow/src/components/'],
    blockedBy: ['T-016', 'T-013'],
  },
  {
    id: 'T-021', phase: 2, title: 'Build creator onboarding flow',
    description: 'Creator profile creation: display name + bio. Save to creators table. Navigate to dashboard.',
    assignee: 'jen', files: ['LinguaFlow/app/(creator)/'],
    blockedBy: ['T-016', 'T-013'],
  },

  // Phase 3 — Video Upload & AI Pipeline
  {
    id: 'T-022', phase: 3, title: 'Integrate Cloudflare Stream in storage.ts',
    description: 'Create upload URL, upload file with progress, poll processing status, get playback URL.',
    assignee: 'roy', files: ['LinguaFlow/src/services/storage.ts'],
    blockedBy: ['T-002'],
  },
  {
    id: 'T-023', phase: 3, title: 'Wire UploadScreen to storage service',
    description: 'File picker → upload progress bar → metadata form (title, language, level). Save video record to Supabase.',
    assignee: 'jen', files: ['LinguaFlow/app/(creator)/upload.tsx'],
    blockedBy: ['T-022', 'T-007'],
  },
  {
    id: 'T-024', phase: 3, title: 'Integrate Whisper API in transcription.ts',
    description: 'Send audio URL to Whisper large-v3. Get transcript + word-level timestamps. Store in video record.',
    assignee: 'moss', files: ['LinguaFlow/src/services/transcription.ts'],
    blockedBy: ['T-002'],
  },
  {
    id: 'T-025', phase: 3, title: 'Build AI question matching in ai.ts',
    description: 'Send transcript + language + level to Claude API. Match against question_bank. Return ranked question IDs.',
    assignee: 'moss', files: ['LinguaFlow/src/services/ai.ts'],
    blockedBy: ['T-002', 'T-008'],
  },
  {
    id: 'T-026', phase: 3, title: 'Seed question_bank with initial human-authored questions',
    description: 'Create seed script with 50-100 questions: Spanish/English, A1-B2, all 7 types, vocabulary + grammar + comprehension.',
    assignee: 'moss', files: ['LinguaFlow/supabase/migrations/'],
    blockedBy: ['T-008'],
  },
  {
    id: 'T-027', phase: 3, title: 'Wire EditQuizScreen to load matched questions',
    description: 'Load from video_question_matches. Display for creator review. Accept/remove/edit/add/reorder.',
    assignee: 'jen', files: ['LinguaFlow/app/(creator)/quiz-editor/'],
    blockedBy: ['T-025', 'T-014'],
  },
  {
    id: 'T-028', phase: 3, title: 'Build ReviewQuizScreen and PublishScreen',
    description: 'Preview quiz as student sees it. Publish button sets video status to published.',
    assignee: 'jen', files: ['LinguaFlow/app/(creator)/'],
    blockedBy: ['T-027'],
  },

  // Phase 4 — Student Feed & Quiz Flow
  {
    id: 'T-029', phase: 4, title: 'Wire FeedScreen to Supabase video query',
    description: 'Filter by student target_language + cefr_level. Order by published_at DESC. Infinite scroll + pull-to-refresh.',
    assignee: 'roy', files: ['LinguaFlow/src/services/videoService.ts', 'LinguaFlow/src/hooks/useVideo.ts'],
    blockedBy: ['T-007', 'T-017'],
  },
  {
    id: 'T-030', phase: 4, title: 'Build VideoCard component and wire FeedScreen UI',
    description: 'Thumbnail, title, creator, duration, level badge, view count. Skeleton loaders while loading.',
    assignee: 'jen', files: ['LinguaFlow/app/(student)/feed.tsx', 'LinguaFlow/src/components/'],
    blockedBy: ['T-029', 'T-014'],
  },
  {
    id: 'T-031', phase: 4, title: 'Wire VideoPlayerScreen with Cloudflare Stream playback',
    description: 'Load playback URL from Cloudflare. Play with expo-av. Transcript panel synced to video time.',
    assignee: 'jen', files: ['LinguaFlow/app/(student)/video/'],
    blockedBy: ['T-022', 'T-029'],
  },
  {
    id: 'T-032', phase: 4, title: 'Build all 7 quiz question components',
    description: 'MultipleChoice, FillInBlank, WordSelection, MatchingPairs, Ordering, TrueFalse, VerbalResponse.',
    assignee: 'jen', files: ['LinguaFlow/src/components/quiz/', 'LinguaFlow/app/(student)/quiz/'],
    blockedBy: ['T-014'],
  },
  {
    id: 'T-033', phase: 4, title: 'Wire QuizScreen: load quiz, display questions, score',
    description: 'Load quiz for video. One question at a time. Progress bar. Calculate score. Write quiz_attempt.',
    assignee: 'roy', files: ['LinguaFlow/src/services/quizService.ts', 'LinguaFlow/src/stores/quizStore.ts'],
    blockedBy: ['T-009', 'T-029'],
  },
  {
    id: 'T-034', phase: 4, title: 'Wire QuizResultsScreen with XP and streak',
    description: 'Display score, XP earned, streak update, review wrong answers, retake option. XP animation.',
    assignee: 'jen', files: ['LinguaFlow/app/(student)/quiz/'],
    blockedBy: ['T-032', 'T-033'],
  },
  {
    id: 'T-035', phase: 4, title: 'Implement XP and streak engine',
    description: 'XP award on quiz completion. Streak logic (increment/reset). Level calculation (XP/1000). Update user_stats.',
    assignee: 'roy', files: ['LinguaFlow/src/services/progressService.ts', 'LinguaFlow/src/utils/scoring.ts'],
    blockedBy: ['T-010', 'T-033'],
  },
];

// Write each task as a JSON file
for (const task of tasks) {
  const filename = `${task.id}.json`;
  const taskData = {
    ...task,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  writeFileSync(join(QUEUE_DIR, filename), JSON.stringify(taskData, null, 2));
}

console.log(`Seeded ${tasks.length} tasks to ${QUEUE_DIR}`);

// Show summary by agent
const byAgent = {};
for (const task of tasks) {
  byAgent[task.assignee] = (byAgent[task.assignee] || 0) + 1;
}
console.log('\nTasks by agent:');
for (const [agent, count] of Object.entries(byAgent)) {
  console.log(`  ${agent}: ${count} tasks`);
}

// Show parallelization opportunities
const unblocked = tasks.filter(t => t.blockedBy.length === 0);
console.log(`\nUnblocked tasks (can start immediately): ${unblocked.length}`);
for (const t of unblocked) {
  console.log(`  [${t.id}] ${t.title} → ${t.assignee}`);
}
