/**
 * Fireflies.ai integration using GraphQL API.
 * Uses API key authentication (not OAuth).
 *
 * API Documentation: https://docs.fireflies.ai/
 */

const FIREFLIES_API_URL = 'https://api.fireflies.ai/graphql';

/**
 * Get the Fireflies API key from environment.
 */
function getApiKey(): string {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) {
    throw new Error('FIREFLIES_API_KEY environment variable not set');
  }
  return apiKey;
}

/**
 * Execute a GraphQL query against Fireflies API.
 */
async function graphqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(FIREFLIES_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Fireflies API error: ${response.status} ${response.statusText}`);
  }

  const result = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };

  if (result.errors && result.errors.length > 0) {
    throw new Error(`Fireflies GraphQL error: ${result.errors[0].message}`);
  }

  if (!result.data) {
    throw new Error('No data returned from Fireflies API');
  }

  return result.data;
}

// ============================================================================
// Types
// ============================================================================

export interface Transcript {
  id: string;
  title: string;
  date: string;
  duration: number;
  participants: string[];
  summary?: {
    overview?: string;
    action_items?: string[];
    keywords?: string[];
  };
  sentences?: Array<{
    speaker_name: string;
    text: string;
    start_time: number;
    end_time: number;
  }>;
}

export interface TranscriptListItem {
  id: string;
  title: string;
  date: string;
  duration: number;
  participants: string[];
}

// ============================================================================
// Transcript Operations
// ============================================================================

/**
 * List recent transcripts.
 */
export async function listTranscripts(options?: {
  limit?: number;
}): Promise<TranscriptListItem[]> {
  const query = `
    query Transcripts($limit: Int) {
      transcripts(limit: $limit) {
        id
        title
        date
        duration
        participants
      }
    }
  `;

  const result = await graphqlRequest<{ transcripts: TranscriptListItem[] }>(query, {
    limit: options?.limit || 20,
  });

  return result.transcripts;
}

/**
 * Get a specific transcript with full details.
 */
export async function getTranscript(transcriptId: string): Promise<Transcript> {
  const query = `
    query Transcript($id: String!) {
      transcript(id: $id) {
        id
        title
        date
        duration
        participants
        summary {
          overview
          action_items
          keywords
        }
        sentences {
          speaker_name
          text
          start_time
          end_time
        }
      }
    }
  `;

  const result = await graphqlRequest<{ transcript: Transcript }>(query, {
    id: transcriptId,
  });

  return result.transcript;
}

/**
 * Get transcript summary and action items only (lighter query).
 */
export async function getTranscriptSummary(
  transcriptId: string
): Promise<Pick<Transcript, 'id' | 'title' | 'date' | 'summary'>> {
  const query = `
    query TranscriptSummary($id: String!) {
      transcript(id: $id) {
        id
        title
        date
        summary {
          overview
          action_items
          keywords
        }
      }
    }
  `;

  const result = await graphqlRequest<{
    transcript: Pick<Transcript, 'id' | 'title' | 'date' | 'summary'>;
  }>(query, {
    id: transcriptId,
  });

  return result.transcript;
}

/**
 * Search transcripts by text content.
 */
export async function searchTranscripts(
  searchQuery: string,
  options?: {
    limit?: number;
  }
): Promise<TranscriptListItem[]> {
  const query = `
    query SearchTranscripts($query: String!, $limit: Int) {
      transcripts(search: $query, limit: $limit) {
        id
        title
        date
        duration
        participants
      }
    }
  `;

  const result = await graphqlRequest<{ transcripts: TranscriptListItem[] }>(query, {
    query: searchQuery,
    limit: options?.limit || 20,
  });

  return result.transcripts;
}

// ============================================================================
// User Operations
// ============================================================================

export interface FirefliesUser {
  user_id: string;
  email: string;
  name: string;
  minutes_consumed: number;
  is_admin: boolean;
}

/**
 * Get current user info.
 */
export async function getCurrentUser(): Promise<FirefliesUser> {
  const query = `
    query User {
      user {
        user_id
        email
        name
        minutes_consumed
        is_admin
      }
    }
  `;

  const result = await graphqlRequest<{ user: FirefliesUser }>(query);
  return result.user;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format transcript sentences as readable text.
 */
export function formatTranscriptText(transcript: Transcript): string {
  if (!transcript.sentences || transcript.sentences.length === 0) {
    return '';
  }

  let currentSpeaker = '';
  const lines: string[] = [];

  for (const sentence of transcript.sentences) {
    if (sentence.speaker_name !== currentSpeaker) {
      currentSpeaker = sentence.speaker_name;
      lines.push(`\n${currentSpeaker}:`);
    }
    lines.push(sentence.text);
  }

  return lines.join(' ').trim();
}

/**
 * Extract action items from a transcript.
 */
export function extractActionItems(transcript: Transcript): string[] {
  return transcript.summary?.action_items || [];
}
